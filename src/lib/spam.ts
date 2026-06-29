import type { DataStore } from "../store/index.js";
import { now } from "./clock.js";

// ── Message rate tracker keys (in-memory via DataStore, but scoped per chat/user) ──

const RATE_WINDOW_MS = 10_000; // fixed 10s sliding window
const RATE_BUCKET_MS = 1_000; // 1-second buckets

/**
 * Check if the user has exceeded the message rate threshold.
 * Uses a simple bucket-based rate limiter stored in the persistent store.
 */
export async function checkMessageRate(
  store: DataStore,
  chatId: number,
  userId: number,
  maxCount: number,
  windowSeconds: number,
): Promise<boolean> {
  const key = `rate:${chatId}:${userId}`;
  const t = now();

  // Push current timestamp
  await store.lpush(key, String(t));

  // Prune old entries outside the window
  const cutoff = t - windowSeconds * 1000;
  const timestamps = await store.lrange(key, 0, -1);
  let keep = 0;
  for (const ts of timestamps) {
    if (Number(ts) >= cutoff) keep++;
    else break;
  }
  if (keep < timestamps.length) {
    await store.ltrim(key, 0, keep - 1);
  }

  // Set TTL on a separate sentinel key to avoid WRONGTYPE
  // (the main key is list-typed; SET on a list key crashes Redis).
  await store.set(key + ":ttl", "_", windowSeconds * 2);

  return keep > maxCount;
}

/**
 * Check if the message is a duplicate (same text sent recently).
 * Uses a simple hash-based dedup with TTL.
 */
export async function checkDuplicate(
  store: DataStore,
  chatId: number,
  userId: number,
  text: string,
  maxDupes: number,
): Promise<boolean> {
  const key = `dup:${chatId}:${userId}`;
  const hash = simpleHash(text);

  // Count how many times this hash has been seen
  const count = await store.lpush(key, hash);
  // Trim to max
  if (count > maxDupes * 2) {
    await store.ltrim(key, 0, maxDupes * 2 - 1);
  }

  // Count occurrences of this hash in recent list
  const recent = await store.lrange(key, 0, maxDupes - 1);
  const occurrences = recent.filter((h) => h === hash).length;

  // TTL: clean up after 5 min
  await store.set(key + ":ttl", "_", 300);

  return occurrences >= maxDupes;
}

/**
 * Check if the message contains a link and the user is new (joined recently).
 * "New account links" heuristic: user joined < 24h ago AND message contains a URL.
 */
export function checkNewAccountLinks(
  text: string,
  joinTimestamp: number,
): boolean {
  const joinAgeHours = (now() - joinTimestamp) / (1000 * 60 * 60);
  const hasLink = /https?:\/\/|t\.me\/|telegram\.me\/|@\w+$/i.test(text);
  return joinAgeHours < 24 && hasLink;
}

function simpleHash(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return String(hash);
}