import type { DataStore } from "./types.js";
import type {
  Member,
  VerificationSession,
  WarningRecord,
  ModerationAction,
  ChatConfig,
  AuditLogEntry,
} from "./domain.js";
import { DEFAULT_CHAT_CONFIG, MAX_AUDIT_LOG_ENTRIES } from "./domain.js";

// ── Key helpers ──────────────────────────────────────────────────────────
// Every key uses deterministic IDs — never enumerate keyspace.

const chatMemberKey = (chatId: number, userId: number) =>
  `chat:${chatId}:member:${userId}`;
const chatMemberIndexKey = (chatId: number) => `chat:${chatId}:members`;
const verificationKey = (chatId: number, userId: number) =>
  `chat:${chatId}:verify:${userId}`;
const warningsKey = (chatId: number, userId: number) =>
  `chat:${chatId}:warnings:${userId}`;
const configKey = (chatId: number) => `chat:${chatId}:config`;
const auditLogKey = (chatId: number) => `chat:${chatId}:audit`;
const trustedIndexKey = (chatId: number) => `chat:${chatId}:trusted`;

export class Repo {
  /** Direct DataStore access (for rate-limit / spam tracking in handlers). */
  readonly store: DataStore;

  constructor(store: DataStore) {
    this.store = store;
  }

  // ── Member ───────────────────────────────────────────────────────────────

  async getMember(chatId: number, userId: number): Promise<Member | null> {
    return this.store.getJSON<Member>(chatMemberKey(chatId, userId));
  }

  async upsertMember(chatId: number, member: Member): Promise<void> {
    const key = chatMemberKey(chatId, member.id);
    const idxKey = chatMemberIndexKey(chatId);
    // Track membership via index
    const existing = await this.store.getJSON<Member>(key);
    if (!existing) {
      await this.store.lpush(idxKey, String(member.id));
    }
    await this.store.setJSON(key, member);
  }

  async updateMember(
    chatId: number,
    userId: number,
    patch: Partial<Member>,
  ): Promise<Member | null> {
    const member = await this.getMember(chatId, userId);
    if (!member) return null;
    const updated = { ...member, ...patch };
    await this.store.setJSON(chatMemberKey(chatId, userId), updated);
    return updated;
  }

  async removeMember(chatId: number, userId: number): Promise<void> {
    await this.store.del(chatMemberKey(chatId, userId));
    await this.store.lrem(chatMemberIndexKey(chatId), 0, String(userId));
  }

  async getChatMemberIds(chatId: number): Promise<number[]> {
    const ids = await this.store.lrange(chatMemberIndexKey(chatId), 0, -1);
    return ids.map(Number);
  }

  // ── Trusted users ────────────────────────────────────────────────────────

  async addTrusted(chatId: number, userId: number): Promise<void> {
    await this.store.lpush(trustedIndexKey(chatId), String(userId));
  }

  async removeTrusted(chatId: number, userId: number): Promise<void> {
    await this.store.lrem(trustedIndexKey(chatId), 0, String(userId));
  }

  async isTrusted(chatId: number, userId: number): Promise<boolean> {
    const ids = await this.store.lrange(trustedIndexKey(chatId), 0, -1);
    return ids.includes(String(userId));
  }

  async getTrustedIds(chatId: number): Promise<number[]> {
    const ids = await this.store.lrange(trustedIndexKey(chatId), 0, -1);
    return ids.map(Number);
  }

  // ── Verification ─────────────────────────────────────────────────────────

  async setVerificationSession(
    chatId: number,
    session: VerificationSession,
  ): Promise<void> {
    // Expire after the deadline + 10s buffer
    const ttl = Math.ceil((session.deadline - Date.now()) / 1000) + 10;
    await this.store.setJSON(
      verificationKey(chatId, session.user_id),
      session,
      ttl,
    );
  }

  async getVerificationSession(
    chatId: number,
    userId: number,
  ): Promise<VerificationSession | null> {
    return this.store.getJSON<VerificationSession>(
      verificationKey(chatId, userId),
    );
  }

  async clearVerificationSession(
    chatId: number,
    userId: number,
  ): Promise<void> {
    await this.store.del(verificationKey(chatId, userId));
  }

  // ── Warnings ─────────────────────────────────────────────────────────────

  async addWarning(
    chatId: number,
    userId: number,
    warn: WarningRecord,
  ): Promise<void> {
    await this.store.lpush(
      warningsKey(chatId, userId),
      JSON.stringify(warn),
    );
  }

  async getWarnings(
    chatId: number,
    userId: number,
  ): Promise<WarningRecord[]> {
    const raw = await this.store.lrange(warningsKey(chatId, userId), 0, -1);
    return raw.map((r) => JSON.parse(r) as WarningRecord);
  }

  async getWarningCount(chatId: number, userId: number): Promise<number> {
    return this.store.llen(warningsKey(chatId, userId));
  }

  async clearWarnings(chatId: number, userId: number): Promise<void> {
    await this.store.del(warningsKey(chatId, userId));
  }

  // ── Config ───────────────────────────────────────────────────────────────

  async getConfig(chatId: number): Promise<ChatConfig> {
    const cfg = await this.store.getJSON<ChatConfig>(configKey(chatId));
    return cfg ?? { ...DEFAULT_CHAT_CONFIG };
  }

  async setConfig(chatId: number, config: ChatConfig): Promise<void> {
    await this.store.setJSON(configKey(chatId), config);
  }

  async updateConfig(
    chatId: number,
    patch: Partial<ChatConfig>,
  ): Promise<ChatConfig> {
    const cfg = await this.getConfig(chatId);
    const updated = { ...cfg, ...patch };
    await this.setConfig(chatId, updated);
    return updated;
  }

  // ── Audit log ────────────────────────────────────────────────────────────

  async appendAuditLog(
    chatId: number,
    entry: AuditLogEntry,
  ): Promise<void> {
    await this.store.lpush(auditLogKey(chatId), JSON.stringify(entry));
    // Trim to max
    await this.store.ltrim(auditLogKey(chatId), 0, MAX_AUDIT_LOG_ENTRIES - 1);
  }

  async getAuditLog(
    chatId: number,
    count: number = 50,
  ): Promise<AuditLogEntry[]> {
    const raw = await this.store.lrange(
      auditLogKey(chatId),
      0,
      count - 1,
    );
    return raw.map((r) => JSON.parse(r) as AuditLogEntry);
  }

  async getAuditLogCount(chatId: number): Promise<number> {
    return this.store.llen(auditLogKey(chatId));
  }

  // ── Global membership (for broadcasts across all known chats) ────────────
  // We don't scan — we maintain a global index key.
  async getKnownChatIds(): Promise<number[]> {
    const ids = await this.store.lrange("known_chats", 0, -1);
    return ids.map(Number);
  }

  async registerChat(chatId: number): Promise<void> {
    const known = await this.store.lrange("known_chats", 0, -1);
    if (!known.includes(String(chatId))) {
      await this.store.lpush("known_chats", String(chatId));
    }
  }
}
