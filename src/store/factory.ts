import type { DataStore } from "./types.js";
import { MemoryDataStore } from "./memory.js";
import { RedisDataStore } from "./redis.js";

/**
 * Auto-select the domain DataStore:
 *   1. REDIS_URL set → RedisDataStore (production or docker-compose)
 *   2. otherwise → MemoryDataStore (dev / test harness)
 * Returns a singleton per invocation; this module caches nothing so
 * the test harness gets a fresh store per spec.
 */
export function resolveDataStore(): DataStore {
  if (process.env.REDIS_URL) return new RedisDataStore(process.env.REDIS_URL);
  return new MemoryDataStore();
}
