import type { SocialPlatform } from "../models/types";
import { InstagramPublisherStrategy } from "./instagram";
import { LinkedInPublisherStrategy } from "./linkedin";
import { TwitterPublisherStrategy } from "./twitter";
import { DispatchRateLimitError } from "./types";
import type { DispatchPayload, DispatchResult, PlatformPublisherStrategy } from "./types";

export class PlatformDispatcher {
	private readonly strategyMap = new Map<SocialPlatform, PlatformPublisherStrategy>();

	constructor(strategies: PlatformPublisherStrategy[]) {
		for (const strategy of strategies) {
			this.strategyMap.set(strategy.platform, strategy);
		}
	}

	async dispatchToPlatforms(targetPlatforms: SocialPlatform[], payload: DispatchPayload): Promise<DispatchResult[]> {
		const results: DispatchResult[] = [];

		for (const platform of targetPlatforms) {
			const strategy = this.strategyMap.get(platform);

			if (!strategy) {
				results.push({
					platform,
					success: false,
					message: `No dispatch strategy registered for platform '${platform}'.`,
				});

				continue;
			}

			try {
				const result = await strategy.publish(payload);
				results.push(result);
			} catch (error) {
				if (error instanceof DispatchRateLimitError) {
					throw error;
				}

				results.push({
					platform,
					success: false,
					message: error instanceof Error ? error.message : "Unknown dispatch error.",
				});
			}
		}

		return results;
	}
}

export function createDefaultPlatformDispatcher(): PlatformDispatcher {
	return new PlatformDispatcher([
		new TwitterPublisherStrategy(),
		new LinkedInPublisherStrategy(),
		new InstagramPublisherStrategy(),
	]);
}