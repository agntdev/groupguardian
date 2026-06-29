import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import { now } from "../lib/index.js";
import { registerMainMenuItem } from "../toolkit/index.js";
import type { ActionType, EscalationStep } from "../store/index.js";

// Make /setpolicy reachable from the /start main menu.
registerMainMenuItem({ label: "⚙️ Spam policy", data: "setpolicy:show", order: 32 });

const composer = new Composer<Ctx>();
const VALID_ACTIONS: ActionType[] = ["warn", "mute", "kick", "ban"];

// ── /setpolicy command (view/edit spam thresholds, escalation, toggles, notifications) ─

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

  const buildStatusLines = () => {
    const escSteps = t.escalation
      .map((e) => {
        const dur = e.mute_duration_s != null ? `:${e.mute_duration_s}s` : "";
        return `${e.action}${dur}`;
      })
      .join(" → ");

    return [
      "⚙️ Spam policy settings:",
      "",
      `Message rate: ${t.message_rate_count} messages in ${t.message_rate_window_s}s`,
      `Duplicate limit: ${t.duplicate_count}`,
      `Escalation: ${escSteps}`,
      "",
      `Warn: ${toggles.warn_enabled ? "on" : "off"}`,
      `Mute: ${toggles.mute_enabled ? "on" : "off"}`,
      `Kick: ${toggles.kick_enabled ? "on" : "off"}`,
      `Ban: ${toggles.ban_enabled ? "on" : "off"}`,
      "",
      `Admin notifications: ${config.admin_notifications ? "on" : "off"}`,
      "",
      "Reply with:",
      "/setpolicy threshold <rate_count> <window_s> <dupe_count> — set thresholds",
      "/setpolicy toggle <action> <on|off> — toggle auto-actions",
      "/setpolicy escalation <step1,step2,...> — configure escalation ladder",
      "/setpolicy notify <on|off> — toggle admin notifications",
    ];
  };

  const matchText = (ctx.match ?? "").trim();
  if (!matchText) {
    await ctx.reply(buildStatusLines().join("\n"));
    return;
  }

  const params = matchText.split(/\s+/);
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

    if (!VALID_ACTIONS.includes(action as ActionType)) {
      await ctx.reply("Action must be one of: warn, mute, kick, ban.");
      return;
    }

    if (state !== "on" && state !== "off" && state !== "true" && state !== "false" && state !== "1" && state !== "0") {
      await ctx.reply("State must be on or off.");
      return;
    }

    const enabled = state === "on" || state === "true" || state === "1";

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

  if (sub === "escalation" && params.length >= 2) {
    // Format: /setpolicy escalation warn,mute:300,kick,ban
    const stepsRaw = params.slice(1).join(" ").split(",").map((s) => s.trim()).filter(Boolean);
    if (stepsRaw.length === 0) {
      await ctx.reply(
        "Usage: /setpolicy escalation <step1,step2,...>\n" +
        "Each step is an action, optionally with a mute duration: warn, mute:300, kick, ban.",
      );
      return;
    }

    const newEscalation: EscalationStep[] = [];
    for (const raw of stepsRaw) {
      const colonIdx = raw.indexOf(":");
      let action: string;
      let dur: number | undefined;
      if (colonIdx >= 0) {
        action = raw.slice(0, colonIdx);
        const durStr = raw.slice(colonIdx + 1).replace(/s$/i, "");
        dur = parseInt(durStr, 10);
        if (isNaN(dur) || dur < 1) {
          await ctx.reply(`Invalid mute duration in "${raw}". Use e.g. mute:300 (seconds).`);
          return;
        }
      } else {
        action = raw;
      }

      if (!VALID_ACTIONS.includes(action as ActionType)) {
        await ctx.reply(`Unknown action "${action}". Use: warn, mute, kick, or ban.`);
        return;
      }

      const step: EscalationStep = { action: action as ActionType };
      if (action === "mute") {
        step.mute_duration_s = dur ?? 300;
      }
      newEscalation.push(step);
    }

    await repo.updateConfig(chatId, {
      thresholds: { ...t, escalation: newEscalation },
    });

    const desc = newEscalation
      .map((e) => {
        const dur = e.mute_duration_s != null ? `:${e.mute_duration_s}s` : "";
        return `${e.action}${dur}`;
      })
      .join(" → ");

    await ctx.reply(`✅ Escalation updated: ${desc}`);

    await repo.appendAuditLog(chatId, {
      actor: actorId,
      actor_name: actorName,
      action: "config",
      target: null,
      target_name: "config",
      time: now(),
      reason: `Updated escalation ladder: ${desc}`,
      automatic: false,
      chat_id: chatId,
    });
    return;
  }

  if (sub === "notify" && params.length >= 2) {
    const state = params[1];
    if (state !== "on" && state !== "off" && state !== "true" && state !== "false" && state !== "1" && state !== "0") {
      await ctx.reply("Usage: /setpolicy notify <on|off>");
      return;
    }
    const enabled = state === "on" || state === "true" || state === "1";

    await repo.updateConfig(chatId, { admin_notifications: enabled });

    await ctx.reply(`✅ Admin notifications: ${enabled ? "on" : "off"}.`);
    return;
  }

  // Unknown subcommand — show status menu
  await ctx.reply(buildStatusLines().join("\n"));
});

// Main menu button — view policy settings
composer.callbackQuery("setpolicy:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const repo = getRepo();
  if (ctx.chat?.type === "private") {
    await ctx.reply("This command works in group chats only. Add me to a group and make me an admin.");
    return;
  }
  try {
    const admins = await ctx.getChatAdministrators();
    if (!admins.some((a) => a.user.id === ctx.from!.id)) {
      await ctx.reply("Only group admins can use this command.");
      return;
    }
  } catch {
    await ctx.reply("I need admin permissions in this group to moderate.");
    return;
  }
  const config = await repo.getConfig(ctx.chat!.id);
  const t = config.thresholds;
  const toggles = config.auto_action_toggles;
  const escSteps = t.escalation
    .map((e) => {
      const dur = e.mute_duration_s != null ? `:${e.mute_duration_s}s` : "";
      return `${e.action}${dur}`;
    })
    .join(" → ");
  const lines = [
    "⚙️ Spam policy settings:",
    "",
    `Message rate: ${t.message_rate_count} messages in ${t.message_rate_window_s}s`,
    `Duplicate limit: ${t.duplicate_count}`,
    `Escalation: ${escSteps}`,
    "",
    `Warn: ${toggles.warn_enabled ? "on" : "off"}`,
    `Mute: ${toggles.mute_enabled ? "on" : "off"}`,
    `Kick: ${toggles.kick_enabled ? "on" : "off"}`,
    `Ban: ${toggles.ban_enabled ? "on" : "off"}`,
    "",
    `Admin notifications: ${config.admin_notifications ? "on" : "off"}`,
    "",
    "Reply with:",
    "/setpolicy threshold <rate_count> <window_s> <dupe_count>",
    "/setpolicy toggle <action> <on|off>",
    "/setpolicy escalation <step1,step2,...>",
    "/setpolicy notify <on|off>",
  ];
  try {
    await ctx.editMessageText(lines.join("\n"));
  } catch {
    await ctx.reply(lines.join("\n"));
  }
});

export default composer;