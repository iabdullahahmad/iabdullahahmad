import type { SocialPlatform } from "../models/types";

export interface DispatchPayload {
	postId: string;
	content: string;
	mediaUrls: string[];
	targetPlatforms: SocialPlatform[];
	scheduledExecutionTime: Date;
}

export interface DispatchResult {
	platform: SocialPlatform;
	success: boolean;
	message: string;
	externalPostId?: string;
}

export interface PlatformPublisherStrategy {
	readonly platform: SocialPlatform;
	publish(payload: DispatchPayload): Promise<DispatchResult>;
}

export class DispatchRateLimitError extends Error {
	readonly platform: SocialPlatform;
	readonly statusCode: number;

	constructor(platform: SocialPlatform, message: string, statusCode = 429) {
		super(message);
		this.name = "DispatchRateLimitError";
		this.platform = platform;
		this.statusCode = statusCode;
	}
}