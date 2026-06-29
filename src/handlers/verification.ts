import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo, getDataStore } from "../state.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { now } from "../lib/index.js";
import { checkMessageRate, checkDuplicate, checkNewAccountLinks } from "../lib/index.js";
import type { SpamThresholds, EscalationStep } from "../store/index.js";

const composer = new Composer<Ctx>();

// ── New Join Verification ─────────────────────────────────────────────────

composer.on("chat_member", async (ctx, next) => {
  const update = ctx.chatMember;
  if (!update) return next();

  // Only act on new members joining (not on updates from existing members)
  // Also skip bots (including the bot itself)
  if (update.new_chat_member.user.is_bot) return next();
  const oldStatus = update.old_chat_member?.status;
  const newStatus = update.new_chat_member?.status;
  if (newStatus !== "member" || oldStatus === "member" || oldStatus === "administrator" || oldStatus === "creator") {
    return next();
  }

  const chatId = ctx.chat!.id;
  const userId = update.new_chat_member.user.id;
  const userName = update.new_chat_member.user.first_name;
  const repo = getRepo();

  const config = await repo.getConfig(chatId);
  const deadline = now() + config.verification_timeout_ms;

  // Upsert member record
  await repo.upsertMember(chatId, {
    id: userId,
    name: userName,
    join_timestamp: now(),
    verification_status: "pending",
    trusted_flag: false,
    role: "member",
  });

  // Register chat
  await repo.registerChat(chatId);

  // Restrict user from sending messages
  try {
    await ctx.api.restrictChatMember(chatId, userId, {
      can_send_messages: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
    });
  } catch {
    // Bot may not have permission to restrict — continue anyway
  }

  // Send welcome + verification button
  const welcomeText = config.welcome_text;
  const msg = await ctx.reply(
    `${welcomeText}\n\nYou have ${config.verification_timeout_ms / 1000} seconds to verify.`,
    {
      reply_markup: inlineKeyboard([
        [inlineButton("I'm human — verify", "verification:confirm")],
      ]),
    },
  );

  // Store verification session
  await repo.setVerificationSession(chatId, {
    user_id: userId,
    chat_id: chatId,
    deadline,
    message_ids: [msg.message_id],
  });

  // Schedule timeout check (runs via setTimeout in the bot process)
  const timeoutMs = config.verification_timeout_ms;
  setTimeout(async () => {
    const r = getRepo();
    const sess = await r.getVerificationSession(chatId, userId);
    if (!sess) return; // already handled (verified or left)

    // Timeout: remove user
    try {
      await ctx.api.banChatMember(chatId, userId);
      // Unban immediately so they can rejoin
      await ctx.api.unbanChatMember(chatId, userId);
    } catch {
      // Bot may lack permissions
    }

    await r.clearVerificationSession(chatId, userId);
    await r.updateMember(chatId, userId, { verification_status: "removed" });

    // Explain the removal
    try {
      await ctx.reply(
        `${userName} was removed — verification timed out. They can rejoin and try again.`,
      );
    } catch {
      // Group message may fail
    }

    // Log
    await r.appendAuditLog(chatId, {
      actor: 0,
      actor_name: "system",
      action: "timeout",
      target: userId,
      target_name: userName,
      time: now(),
      reason: "Verification timeout",
      automatic: true,
      chat_id: chatId,
    });
  }, timeoutMs);

  return next();
});

// ── Verification button callback ──────────────────────────────────────────

composer.callbackQuery("verification:confirm", async (ctx) => {
  await ctx.answerCallbackQuery();

  const userId = ctx.from!.id;
  const chatId = ctx.chat!.id;
  const repo = getRepo();

  const sess = await repo.getVerificationSession(chatId, userId);
  if (!sess) {
    try {
      await ctx.editMessageText("You're already verified, or your verification expired. Welcome!");
    } catch {
      await ctx.reply("You're already verified, or your verification expired. Welcome!");
    }
    return;
  }

  // Verify the user
  await repo.clearVerificationSession(chatId, userId);

  // Lift restrictions
  try {
    await ctx.api.restrictChatMember(chatId, userId, {
      can_send_messages: true,
      can_send_other_messages: true,
      can_add_web_page_previews: true,
      can_send_polls: false,
      can_change_info: false,
      can_invite_users: false,
      can_pin_messages: false,
    });
  } catch {
    // Bot may lack permissions
  }

  // Update member record
  const member = await repo.getMember(chatId, userId);
  if (member) {
    await repo.upsertMember(chatId, { ...member, verification_status: "verified" });
  }

  // Confirm
  try {
    await ctx.editMessageText("✅ Verified — welcome to the group!");
  } catch {
    await ctx.reply("✅ Verified — welcome to the group!");
  }

  // Log
  await repo.appendAuditLog(chatId, {
    actor: 0,
    actor_name: "system",
    action: "verify",
    target: userId,
    target_name: ctx.from!.first_name,
    time: now(),
    reason: "User verified",
    automatic: false,
    chat_id: chatId,
  });
});

// ── Spam Detection ────────────────────────────────────────────────────────

composer.on("message:text", async (ctx, next) => {
  const msg = ctx.message;
  if (!msg) return next();

  const chatId = ctx.chat!.id;

  // Only run in group/supergroup chats
  if (ctx.chat?.type !== "group" && ctx.chat?.type !== "supergroup") {
    return next();
  }

  const userId = ctx.from!.id;
  const text = msg.text ?? "";

  // Check if message is a forwarded or auto-forwarded (skip pinned/admin content)
  // NOTE: forward_* props are on Message.CommonMessage but narrowed away by on("message:text").
  // We check via a cast + optional chaining so the handler correctly skips forwards.
  const commonMsg = msg as { forward_from?: unknown; forward_from_chat?: unknown };
  if (msg.is_automatic_forward || commonMsg.forward_from || commonMsg.forward_from_chat) {
    return next();
  }

  const repo = getRepo();
  const store = getDataStore();

  // Check if user is admin
  try {
    const admins = await ctx.getChatAdministrators();
    if (admins.some((a) => a.user.id === userId)) return next();
  } catch {
    // If we can't check, check the member record
    const memberCheck = await repo.getMember(chatId, userId);
    if (memberCheck && (memberCheck.role === "admin" || memberCheck.role === "owner")) {
      return next();
    }
  }

  // Check if user is trusted
  const trusted = await repo.isTrusted(chatId, userId);
  if (trusted) return next();

  // Load config
  const config = await repo.getConfig(chatId);
  const thresholds: SpamThresholds = config.thresholds;

  // Heuristic 1: new account links
  const member = await repo.getMember(chatId, userId);
  const spamReasons: string[] = [];

  if (member && checkNewAccountLinks(text, member.join_timestamp)) {
    spamReasons.push("link from a new account");
  }

  // Heuristic 2: message rate
  const rateExceeded = await checkMessageRate(
    store,
    chatId,
    userId,
    thresholds.message_rate_count,
    thresholds.message_rate_window_s,
  );
  if (rateExceeded) {
    spamReasons.push("sending messages too fast");
  }

  // Heuristic 3: duplicates
  const isDup = await checkDuplicate(
    store,
    chatId,
    userId,
    text,
    thresholds.duplicate_count,
  );
  if (isDup) {
    spamReasons.push("repeating the same message");
  }

  // No spam detected
  if (spamReasons.length === 0) return next();

  // Determine escalation level based on existing warning count
  const warningCount = await repo.getWarningCount(chatId, userId);
  const escalationIdx = Math.min(warningCount, thresholds.escalation.length - 1);
  let effectiveAction = thresholds.escalation[escalationIdx];

  // Apply toggles: if the target action is disabled, escalate
  const toggles = config.auto_action_toggles;
  const escLen = thresholds.escalation.length;
  let nextIdx = escalationIdx;
  while (
    (effectiveAction.action === "warn" && !toggles.warn_enabled) ||
    (effectiveAction.action === "mute" && !toggles.mute_enabled) ||
    (effectiveAction.action === "kick" && !toggles.kick_enabled) ||
    (effectiveAction.action === "ban" && !toggles.ban_enabled)
  ) {
    nextIdx = Math.min(nextIdx + 1, escLen - 1);
    effectiveAction = thresholds.escalation[nextIdx];
    if (nextIdx >= escLen - 1) break; // at the end, just use whatever we have
  }

  // Execute the action
  const userName = ctx.from!.first_name;
  const reason = spamReasons.join(" and ");
  let actionDesc = "";

  try {
    switch (effectiveAction.action) {
      case "warn": {
        await repo.addWarning(chatId, userId, {
          who: userId,
          by: 0,
          why: reason,
          time: now(),
          chat_id: chatId,
        });
        actionDesc = `⚠️ ${userName} was warned for ${reason}.`;

        // Try to delete the spam message
        try { await ctx.api.deleteMessage(chatId, msg.message_id); } catch { /* bot may lack permission */ }

        break;
      }
      case "mute": {
        const duration = effectiveAction.mute_duration_s ?? 300;
        await ctx.api.restrictChatMember(chatId, userId, {
          can_send_messages: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
        }, {
          until_date: Math.floor(now() / 1000) + duration,
        });
        actionDesc = `🔇 ${userName} was muted for ${duration}s — ${reason}.`;

        try { await ctx.api.deleteMessage(chatId, msg.message_id); } catch { /* bot may lack permission */ }

        break;
      }
      case "kick": {
        await ctx.api.banChatMember(chatId, userId);
        await ctx.api.unbanChatMember(chatId, userId);
        actionDesc = `🚫 ${userName} was kicked — ${reason}.`;
        break;
      }
      case "ban": {
        await ctx.api.banChatMember(chatId, userId);
        actionDesc = `🚫 ${userName} was banned — ${reason}.`;
        break;
      }
    }
  } catch {
    actionDesc = `Tried to ${effectiveAction.action} ${userName} for ${reason} but lacked permissions.`;
  }

  // Post explanation
  try {
    await ctx.reply(actionDesc);
  } catch {
    // Group reply may fail
  }

  // Audit log
  await repo.appendAuditLog(chatId, {
    actor: 0,
    actor_name: "system",
    action: effectiveAction.action,
    target: userId,
    target_name: userName,
    time: now(),
    reason,
    automatic: true,
    chat_id: chatId,
  });
});

export default composer;
