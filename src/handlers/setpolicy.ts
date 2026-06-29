import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import { now } from "../lib/index.js";

const composer = new Composer<Ctx>();

// ── /setpolicy command (view/edit spam thresholds + escalation) ──────────

composer.command("setpolicy", async (ctx) => {
  const chatId = ctx.chat!.id;
  const actorId = ctx.from!.id;
  const actorName = ctx.from!.first_name;
  const repo = getRepo();

  if (ctx.chat?.type === "private") {
    await ctx.reply("This command works in group chats only. Add me to a group and make me an admin.");
    return;
  }

  // Check admin permissions
  try {
    const admins = await ctx.getChatAdministrators();
    if (!admins.some((a) => a.user.id === actorId)) {
      await ctx.reply("Only group admins can use this command.");
      return;
    }
  } catch {
    await ctx.reply("I need admin permissions in this group to moderate.");
    return;
  }

  const config = await repo.getConfig(chatId);
  const t = config.thresholds;
  const toggles = config.auto_action_toggles;

  const lines = [
    "⚙️ Spam policy settings:",
    "",
    `Message rate: ${t.message_rate_count} messages in ${t.message_rate_window_s}s`,
    `Duplicate limit: ${t.duplicate_count}`,
    `Escalation: ${t.escalation.map((e) => e.action).join(" → ")}`,
    "",
    `Warn: ${toggles.warn_enabled ? "on" : "off"}`,
    `Mute: ${toggles.mute_enabled ? "on" : "off"}`,
    `Kick: ${toggles.kick_enabled ? "on" : "off"}`,
    `Ban: ${toggles.ban_enabled ? "on" : "off"}`,
    "",
    "Reply with:",
    "/setpolicy threshold <rate_count> <window_s> <dupe_count> — set thresholds",
    "/setpolicy toggle <action> <on|off> — toggle auto-actions",
  ];

  const params = (ctx.match ?? "").trim().split(/\s+/);

  if (params.length === 0) {
    await ctx.reply(lines.join("\n"));
    return;
  }

  const sub = params[0];

  if (sub === "threshold" && params.length >= 4) {
    const rateCount = parseInt(params[1], 10);
    const windowS = parseInt(params[2], 10);
    const dupeCount = parseInt(params[3], 10);

    if (isNaN(rateCount) || isNaN(windowS) || isNaN(dupeCount) || rateCount < 1 || windowS < 1 || dupeCount < 1) {
      await ctx.reply("Usage: /setpolicy threshold <rate_count> <window_s> <dupe_count>\nAll values must be positive numbers.");
      return;
    }

    await repo.updateConfig(chatId, {
      thresholds: {
        ...t,
        message_rate_count: rateCount,
        message_rate_window_s: windowS,
        duplicate_count: dupeCount,
      },
    });

    await ctx.reply(`✅ Thresholds updated: ${rateCount} msgs / ${windowS}s, ${dupeCount} duplicates.`);

    await repo.appendAuditLog(chatId, {
      actor: actorId,
      actor_name: actorName,
      action: "config",
      target: null,
      target_name: "config",
      time: now(),
      reason: `Updated spam thresholds: ${rateCount}/${windowS}s/${dupeCount}`,
      automatic: false,
      chat_id: chatId,
    });
    return;
  }

  if (sub === "toggle" && params.length >= 3) {
    const action = params[1];
    const state = params[2];

    const validActions = ["warn", "mute", "kick", "ban"];
    if (!validActions.includes(action)) {
      await ctx.reply("Action must be one of: warn, mute, kick, ban.");
      return;
    }

    const enabled = state === "on" || state === "true" || state === "1";
    if (state !== "on" && state !== "off" && state !== "true" && state !== "false" && state !== "1" && state !== "0") {
      await ctx.reply("State must be on or off.");
      return;
    }

    const patch: Record<string, boolean> = {};
    patch[`${action}_enabled`] = enabled;
    await repo.updateConfig(chatId, {
      auto_action_toggles: { ...toggles, ...patch } as typeof toggles,
    });

    await ctx.reply(`✅ Auto-${action}: ${enabled ? "on" : "off"}.`);

    await repo.appendAuditLog(chatId, {
      actor: actorId,
      actor_name: actorName,
      action: "config",
      target: null,
      target_name: "config",
      time: now(),
      reason: `Toggled auto-${action} ${enabled ? "on" : "off"}`,
      automatic: false,
      chat_id: chatId,
    });
    return;
  }

  await ctx.reply(lines.join("\n"));
});

export default composer;
