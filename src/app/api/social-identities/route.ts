import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { SocialIdentityModel } from "@/models/SocialIdentity";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/models/types";

interface SocialIdentityStatus {
	platform: SocialPlatform;
	connected: boolean;
	platformUserIdMasked?: string;
	updatedAt?: string;
}

interface GetSocialIdentitiesSuccessResponse {
	status: "SUCCESS";
	identities: SocialIdentityStatus[];
}

interface SocialIdentityMutationSuccessResponse {
	status: "SUCCESS";
	message: string;
	identity: SocialIdentityStatus;
}

interface SocialIdentityErrorResponse {
	status: "FAILED";
	message: string;
	error?: string;
}

interface UpsertSocialIdentityRequestBody {
	platform?: unknown;
	platformUserId?: unknown;
	accessToken?: unknown;
	refreshToken?: unknown;
	scopes?: unknown;
	accessTokenExpiresAt?: unknown;
	refreshTokenExpiresAt?: unknown;
}

function isSocialPlatform(value: string): value is SocialPlatform {
	return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function createDisconnectedIdentityMap(): Record<SocialPlatform, SocialIdentityStatus> {
	return {
		X: {
			platform: "X",
			connected: false,
		},
		LINKEDIN: {
			platform: "LINKEDIN",
			connected: false,
		},
		INSTAGRAM: {
			platform: "INSTAGRAM",
			connected: false,
		},
	};
}

function maskUserId(rawValue: string): string {
	if (rawValue.length <= 4) {
		return "****";
	}

	return `${rawValue.slice(0, 2)}***${rawValue.slice(-2)}`;
}

function toOptionalDate(rawValue: unknown): { value?: Date; shouldUnset: boolean; error?: string } {
	if (rawValue === undefined || rawValue === null) {
		return {
			shouldUnset: true,
		};
	}

	if (typeof rawValue !== "string") {
		return {
			shouldUnset: false,
			error: "Date fields must be ISO date strings when provided.",
		};
	}

	const trimmed = rawValue.trim();

	if (!trimmed) {
		return {
			shouldUnset: true,
		};
	}

	const parsed = new Date(trimmed);

	if (Number.isNaN(parsed.getTime())) {
		return {
			shouldUnset: false,
			error: `Invalid date value: ${trimmed}`,
		};
	}

	return {
		value: parsed,
		shouldUnset: false,
	};
}

function normalizeScopes(rawValue: unknown): { value?: string[]; error?: string } {
	if (rawValue === undefined || rawValue === null) {
		return {
			value: [],
		};
	}

	if (Array.isArray(rawValue)) {
		if (rawValue.some((item) => typeof item !== "string")) {
			return {
				error: "Field 'scopes' must be an array of strings.",
			};
		}

		return {
			value: rawValue
				.map((item) => item.trim())
				.filter((item) => item.length > 0),
		};
	}

	if (typeof rawValue === "string") {
		return {
			value: rawValue
				.split(",")
				.map((item) => item.trim())
				.filter((item) => item.length > 0),
		};
	}

	return {
		error: "Field 'scopes' must be an array of strings or a comma-separated string.",
	};
}

function parseUpsertBody(rawBody: unknown): {
	value?: {
		platform: SocialPlatform;
		platformUserId: string;
		accessToken: string;
		refreshToken?: string;
		scopes: string[];
		accessTokenExpiresAt?: Date;
		refreshTokenExpiresAt?: Date;
		unsetAccessTokenExpiresAt: boolean;
		unsetRefreshTokenExpiresAt: boolean;
		unsetRefreshToken: boolean;
	};
	error?: string;
} {
	if (!rawBody || typeof rawBody !== "object") {
		return {
			error: "Request body must be a JSON object.",
		};
	}

	const body = rawBody as UpsertSocialIdentityRequestBody;
	const platform = typeof body.platform === "string" ? body.platform.trim().toUpperCase() : "";

	if (!platform || !isSocialPlatform(platform)) {
		return {
			error: `Field 'platform' is required and must be one of: ${SOCIAL_PLATFORMS.join(", ")}.`,
		};
	}

	const platformUserId = typeof body.platformUserId === "string" ? body.platformUserId.trim() : "";

	if (!platformUserId) {
		return {
			error: "Field 'platformUserId' is required.",
		};
	}

	const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";

	if (!accessToken) {
		return {
			error: "Field 'accessToken' is required.",
		};
	}

	const refreshTokenCandidate = typeof body.refreshToken === "string" ? body.refreshToken.trim() : undefined;
	const normalizedScopes = normalizeScopes(body.scopes);

	if (!normalizedScopes.value) {
		return {
			error: normalizedScopes.error ?? "Invalid scopes field.",
		};
	}

	const accessTokenExpiry = toOptionalDate(body.accessTokenExpiresAt);

	if (accessTokenExpiry.error) {
		return {
			error: accessTokenExpiry.error,
		};
	}

	const refreshTokenExpiry = toOptionalDate(body.refreshTokenExpiresAt);

	if (refreshTokenExpiry.error) {
		return {
			error: refreshTokenExpiry.error,
		};
	}

	return {
		value: {
			platform,
			platformUserId,
			accessToken,
			refreshToken: refreshTokenCandidate,
			scopes: normalizedScopes.value,
			accessTokenExpiresAt: accessTokenExpiry.value,
			refreshTokenExpiresAt: refreshTokenExpiry.value,
			unsetAccessTokenExpiresAt: accessTokenExpiry.shouldUnset,
			unsetRefreshTokenExpiresAt: refreshTokenExpiry.shouldUnset,
			unsetRefreshToken: !refreshTokenCandidate,
		},
	};
}

function toIdentityStatus(identity: {
	platform: SocialPlatform;
	platformUserId?: string;
	updatedAt?: Date;
}): SocialIdentityStatus {
	return {
		platform: identity.platform,
		connected: true,
		platformUserIdMasked: identity.platformUserId ? maskUserId(identity.platformUserId) : undefined,
		updatedAt: identity.updatedAt?.toISOString(),
	};
}

export async function GET(): Promise<Response> {
	try {
		await connectToDatabase();

		const identities = await SocialIdentityModel.find({})
			.select("platform platformUserId updatedAt")
			.lean();

		const disconnectedMap = createDisconnectedIdentityMap();

		for (const identity of identities) {
			disconnectedMap[identity.platform] = toIdentityStatus(identity);
		}

		return NextResponse.json<GetSocialIdentitiesSuccessResponse>(
			{
				status: "SUCCESS",
				identities: SOCIAL_PLATFORMS.map((platform) => disconnectedMap[platform]),
			},
			{
				status: 200,
			},
		);
	} catch (error) {
		return NextResponse.json<SocialIdentityErrorResponse>(
			{
				status: "FAILED",
				message: "Unable to fetch social account connection status.",
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{
				status: 500,
			},
		);
	}
}

export async function POST(request: NextRequest): Promise<Response> {
	let parsedBody: unknown;

	try {
		parsedBody = await request.json();
	} catch {
		return NextResponse.json<SocialIdentityErrorResponse>(
			{
				status: "FAILED",
				message: "Request body must be valid JSON.",
			},
			{
				status: 400,
			},
		);
	}

	const validationResult = parseUpsertBody(parsedBody);

	if (!validationResult.value) {
		return NextResponse.json<SocialIdentityErrorResponse>(
			{
				status: "FAILED",
				message: validationResult.error ?? "Invalid request payload.",
			},
			{
				status: 400,
			},
		);
	}

	const payload = validationResult.value;

	try {
		await connectToDatabase();

		const setPayload: {
			platform: SocialPlatform;
			platformUserId: string;
			accessToken: string;
			scopes: string[];
			refreshToken?: string;
			accessTokenExpiresAt?: Date;
			refreshTokenExpiresAt?: Date;
		} = {
			platform: payload.platform,
			platformUserId: payload.platformUserId,
			accessToken: payload.accessToken,
			scopes: payload.scopes,
		};

		if (payload.refreshToken) {
			setPayload.refreshToken = payload.refreshToken;
		}

		if (payload.accessTokenExpiresAt) {
			setPayload.accessTokenExpiresAt = payload.accessTokenExpiresAt;
		}

		if (payload.refreshTokenExpiresAt) {
			setPayload.refreshTokenExpiresAt = payload.refreshTokenExpiresAt;
		}

		const unsetPayload: Record<string, ""> = {};

		if (payload.unsetRefreshToken) {
			unsetPayload.refreshToken = "";
		}

		if (payload.unsetAccessTokenExpiresAt) {
			unsetPayload.accessTokenExpiresAt = "";
		}

		if (payload.unsetRefreshTokenExpiresAt) {
			unsetPayload.refreshTokenExpiresAt = "";
		}

		const updatedIdentity = await SocialIdentityModel.findOneAndUpdate(
			{ platform: payload.platform },
			Object.keys(unsetPayload).length > 0
				? {
					$set: setPayload,
					$unset: unsetPayload,
				}
				: {
					$set: setPayload,
				},
			{
				upsert: true,
				new: true,
				runValidators: true,
				setDefaultsOnInsert: true,
			},
		)
			.select("platform platformUserId updatedAt")
			.lean();

		if (!updatedIdentity) {
			throw new Error("Failed to upsert social identity.");
		}

		return NextResponse.json<SocialIdentityMutationSuccessResponse>(
			{
				status: "SUCCESS",
				message: `${payload.platform} credentials saved successfully.`,
				identity: toIdentityStatus(updatedIdentity),
			},
			{
				status: 200,
			},
		);
	} catch (error) {
		return NextResponse.json<SocialIdentityErrorResponse>(
			{
				status: "FAILED",
				message: "Unable to save social account credentials.",
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{
				status: 500,
			},
		);
	}
}
