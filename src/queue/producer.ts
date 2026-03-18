import { Queue, type JobsOptions } from "bullmq";
import { bullMqConnection } from "../lib/redis";
import type { SocialPlatform } from "../models/types";

export const SCHEDULE_POST_QUEUE_NAME = "schedule-post-queue";
export const SCHEDULE_POST_JOB_NAME = "schedule-post";

export interface SchedulePostJobData {
	postId: string;
	targetPlatforms: SocialPlatform[];
	scheduledExecutionTime: string;
}

const defaultJobOptions: JobsOptions = {
	attempts: 5,
	backoff: {
		type: "exponential",
		delay: 2000,
	},
	removeOnComplete: 1000,
	removeOnFail: 1000,
};

export const schedulePostQueue = new Queue<SchedulePostJobData>(SCHEDULE_POST_QUEUE_NAME, {
	connection: bullMqConnection,
	defaultJobOptions,
});

export interface EnqueueSchedulePostInput {
	postId: string;
	targetPlatforms: SocialPlatform[];
	scheduledExecutionTime: Date;
}

export async function enqueueSchedulePostJob(input: EnqueueSchedulePostInput): Promise<string> {
	const delay = Math.max(0, input.scheduledExecutionTime.getTime() - Date.now());

	const job = await schedulePostQueue.add(
		SCHEDULE_POST_JOB_NAME,
		{
			postId: input.postId,
			targetPlatforms: input.targetPlatforms,
			scheduledExecutionTime: input.scheduledExecutionTime.toISOString(),
		},
		{
			delay,
		},
	);

	return String(job.id);
}

export async function closeSchedulePostQueue(): Promise<void> {
	await schedulePostQueue.close();
}
