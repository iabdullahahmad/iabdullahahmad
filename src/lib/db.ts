import mongoose from "mongoose";

const MONGODB_URI = (() => {
	const value = process.env.MONGODB_URI;

	if (!value) {
		throw new Error("Missing MONGODB_URI. Set it in the environment configuration.");
	}

	return value;
})();
const MONGODB_DB = process.env.MONGODB_DB ?? "social-media-manager";

type MongooseCache = {
	conn: typeof mongoose | null;
	promise: Promise<typeof mongoose> | null;
};

declare global {
	var mongooseCache: MongooseCache | undefined;
}

const globalWithMongoose = global as typeof globalThis & {
	mongooseCache?: MongooseCache;
};

const cache = globalWithMongoose.mongooseCache ?? {
	conn: null,
	promise: null,
};

globalWithMongoose.mongooseCache = cache;

export async function connectToDatabase(): Promise<typeof mongoose> {
	if (cache.conn) {
		return cache.conn;
	}

	if (!cache.promise) {
		cache.promise = mongoose
			.connect(MONGODB_URI, {
				dbName: MONGODB_DB,
			})
			.then((mongooseInstance) => mongooseInstance);
	}

	try {
		cache.conn = await cache.promise;
	} catch (error) {
		cache.promise = null;
		throw error;
	}

	return cache.conn;
}
