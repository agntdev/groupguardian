/** Minimal Redis client surface needed by RedisDataStore. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  llen(key: string): Promise<number>;
  lrem(key: string, count: number, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<number>;
  hdel(key: string, ...fields: string[]): Promise<number>;
  hgetall(key: string): Promise<Record<string, string>>;
}

/** Persistent data-store interface for domain entities.
 *  Implementations: MemoryDataStore (dev/test), RedisDataStore (production).
 *  All domain data uses this — never an in-memory Map/array/module variable. */
export interface DataStore {
  // ---------- Generic key-value ----------
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expireSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;

  // JSON helpers
  getJSON<T>(key: string): Promise<T | null>;
  setJSON<T>(key: string, value: T, expireSeconds?: number): Promise<void>;

  // ---------- List (for indexes) ----------
  lpush(key: string, ...values: string[]): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  ltrim(key: string, start: number, stop: number): Promise<void>;
  llen(key: string): Promise<number>;
  lrem(key: string, count: number, value: string): Promise<number>;

  // ---------- Hash ----------
  hget(key: string, field: string): Promise<string | null>;
  hset(key: string, field: string, value: string): Promise<void>;
  hdel(key: string, field: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
}
