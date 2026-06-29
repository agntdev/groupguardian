import type { Api } from "grammy";
import { getRepo } from "../state.js";
import { now } from "./clock.js";
import type { AuditLogEntry } from "../store/index.js";

/**
 * Notify all group admins about a moderation escalation.
 * Sends a DM to each admin; tolerates 403 for admins who never started the bot.
 * Only fires when `admin_notifications` is enabled in chat config.
 */
export async function notifyAdminsOfEscalation(
  api: Api,
  chatId: number,
  entry: AuditLogEntry,
): Promise<void> {
  const repo = getRepo();
  const config = await repo.getConfig(chatId);
  if (!config.admin_notifications) return;

  let admins: { user: { id: number } }[];
  try {
    admins = await api.getChatAdministrators(chatId);
  } catch {
    return; // can't fetch admins; nothing to do
  }

  const tag = entry.automatic ? "[auto]" : "";
  const msg =
    `⚡ Moderation alert in chat ${chatId}:\n` +
    `${tag} ${entry.action} → ${entry.target_name}\n` +
    `Reason: ${entry.reason}\n` +
    `Time: ${new Date(entry.time).toLocaleString()}`;

  for (const admin of admins) {
    const adminId = admin.user.id;
    // Don't notify the actor about their own action
    if (!entry.automatic && adminId === entry.actor) continue;
    try {
      await api.sendMessage(adminId, msg);
    } catch (err: unknown) {
      // Tolerate 403 (never started / blocked), log others
      const e = err as { error_code?: number };
      if (e.error_code !== 403) {
        console.error(`[notify] failed to DM admin ${adminId}:`, err);
      }
    }
  }
}

/**
 * Notify all group admins with a summary report.
 * Only fires when `admin_notifications` is enabled in chat config.
 */
export async function notifyAdminsSummary(
  api: Api,
  chatId: number,
  summaryText: string,
): Promise<void> {
  const repo = getRepo();
  const config = await repo.getConfig(chatId);
  if (!config.admin_notifications) return;

  let admins: { user: { id: number } }[];
  try {
    admins = await api.getChatAdministrators(chatId);
  } catch {
    return;
  }

  for (const admin of admins) {
    try {
      await api.sendMessage(admin.user.id, summaryText);
    } catch (err: unknown) {
      const e = err as { error_code?: number };
      if (e.error_code !== 403) {
        console.error(`[notify] failed to DM admin ${admin.user.id}:`, err);
      }
    }
  }
}
