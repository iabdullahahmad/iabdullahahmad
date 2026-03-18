import Redis, { type RedisOptions } from "ioredis";

function parseIntegerEnv(rawValue: string, envKey: string): number {
	const parsedValue = Number(rawValue);

	if (!Number.isInteger(parsedValue)) {
		throw new Error(`Invalid ${envKey} value. Expected an integer.`);
	}

	return parsedValue;
}

const REDIS_HOST = process.env.REDIS_HOST ?? "127.0.0.1";
const REDIS_PORT = parseIntegerEnv(process.env.REDIS_PORT ?? "6379", "REDIS_PORT");
const REDIS_DB = parseIntegerEnv(process.env.REDIS_DB ?? "0", "REDIS_DB");
const REDIS_USERNAME = process.env.REDIS_USERNAME;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

const redisOptions: RedisOptions = {
	host: REDIS_HOST,
	port: REDIS_PORT,
	db: REDIS_DB,
	username: REDIS_USERNAME,
	password: REDIS_PASSWORD,
	lazyConnect: true,
	maxRetriesPerRequest: null,
};

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
	if (!redisClient) {
		redisClient = new Redis(redisOptions);
	}

	return redisClient;
}

export const bullMqConnection = {
	host: REDIS_HOST,
	port: REDIS_PORT,
	db: REDIS_DB,
	username: REDIS_USERNAME,
	password: REDIS_PASSWORD,
	maxRetriesPerRequest: null,
};

export async function assertRedisConnection(): Promise<void> {
	const client = getRedisClient();

	if (client.status === "wait") {
		await client.connect();
	}

	await client.ping();
}
