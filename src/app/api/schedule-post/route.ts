import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { PostModel } from "@/models/Post";
import { SocialIdentityModel } from "@/models/SocialIdentity";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/models/types";

interface SchedulePostRequestBody {
	content: string;
	mediaUrls: string[];
	targetPlatforms: SocialPlatform[];
	scheduledExecutionTime: Date;
}

interface SchedulePostSuccessResponse {
	status: "SUCCESS";
	message: string;
	postId: string;
	queueStatus: "ENQUEUED" | "PENDING_QUEUE_SETUP";
	queueJobId?: string;
}

interface SchedulePostErrorResponse {
	status: "FAILED";
	message: string;
	error?: string;
}

function isSocialPlatform(value: string): value is SocialPlatform {
	return (SOCIAL_PLATFORMS as readonly string[]).includes(value);
}

function parseSchedulePostBody(rawBody: unknown): { value?: SchedulePostRequestBody; error?: string } {
	if (!rawBody || typeof rawBody !== "object") {
		return {
			error: "Request body must be a JSON object.",
		};
	}

	const body = rawBody as {
		content?: unknown;
		mediaUrls?: unknown;
		targetPlatforms?: unknown;
		scheduledExecutionTime?: unknown;
	};

	const content = typeof body.content === "string" ? body.content.trim() : "";

	if (!content) {
		return {
			error: "Field 'content' is required.",
		};
	}

	const rawMediaUrls = body.mediaUrls;

	if (!Array.isArray(rawMediaUrls) || rawMediaUrls.some((item) => typeof item !== "string")) {
		return {
			error: "Field 'mediaUrls' must be an array of strings.",
		};
	}

	const mediaUrls = rawMediaUrls.map((item) => item.trim()).filter((item) => item.length > 0);

	const rawTargetPlatforms = body.targetPlatforms;

	if (!Array.isArray(rawTargetPlatforms) || rawTargetPlatforms.length === 0) {
		return {
			error: "Field 'targetPlatforms' must contain at least one platform.",
		};
	}

	if (rawTargetPlatforms.some((item) => typeof item !== "string")) {
		return {
			error: "Field 'targetPlatforms' must be an array of strings.",
		};
	}

	const normalizedPlatforms = rawTargetPlatforms.map((item) => item.trim().toUpperCase());
	const invalidPlatforms = normalizedPlatforms.filter((item) => !isSocialPlatform(item));

	if (invalidPlatforms.length > 0) {
		return {
			error: `Invalid platform(s): ${invalidPlatforms.join(", ")}. Allowed: ${SOCIAL_PLATFORMS.join(", ")}.`,
		};
	}

	const targetPlatforms = Array.from(new Set(normalizedPlatforms)) as SocialPlatform[];

	if (typeof body.scheduledExecutionTime !== "string") {
		return {
			error: "Field 'scheduledExecutionTime' must be an ISO date string.",
		};
	}

	const scheduledExecutionTime = new Date(body.scheduledExecutionTime);

	if (Number.isNaN(scheduledExecutionTime.getTime())) {
		return {
			error: "Field 'scheduledExecutionTime' is not a valid date.",
		};
	}

	if (scheduledExecutionTime.getTime() <= Date.now()) {
		return {
			error: "Field 'scheduledExecutionTime' must be in the future.",
		};
	}

	return {
		value: {
			content,
			mediaUrls,
			targetPlatforms,
			scheduledExecutionTime,
		},
	};
}

export async function POST(request: NextRequest): Promise<Response> {
	let parsedBody: unknown;

	try {
		parsedBody = await request.json();
	} catch {
		return NextResponse.json<SchedulePostErrorResponse>(
			{
				status: "FAILED",
				message: "Request body must be valid JSON.",
			},
			{
				status: 400,
			},
		);
	}

	const validationResult = parseSchedulePostBody(parsedBody);

	if (!validationResult.value) {
		return NextResponse.json<SchedulePostErrorResponse>(
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

		const connectedIdentities = await SocialIdentityModel.find({
			platform: {
				$in: payload.targetPlatforms,
			},
		})
			.select("platform")
			.lean();

		const connectedPlatforms = new Set(connectedIdentities.map((identity) => identity.platform));
		const missingPlatforms = payload.targetPlatforms.filter((platform) => !connectedPlatforms.has(platform));

		if (missingPlatforms.length > 0) {
			return NextResponse.json<SchedulePostErrorResponse>(
				{
					status: "FAILED",
					message: `Missing credentials for platform(s): ${missingPlatforms.join(", ")}. Connect account credentials before scheduling.`,
				},
				{
					status: 400,
				},
			);
		}

		const createdPost = await PostModel.create({
			content: payload.content,
			mediaUrls: payload.mediaUrls,
			targetPlatforms: payload.targetPlatforms,
			scheduledExecutionTime: payload.scheduledExecutionTime,
			status: "SCHEDULED",
		});

		let queueStatus: SchedulePostSuccessResponse["queueStatus"] = "PENDING_QUEUE_SETUP";
		let queueJobId: string | undefined;
		let message = "Post scheduled successfully.";

		try {
			const { enqueueSchedulePostJob } = await import("@/queue/producer");

			queueJobId = await enqueueSchedulePostJob({
				postId: createdPost._id.toString(),
				targetPlatforms: payload.targetPlatforms,
				scheduledExecutionTime: payload.scheduledExecutionTime,
			});

			queueStatus = "ENQUEUED";
		} catch (queueError) {
			message =
				"Post saved to MongoDB, but queueing is currently unavailable. Ensure Redis version is >= 5.0.0.";

			console.error(
				"[schedule-post] Queue enqueue failed:",
				queueError instanceof Error ? queueError.message : queueError,
			);
		}

		return NextResponse.json<SchedulePostSuccessResponse>(
			{
				status: "SUCCESS",
				message,
				postId: createdPost._id.toString(),
				queueStatus,
				queueJobId,
			},
			{
				status: 201,
			},
		);
	} catch (error) {
		return NextResponse.json<SchedulePostErrorResponse>(
			{
				status: "FAILED",
				message: "Unable to create scheduled post.",
				error: error instanceof Error ? error.message : "Unknown error",
			},
			{
				status: 500,
			},
		);
	}
}
