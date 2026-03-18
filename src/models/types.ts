export const SOCIAL_PLATFORMS = ["X", "LINKEDIN", "INSTAGRAM"] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const POST_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "FAILED"] as const;

export type PostStatus = (typeof POST_STATUSES)[number];