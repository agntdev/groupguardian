import { createRequire } from "node:module";
import type { DataStore, RedisLike } from "./types.js";

/**
 * Redis-backed DataStore for production. Uses ioredis (lazy-loaded from CJS).
 * Keys are prefixed with "gg:" for namespacing.
 */
export class RedisDataStore implements DataStore {
  private client: RedisLike;

  constructor(redisUrl: string, private prefix = "gg:") {
    const require = createRequire(import.meta.url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ioredis: any = require("ioredis");
    const Redis = ioredis.default ?? ioredis.Redis ?? ioredis;
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    }) as RedisLike;
  }

  private k(key: string): string {
    return this.prefix + key;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(this.k(key));
  }

  async set(key: string, value: string, expireSeconds?: number): Promise<void> {
    if (expireSeconds !== undefined) {
      await this.client.set(this.k(key), value, "EX", expireSeconds);
    } else {
      await this.client.set(this.k(key), value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(this.k(key));
  }

  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJSON<T>(key: string, value: T, expireSeconds?: number): Promise<void> {
    await this.set(key, JSON.stringify(value), expireSeconds);
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.client.lpush(this.k(key), ...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.client.lrange(this.k(key), start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    await this.client.ltrim(this.k(key), start, stop);
  }

  async llen(key: string): Promise<number> {
    return this.client.llen(this.k(key));
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    return this.client.lrem(this.k(key), count, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(this.k(key), field);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(this.k(key), field, value);
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.client.hdel(this.k(key), field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const result = await this.client.hgetall(this.k(key));
    // ioredis hgetall returns a flat Record<string, string>
    return result ?? {};
  }
}

// Re-export the RedisLike interface for use in RedisDataStore
export type { RedisLike } from "./types.js";
