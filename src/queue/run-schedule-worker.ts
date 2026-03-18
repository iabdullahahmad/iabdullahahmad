import { startSchedulePostWorker, stopSchedulePostWorker } from "./worker";

async function main(): Promise<void> {
	const { worker, queueEvents } = await startSchedulePostWorker();

	let shutdownInProgress = false;

	const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
		if (shutdownInProgress) {
			return;
		}

		shutdownInProgress = true;
		console.info(`[schedule-worker] Received ${signal}. Shutting down worker...`);

		await stopSchedulePostWorker(worker, queueEvents);
		console.info("[schedule-worker] Shutdown complete.");

		process.exit(0);
	};

	process.on("SIGINT", () => {
		void shutdown("SIGINT");
	});

	process.on("SIGTERM", () => {
		void shutdown("SIGTERM");
	});
}

main().catch((error) => {
	console.error("[schedule-worker] Startup failed:", error instanceof Error ? error.message : error);
	process.exit(1);
});