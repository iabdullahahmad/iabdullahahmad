import { SocialIdentityModel } from "../models/SocialIdentity";
import { DispatchRateLimitError } from "./types";
import type { DispatchPayload, DispatchResult, PlatformPublisherStrategy } from "./types";

const LINKEDIN_MAX_CHARACTERS = 3000;
const DEFAULT_LINKEDIN_API_BASE_URL = "https://api.linkedin.com";
const DEFAULT_LINKEDIN_API_VERSION = "202405";
const DEFAULT_LINKEDIN_POST_TIMEOUT_MS = 15000;

interface LinkedInCreatePostSuccessResponse {
	id?: string;
}

interface LinkedInCreatePostErrorResponse {
	message?: string;
	serviceErrorCode?: number;
	status?: number;
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

function toLinkedInPersonUrn(platformUserId: string): string {
	return platformUserId.startsWith("urn:li:person:")
		? platformUserId
		: `urn:li:person:${platformUserId}`;
}

function extractErrorMessage(bodyText: string): string {
	if (!bodyText) {
		return "No response body returned by LinkedIn API.";
	}

	try {
		const parsed = JSON.parse(bodyText) as LinkedInCreatePostErrorResponse;
		const candidate = parsed.message;

		if (candidate) {
			return candidate;
		}
	} catch {
		// Keep fallback to raw text when JSON parsing fails.
	}

	return bodyText.length > 400 ? `${bodyText.slice(0, 400)}...` : bodyText;
}

function extractLinkedInPostId(response: Response, bodyText: string): string | undefined {
	const headerId = response.headers.get("x-restli-id") ?? response.headers.get("x-linkedin-id");

	if (headerId) {
		return headerId;
	}

	if (!bodyText) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(bodyText) as LinkedInCreatePostSuccessResponse;
		return parsed.id;
	} catch {
		return undefined;
	}
}

export class LinkedInPublisherStrategy implements PlatformPublisherStrategy {
	readonly platform = "LINKEDIN" as const;

	async publish(payload: DispatchPayload): Promise<DispatchResult> {
		const linkedInIdentity = await SocialIdentityModel.findOne({ platform: this.platform }).lean();

		if (!linkedInIdentity || !linkedInIdentity.accessToken) {
			return {
				platform: this.platform,
				success: false,
				message: "Missing LinkedIn social identity access token.",
			};
		}

		if (linkedInIdentity.accessTokenExpiresAt && linkedInIdentity.accessTokenExpiresAt.getTime() <= Date.now()) {
			return {
				platform: this.platform,
				success: false,
				message: "LinkedIn access token is expired.",
			};
		}

		const text = payload.content.trim();

		if (!text) {
			return {
				platform: this.platform,
				success: false,
				message: "Cannot publish an empty LinkedIn post.",
			};
		}

		if (text.length > LINKEDIN_MAX_CHARACTERS) {
			return {
				platform: this.platform,
				success: false,
				message: `LinkedIn content exceeds ${LINKEDIN_MAX_CHARACTERS} characters.`,
			};
		}

		const linkedInApiBaseUrl = trimTrailingSlash(
			process.env.LINKEDIN_API_BASE_URL ?? DEFAULT_LINKEDIN_API_BASE_URL,
		);
		const linkedInApiVersion = process.env.LINKEDIN_API_VERSION ?? DEFAULT_LINKEDIN_API_VERSION;
		const linkedInCreatePostUrl = `${linkedInApiBaseUrl}/rest/posts`;
		const authorUrn = toLinkedInPersonUrn(linkedInIdentity.platformUserId);
		const timeoutMs = parsePositiveInteger(
			process.env.LINKEDIN_POST_TIMEOUT_MS,
			DEFAULT_LINKEDIN_POST_TIMEOUT_MS,
		);

		const abortController = new AbortController();
		const timeoutId = setTimeout(() => {
			abortController.abort();
		}, timeoutMs);

		try {
			const response = await fetch(linkedInCreatePostUrl, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${linkedInIdentity.accessToken}`,
					"Content-Type": "application/json",
					"X-Restli-Protocol-Version": "2.0.0",
					"LinkedIn-Version": linkedInApiVersion,
				},
				body: JSON.stringify({
					author: authorUrn,
					commentary: text,
					visibility: "PUBLIC",
					distribution: {
						feedDistribution: "MAIN_FEED",
						targetEntities: [],
						thirdPartyDistributionChannels: [],
					},
					lifecycleState: "PUBLISHED",
					isReshareDisabledByAuthor: false,
				}),
				signal: abortController.signal,
			});

			const responseText = await response.text();

			if (response.status === 429) {
				const detail = extractErrorMessage(responseText);

				throw new DispatchRateLimitError(
					this.platform,
					`LinkedIn API rate limited request: ${detail}`,
					429,
				);
			}

			if (!response.ok) {
				const detail = extractErrorMessage(responseText);

				return {
					platform: this.platform,
					success: false,
					message: `LinkedIn API rejected request (${response.status}): ${detail}`,
				};
			}

			const linkedInPostId = extractLinkedInPostId(response, responseText);

			return {
				platform: this.platform,
				success: true,
				message:
					payload.mediaUrls.length > 0
						? "Published to LinkedIn. Note: media URL publishing is not wired yet for LinkedIn media upload."
						: "Published to LinkedIn successfully.",
				externalPostId: linkedInPostId,
			};
		} catch (error) {
			if (error instanceof DispatchRateLimitError) {
				throw error;
			}

			const message = error instanceof Error ? error.message : "Unknown network error.";

			return {
				platform: this.platform,
				success: false,
				message: `LinkedIn API request failed: ${message}`,
			};
		} finally {
			clearTimeout(timeoutId);
		}
	}
}
