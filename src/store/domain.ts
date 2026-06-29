// Core data entity types for GroupGuard.
// Durable (persistent) domain data — never in-memory Maps.

export type VerificationStatus = "pending" | "verified" | "removed";

export interface Member {
  id: number; // Telegram user id
  name: string;
  join_timestamp: number; // unix ms
  verification_status: VerificationStatus;
  trusted_flag: boolean;
  role: "member" | "admin" | "owner";
}

export interface VerificationSession {
  user_id: number;
  chat_id: number;
  deadline: number; // unix ms
  message_ids: number[]; // bot's messages in the group (to clear later)
}

export interface WarningRecord {
  who: number; // Telegram user id of the warned user
  by: number; // Telegram user id of the actor
  why: string;
  time: number; // unix ms
  chat_id: number;
}

export type ActionType = "warn" | "mute" | "kick" | "ban" | "unban";

export interface ModerationAction {
  actor: number;
  target: number;
  target_name: string;
  reason: string;
  time: number; // unix ms
  automatic: boolean;
  action: ActionType;
  chat_id: number;
  /** For mute: duration in seconds */
  mute_duration_s?: number;
}

export interface ChatConfig {
  welcome_text: string;
  rules_text: string;
  verification_timeout_ms: number;
  thresholds: SpamThresholds;
  auto_action_toggles: AutoActionToggles;
  admin_notifications: boolean;
}

export interface SpamThresholds {
  /** Min messages in the window to trigger rate-limit escalation */
  message_rate_count: number;
  /** Time window in seconds for rate-limit check */
  message_rate_window_s: number;
  /** Max duplicate messages allowed before escalation */
  duplicate_count: number;
  /** Escalation ladder (increasing severity) */
  escalation: EscalationStep[];
}

export interface EscalationStep {
  action: ActionType;
  /** For mute: seconds */
  mute_duration_s?: number;
}

export interface AutoActionToggles {
  warn_enabled: boolean;
  mute_enabled: boolean;
  kick_enabled: boolean;
  ban_enabled: boolean;
}

export interface AuditLogEntry {
  actor: number;
  actor_name: string;
  action: ActionType | "verify" | "timeout" | "trust" | "untrust" | "config";
  target: number | null;
  target_name: string;
  time: number; // unix ms
  reason: string;
  automatic: boolean;
  chat_id: number;
}

export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  welcome_text: "Welcome to the group! Please verify you're human by tapping the button below.",
  rules_text: "Be respectful. No spam. Follow the group rules.",
  verification_timeout_ms: 60_000, // 1 minute
  thresholds: {
    message_rate_count: 5,
    message_rate_window_s: 10,
    duplicate_count: 3,
    escalation: [
      { action: "warn" },
      { action: "mute", mute_duration_s: 300 }, // 5 min
      { action: "kick" },
      { action: "ban" },
    ],
  },
  auto_action_toggles: {
    warn_enabled: true,
    mute_enabled: true,
    kick_enabled: true,
    ban_enabled: true,
  },
  admin_notifications: false,
};

export const MAX_AUDIT_LOG_ENTRIES = 500;
