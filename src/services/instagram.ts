import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Cookie, type Page } from "playwright";
import { SocialIdentityModel } from "../models/SocialIdentity";
import { DispatchRateLimitError } from "./types";
import type { DispatchPayload, DispatchResult, PlatformPublisherStrategy } from "./types";

const DEFAULT_INSTAGRAM_BASE_URL = "https://www.instagram.com";
const DEFAULT_INSTAGRAM_ACTION_TIMEOUT_MS = 30000;
const DEFAULT_INSTAGRAM_NAVIGATION_TIMEOUT_MS = 45000;
const DEFAULT_INSTAGRAM_DOWNLOAD_TIMEOUT_MS = 30000;

interface InstagramCookieInput {
	name?: unknown;
	value?: unknown;
	domain?: unknown;
	path?: unknown;
	httpOnly?: unknown;
	secure?: unknown;
	sameSite?: unknown;
	expires?: unknown;
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

function parseBooleanEnv(rawValue: string | undefined, fallbackValue: boolean): boolean {
	if (!rawValue) {
		return fallbackValue;
	}

	const normalized = rawValue.trim().toLowerCase();

	if (["1", "true", "yes", "on"].includes(normalized)) {
		return true;
	}

	if (["0", "false", "no", "off"].includes(normalized)) {
		return false;
	}

	return fallbackValue;
}

function trimTrailingSlash(rawValue: string): string {
	return rawValue.endsWith("/") ? rawValue.slice(0, -1) : rawValue;
}

function inferExtension(mediaUrl: string, contentType: string | null): string {
	const normalizedType = (contentType ?? "").toLowerCase();

	if (normalizedType.includes("image/jpeg") || normalizedType.includes("image/jpg")) {
		return ".jpg";
	}

	if (normalizedType.includes("image/png")) {
		return ".png";
	}

	if (normalizedType.includes("image/webp")) {
		return ".webp";
	}

	if (normalizedType.includes("video/mp4")) {
		return ".mp4";
	}

	try {
		const pathname = new URL(mediaUrl).pathname;
		const extension = path.extname(pathname);

		if (extension.length >= 2 && extension.length <= 5) {
			return extension;
		}
	} catch {
		// Ignore malformed URLs and fallback to .jpg.
	}

	return ".jpg";
}

function normalizeCookie(input: InstagramCookieInput): Cookie | null {
	if (typeof input.name !== "string" || !input.name || typeof input.value !== "string") {
		return null;
	}

	const sameSiteCandidate: "Lax" | "Strict" | "None" =
		input.sameSite === "Lax" || input.sameSite === "Strict" || input.sameSite === "None"
			? input.sameSite
			: "None";

	return {
		name: input.name,
		value: input.value,
		domain: typeof input.domain === "string" && input.domain ? input.domain : ".instagram.com",
		path: typeof input.path === "string" && input.path ? input.path : "/",
		httpOnly: typeof input.httpOnly === "boolean" ? input.httpOnly : true,
		secure: typeof input.secure === "boolean" ? input.secure : true,
		sameSite: sameSiteCandidate,
		expires: typeof input.expires === "number" ? input.expires : -1,
	};
}

function resolveInstagramCookies(sessionId: string | null, cookiesJson: string | undefined): Cookie[] {
	if (cookiesJson) {
		try {
			const parsed = JSON.parse(cookiesJson) as unknown;

			if (Array.isArray(parsed)) {
				const cookies = parsed
					.map((cookieCandidate) => normalizeCookie(cookieCandidate as InstagramCookieInput))
					.filter((cookie): cookie is Cookie => cookie !== null);

				if (cookies.length > 0) {
					return cookies;
				}
			}
		} catch {
			// Fallback to session ID cookie if JSON is malformed.
		}
	}

	if (!sessionId) {
		return [];
	}

	return [
		{
			name: "sessionid",
			value: sessionId,
			domain: ".instagram.com",
			path: "/",
			httpOnly: true,
			secure: true,
			sameSite: "None",
			expires: -1,
		},
	];
}

async function downloadMediaToTempFile(mediaUrl: string, timeoutMs: number): Promise<{ tempDirPath: string; filePath: string }> {
	const abortController = new AbortController();
	const timeoutId = setTimeout(() => {
		abortController.abort();
	}, timeoutMs);

	try {
		const response = await fetch(mediaUrl, {
			signal: abortController.signal,
		});

		if (response.status === 429) {
			throw new DispatchRateLimitError("INSTAGRAM", "Media download was rate limited.", 429);
		}

		if (!response.ok) {
			throw new Error(`Failed to download media (${response.status} ${response.statusText}).`);
		}

		const extension = inferExtension(mediaUrl, response.headers.get("content-type"));
		const tempDirPath = await mkdtemp(path.join(tmpdir(), "instagram-upload-"));
		const filePath = path.join(tempDirPath, `media-${randomUUID()}${extension}`);

		const buffer = Buffer.from(await response.arrayBuffer());
		await writeFile(filePath, buffer);

		return {
			tempDirPath,
			filePath,
		};
	} finally {
		clearTimeout(timeoutId);
	}
}

async function clickButtonByNames(page: Page, names: string[], timeoutMs: number): Promise<boolean> {
	for (const name of names) {
		const button = page.getByRole("button", { name, exact: false }).first();

		const visible = await button.isVisible({ timeout: 1200 }).catch(() => false);

		if (!visible) {
			continue;
		}

		await button.click({ timeout: timeoutMs });
		return true;
	}

	return false;
}

async function clickFirstVisibleSelector(page: Page, selectors: string[], timeoutMs: number): Promise<boolean> {
	for (const selector of selectors) {
		const target = page.locator(selector).first();

		const visible = await target.isVisible({ timeout: 1200 }).catch(() => false);

		if (!visible) {
			continue;
		}

		await target.click({ timeout: timeoutMs });
		return true;
	}

	return false;
}

async function containsPageText(page: Page, phrases: string[]): Promise<boolean> {
	return page
		.evaluate((candidatePhrases) => {
			const bodyText = (document.body?.innerText ?? "").toLowerCase();
			return candidatePhrases.some((phrase) => bodyText.includes(phrase.toLowerCase()));
		}, phrases)
		.catch(() => false);
}

export class InstagramPublisherStrategy implements PlatformPublisherStrategy {
	readonly platform = "INSTAGRAM" as const;

	private async dismissInterruptionDialogs(page: Page, timeoutMs: number): Promise<void> {
		await clickButtonByNames(
			page,
			[
				"Allow all cookies",
				"Only allow essential cookies",
				"Not now",
				"Cancel",
				"Close",
			],
			timeoutMs,
		);
	}

	private async isLoginPromptVisible(page: Page): Promise<boolean> {
		const usernameInputVisible = await page.locator("input[name='username']").first().isVisible({ timeout: 800 }).catch(() => false);

		if (usernameInputVisible) {
			return true;
		}

		return containsPageText(page, ["log in", "login"]);
	}

	private async openCreateComposer(page: Page, baseUrl: string, timeoutMs: number): Promise<void> {
		const createSelectors = [
			"a[href='/create/style/']",
			"div[role='button'][aria-label='New post']",
			"svg[aria-label='New post']",
			"button[aria-label='New post']",
		];

		const clicked = await clickFirstVisibleSelector(page, createSelectors, timeoutMs);

		if (!clicked) {
			await page.goto(`${baseUrl}/create/style/`, {
				waitUntil: "domcontentloaded",
				timeout: timeoutMs,
			});
		}

		await page.locator("input[type='file']").first().waitFor({
			state: "visible",
			timeout: timeoutMs,
		});
	}

	private async setCaption(page: Page, caption: string, timeoutMs: number): Promise<void> {
		const captionSelectors = ["textarea[aria-label='Write a caption...']", "div[role='textbox']"];

		for (const selector of captionSelectors) {
			const field = page.locator(selector).first();
			const visible = await field.isVisible({ timeout: 1200 }).catch(() => false);

			if (!visible) {
				continue;
			}

			if (selector.startsWith("textarea")) {
				await field.fill(caption, { timeout: timeoutMs });
			} else {
				await field.click({ timeout: timeoutMs });
				await field.fill(caption, { timeout: timeoutMs });
			}

			return;
		}

		throw new Error("Instagram caption field was not found.");
	}

	private async waitForPublishCompletion(page: Page, timeoutMs: number): Promise<boolean> {
		return page
			.waitForFunction(
				(successPhrases) => {
					const bodyText = (document.body?.innerText ?? "").toLowerCase();
					return successPhrases.some((phrase) => bodyText.includes(phrase.toLowerCase()));
				},
				["your post has been shared", "post shared", "your reel has been shared"],
				{ timeout: timeoutMs },
			)
			.then(() => true)
			.catch(() => false);
	}

	async publish(payload: DispatchPayload): Promise<DispatchResult> {
		const instagramIdentity = await SocialIdentityModel.findOne({ platform: this.platform }).lean();

		if (!instagramIdentity) {
			return {
				platform: this.platform,
				success: false,
				message: "Missing Instagram social identity configuration.",
			};
		}

		if (!payload.mediaUrls.length) {
			return {
				platform: this.platform,
				success: false,
				message: "Instagram personal posting requires at least one media URL.",
			};
		}

		const caption = payload.content.trim();

		if (!caption) {
			return {
				platform: this.platform,
				success: false,
				message: "Cannot publish an empty Instagram caption.",
			};
		}

		const baseUrl = trimTrailingSlash(process.env.INSTAGRAM_BASE_URL ?? DEFAULT_INSTAGRAM_BASE_URL);
		const actionTimeoutMs = parsePositiveInteger(
			process.env.INSTAGRAM_ACTION_TIMEOUT_MS,
			DEFAULT_INSTAGRAM_ACTION_TIMEOUT_MS,
		);
		const navigationTimeoutMs = parsePositiveInteger(
			process.env.INSTAGRAM_NAVIGATION_TIMEOUT_MS,
			DEFAULT_INSTAGRAM_NAVIGATION_TIMEOUT_MS,
		);
		const downloadTimeoutMs = parsePositiveInteger(
			process.env.INSTAGRAM_DOWNLOAD_TIMEOUT_MS,
			DEFAULT_INSTAGRAM_DOWNLOAD_TIMEOUT_MS,
		);
		const headless = parseBooleanEnv(process.env.INSTAGRAM_HEADLESS, true);
		const sessionId = (process.env.INSTAGRAM_SESSION_ID ?? instagramIdentity.accessToken ?? "").trim() || null;
		const cookies = resolveInstagramCookies(sessionId, process.env.INSTAGRAM_SESSION_COOKIES_JSON);

		if (!cookies.length) {
			return {
				platform: this.platform,
				success: false,
				message: "No Instagram session cookies available. Provide INSTAGRAM_SESSION_ID or INSTAGRAM_SESSION_COOKIES_JSON.",
			};
		}

		let browser: Browser | undefined;
		let context: BrowserContext | undefined;
		let tempDirPath: string | undefined;
		let sawRateLimitResponse = false;

		try {
			browser = await chromium.launch({
				headless,
			});

			context = await browser.newContext();
			await context.addCookies(cookies);

			const page = await context.newPage();
			page.setDefaultTimeout(actionTimeoutMs);
			page.setDefaultNavigationTimeout(navigationTimeoutMs);

			page.on("response", (response) => {
				if (response.status() === 429) {
					sawRateLimitResponse = true;
				}
			});

			await page.goto(`${baseUrl}/`, {
				waitUntil: "domcontentloaded",
				timeout: navigationTimeoutMs,
			});

			await this.dismissInterruptionDialogs(page, actionTimeoutMs);

			if (await this.isLoginPromptVisible(page)) {
				return {
					platform: this.platform,
					success: false,
					message: "Instagram session is not authenticated. Refresh session cookies.",
				};
			}

			const primaryMediaUrl = payload.mediaUrls[0];
			const downloadedMedia = await downloadMediaToTempFile(primaryMediaUrl, downloadTimeoutMs);
			tempDirPath = downloadedMedia.tempDirPath;

			await this.openCreateComposer(page, baseUrl, navigationTimeoutMs);
			await page.locator("input[type='file']").first().setInputFiles(downloadedMedia.filePath);

			await page.waitForTimeout(1000);
			await clickButtonByNames(page, ["Next"], actionTimeoutMs);
			await page.waitForTimeout(700);
			await clickButtonByNames(page, ["Next"], actionTimeoutMs);

			await this.setCaption(page, caption, actionTimeoutMs);

			const shareClicked = await clickButtonByNames(page, ["Share"], actionTimeoutMs);

			if (!shareClicked) {
				throw new Error("Instagram Share button was not found.");
			}

			const publishCompleted = await this.waitForPublishCompletion(page, actionTimeoutMs);
			const sawRateLimitCopy = await containsPageText(page, [
				"try again later",
				"please wait a few minutes",
				"we restrict certain activity",
			]);

			if (sawRateLimitResponse || sawRateLimitCopy) {
				throw new DispatchRateLimitError(
					this.platform,
					"Instagram automation was rate limited.",
					429,
				);
			}

			if (!publishCompleted) {
				return {
					platform: this.platform,
					success: false,
					message: "Instagram publish confirmation was not detected.",
				};
			}

			return {
				platform: this.platform,
				success: true,
				message:
					payload.mediaUrls.length > 1
						? "Published to Instagram using the first media URL. Multi-media upload is not wired yet."
						: "Published to Instagram successfully.",
			};
		} catch (error) {
			if (error instanceof DispatchRateLimitError) {
				throw error;
			}

			const message = error instanceof Error ? error.message : "Unknown Instagram automation error.";

			if (/\b429\b|rate\s*limit|too many requests|try again later/i.test(message)) {
				throw new DispatchRateLimitError(
					this.platform,
					`Instagram automation was rate limited: ${message}`,
					429,
				);
			}

			return {
				platform: this.platform,
				success: false,
				message: `Instagram automation failed: ${message}`,
			};
		} finally {
			if (tempDirPath) {
				await rm(tempDirPath, { recursive: true, force: true }).catch(() => {
					// Ignore temporary cleanup failures.
				});
			}

			if (context) {
				await context.close().catch(() => {
					// Ignore context close errors.
				});
			}

			if (browser) {
				await browser.close().catch(() => {
					// Ignore browser close errors.
				});
			}
		}
	}
}
