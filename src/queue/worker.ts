import { QueueEvents, Worker, type Job } from "bullmq";
import { connectToDatabase } from "../lib/db";
import { bullMqConnection } from "../lib/redis";
import { PostModel } from "../models/Post";
import { createDefaultPlatformDispatcher } from "../services/dispatcher";
import type { DispatchResult } from "../services/types";
import {
	SCHEDULE_POST_QUEUE_NAME,
	type SchedulePostJobData,
} from "./producer";

const DEFAULT_WORKER_CONCURRENCY = 5;

function getWorkerConcurrency(): number {
	const rawValue = process.env.SCHEDULER_WORKER_CONCURRENCY;

	if (!rawValue) {
		return DEFAULT_WORKER_CONCURRENCY;
	}

	const parsedValue = Number(rawValue);

	if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
		throw new Error("Invalid SCHEDULER_WORKER_CONCURRENCY value. Expected a positive integer.");
	}

	return parsedValue;
}

export type SchedulePostWorkerHandler = (job: Job<SchedulePostJobData>) => Promise<void>;

export function createSchedulePostWorker(handler: SchedulePostWorkerHandler): Worker<SchedulePostJobData> {
	return new Worker<SchedulePostJobData>(
		SCHEDULE_POST_QUEUE_NAME,
		async (job) => {
			await handler(job);
		},
		{
			connection: bullMqConnection,
			concurrency: getWorkerConcurrency(),
		},
	);
}

export function createSchedulePostQueueEvents(): QueueEvents {
	return new QueueEvents(SCHEDULE_POST_QUEUE_NAME, {
		connection: bullMqConnection,
	});
}

function summarizeDispatchResults(dispatchResults: DispatchResult[]): string {
	return dispatchResults
		.map((result) => {
			const state = result.success ? "OK" : "FAILED";

			return `${result.platform}:${state}`;
		})
		.join(" | ");
}

export async function defaultSchedulePostWorkerHandler(job: Job<SchedulePostJobData>): Promise<void> {
	await connectToDatabase();

	const post = await PostModel.findById(job.data.postId);

	if (!post) {
		throw new Error(`Post '${job.data.postId}' was not found.`);
	}

	const dispatcher = createDefaultPlatformDispatcher();
	const dispatchResults = await dispatcher.dispatchToPlatforms(job.data.targetPlatforms, {
		postId: post.id,
		content: post.content,
		mediaUrls: post.mediaUrls,
		targetPlatforms: job.data.targetPlatforms,
		scheduledExecutionTime: new Date(job.data.scheduledExecutionTime),
	});

	const hasDispatchFailures = dispatchResults.some((result) => !result.success);

	await PostModel.findByIdAndUpdate(post.id, {
		status: hasDispatchFailures ? "FAILED" : "PUBLISHED",
	});

	const summary = summarizeDispatchResults(dispatchResults);

	if (hasDispatchFailures) {
		console.warn(`[schedule-worker] Dispatch completed with failures for post ${post.id}. ${summary}`);
		return;
	}

	console.info(`[schedule-worker] Dispatch completed successfully for post ${post.id}. ${summary}`);
}

export async function startSchedulePostWorker(
	handler: SchedulePostWorkerHandler = defaultSchedulePostWorkerHandler,
): Promise<{ worker: Worker<SchedulePostJobData>; queueEvents: QueueEvents }> {
	const worker = createSchedulePostWorker(handler);
	const queueEvents = createSchedulePostQueueEvents();

	worker.on("ready", () => {
		console.info(
			`[schedule-worker] Listening on queue '${SCHEDULE_POST_QUEUE_NAME}' with concurrency ${getWorkerConcurrency()}.`,
		);
	});

	worker.on("active", (job) => {
		console.info(`[schedule-worker] Processing job ${job.id} for post ${job.data.postId}.`);
	});

	worker.on("completed", (job) => {
		console.info(`[schedule-worker] Completed job ${job.id} for post ${job.data.postId}.`);
	});

	worker.on("failed", (job, error) => {
		console.error(
			`[schedule-worker] Failed job ${job?.id ?? "unknown"}: ${error.message}`,
		);
	});

	worker.on("error", (error) => {
		console.error(`[schedule-worker] Worker error: ${error.message}`);
	});

	queueEvents.on("error", (error) => {
		console.error(`[schedule-worker] Queue event error: ${error.message}`);
	});

	return {
		worker,
		queueEvents,
	};
}

export async function stopSchedulePostWorker(
	worker: Worker<SchedulePostJobData>,
	queueEvents: QueueEvents,
): Promise<void> {
	await Promise.allSettled([worker.close(), queueEvents.close()]);
}
