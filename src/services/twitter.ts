import { SocialIdentityModel } from "../models/SocialIdentity";
import { DispatchRateLimitError } from "./types";
import type { DispatchPayload, DispatchResult, PlatformPublisherStrategy } from "./types";

const X_MAX_CHARACTERS = 280;
const DEFAULT_X_API_BASE_URL = "https://api.x.com/2";
const DEFAULT_X_POST_TIMEOUT_MS = 15000;

interface XCreatePostSuccessResponse {
	data?: {
		id?: string;
		text?: string;
	};
}

interface XCreatePostErrorResponse {
	title?: string;
	detail?: string;
	errors?: Array<{
		message?: string;
	}>;
}

function parsePositiveInteger(rawValue: string | undefined, fallbackValue: number): number {
	if (!rawValue) {
		return fallbackValue;
	}

	const parsed = Number(rawValue);

	if (!Number.isInteger(parsed) || parsed <= 0) {
		return fallbackValue;
	}

	return parsed;
}

function trimTrailingSlash(rawValue: string): string {
	return rawValue.endsWith("/") ? rawValue.slice(0, -1) : rawValue;
}

function extractErrorMessage(bodyText: string): string {
	if (!bodyText) {
		return "No response body returned by X API.";
	}

	try {
		const parsed = JSON.parse(bodyText) as XCreatePostErrorResponse;
		const candidate = parsed.detail ?? parsed.title ?? parsed.errors?.[0]?.message;

		if (candidate) {
			return candidate;
		}
	} catch {
		// Keep fallback to raw text when JSON parsing fails.
	}

	return bodyText.length > 400 ? `${bodyText.slice(0, 400)}...` : bodyText;
}

function extractTweetId(bodyText: string): string | undefined {
	if (!bodyText) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(bodyText) as XCreatePostSuccessResponse;
		return parsed.data?.id;
	} catch {
		return undefined;
	}
}

export class TwitterPublisherStrategy implements PlatformPublisherStrategy {
	readonly platform = "X" as const;

	async publish(payload: DispatchPayload): Promise<DispatchResult> {
		const xIdentity = await SocialIdentityModel.findOne({ platform: this.platform }).lean();

		if (!xIdentity || !xIdentity.accessToken) {
			return {
				platform: this.platform,
				success: false,
				message: "Missing X social identity access token.",
			};
		}

		if (xIdentity.accessTokenExpiresAt && xIdentity.accessTokenExpiresAt.getTime() <= Date.now()) {
			return {
				platform: this.platform,
				success: false,
				message: "X access token is expired.",
			};
		}

		const text = payload.content.trim();

		if (!text) {
			return {
				platform: this.platform,
				success: false,
				message: "Cannot publish an empty X post.",
			};
		}

		if (text.length > X_MAX_CHARACTERS) {
			return {
				platform: this.platform,
				success: false,
				message: `X content exceeds ${X_MAX_CHARACTERS} characters.`,
			};
		}

		const xApiBaseUrl = trimTrailingSlash(process.env.X_API_BASE_URL ?? DEFAULT_X_API_BASE_URL);
		const xCreatePostUrl = `${xApiBaseUrl}/tweets`;
		const timeoutMs = parsePositiveInteger(process.env.X_POST_TIMEOUT_MS, DEFAULT_X_POST_TIMEOUT_MS);

		const abortController = new AbortController();
		const timeoutId = setTimeout(() => {
			abortController.abort();
		}, timeoutMs);

		try {
			const response = await fetch(xCreatePostUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${xIdentity.accessToken}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					text,
				}),
				signal: abortController.signal,
			});

			const responseText = await response.text();

			if (response.status === 429) {
				const detail = extractErrorMessage(responseText);

				throw new DispatchRateLimitError(
					this.platform,
					`X API rate limited request: ${detail}`,
					429,
				);
			}

			if (!response.ok) {
				const detail = extractErrorMessage(responseText);

				return {
					platform: this.platform,
					success: false,
					message: `X API rejected request (${response.status}): ${detail}`,
				};
			}

			const tweetId = extractTweetId(responseText);

			return {
				platform: this.platform,
				success: true,
				message:
					payload.mediaUrls.length > 0
						? "Published to X. Note: media URL publishing is not wired yet for X API media upload."
						: "Published to X successfully.",
				externalPostId: tweetId,
			};
		} catch (error) {
			if (error instanceof DispatchRateLimitError) {
				throw error;
			}

			const message = error instanceof Error ? error.message : "Unknown network error.";

			return {
				platform: this.platform,
				success: false,
				message: `X API request failed: ${message}`,
			};
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
