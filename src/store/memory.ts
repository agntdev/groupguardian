import type { DataStore } from "./types.js";

/**
 * In-memory DataStore for development/testing. Backed by Map.
 * Implements the same DataStore interface as RedisDataStore.
 */
export class MemoryDataStore implements DataStore {
  private kv = new Map<string, string>();
  private lists = new Map<string, string[]>();
  private hashes = new Map<string, Map<string, string>>();
  private expiries = new Map<string, number>(); // key -> expiry ms timestamp

  private isExpired(key: string): boolean {
    const exp = this.expiries.get(key);
    if (exp && Date.now() > exp) {
      this.kv.delete(key);
      this.lists.delete(key);
      this.hashes.delete(key);
      this.expiries.delete(key);
      return true;
    }
    return false;
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    return this.kv.get(key) ?? null;
  }

  async set(key: string, value: string, expireSeconds?: number): Promise<void> {
    this.kv.set(key, value);
    if (expireSeconds !== undefined) {
      this.expiries.set(key, Date.now() + expireSeconds * 1000);
    }
  }

  async del(key: string): Promise<void> {
    this.kv.delete(key);
    this.lists.delete(key);
    this.hashes.delete(key);
    this.expiries.delete(key);
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
    let list = this.lists.get(key);
    if (!list) {
      list = [];
      this.lists.set(key, list);
    }
    list.unshift(...values);
    return list.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.lists.get(key);
    if (!list) return [];
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    const list = this.lists.get(key);
    if (!list) return;
    const end = stop === -1 ? list.length : stop + 1;
    this.lists.set(key, list.slice(start, end));
  }

  async llen(key: string): Promise<number> {
    const list = this.lists.get(key);
    return list ? list.length : 0;
  }

  async lrem(key: string, count: number, value: string): Promise<number> {
    const list = this.lists.get(key);
    if (!list) return 0;
    let removed = 0;
    if (count > 0) {
      for (let i = 0; i < list.length && removed < count; i++) {
        if (list[i] === value) {
          list.splice(i, 1);
          i--;
          removed++;
        }
      }
    } else if (count < 0) {
      for (let i = list.length - 1; i >= 0 && removed < -count; i--) {
        if (list[i] === value) {
          list.splice(i, 1);
          removed++;
        }
      }
    } else {
      // count === 0: remove ALL matching values
      const keep = list.filter((v) => v !== value);
      removed = list.length - keep.length;
      list.length = 0;
      list.push(...keep);
    }
    return removed;
  }

  async hget(key: string, field: string): Promise<string | null> {
    const hash = this.hashes.get(key);
    return hash?.get(field) ?? null;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new Map();
      this.hashes.set(key, hash);
    }
    hash.set(field, value);
  }

  async hdel(key: string, field: string): Promise<void> {
    const hash = this.hashes.get(key);
    hash?.delete(field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.hashes.get(key);
    if (!hash) return {};
    return Object.fromEntries(hash);
  }
}
