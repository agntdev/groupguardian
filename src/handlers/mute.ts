import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import { now } from "../lib/index.js";

const composer = new Composer<Ctx>();

composer.command("mute", async (ctx) => {
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

  // Get target user from reply
  const replyTo = ctx.message?.reply_to_message;
  if (!replyTo?.from) {
    await ctx.reply("Reply to a user's message with /mute <minutes> to mute them.", {
      reply_parameters: { message_id: ctx.message!.message_id },
    });
    return;
  }

  const targetId = replyTo.from.id;
  const targetName = replyTo.from.first_name;

  // Parse duration: default 5 minutes
  const parts = (ctx.match ?? "").trim().split(/\s+/);
  const durationStr = parts[0];
  let durationS = 300; // 5 min default
  if (durationStr && /^\d+$/.test(durationStr)) {
    durationS = parseInt(durationStr, 10) * 60; // minutes → seconds
    if (durationS < 1) durationS = 60;
    if (durationS > 86400) durationS = 86400; // max 24h
  }
  const reason = parts.slice(1).join(" ").trim() || "No reason given";

  try {
    await ctx.api.restrictChatMember(chatId, targetId, {
      can_send_messages: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
    }, {
      until_date: Math.floor(now() / 1000) + durationS,
    });

    const minStr = durationS >= 60 ? `${durationS / 60} min` : `${durationS}s`;
    await ctx.reply(
      `🔇 ${targetName} was muted by ${actorName} for ${minStr}.\nReason: ${reason}`,
      { reply_parameters: { message_id: replyTo.message_id } },
    );

    // Audit log
    await repo.appendAuditLog(chatId, {
      actor: actorId,
      actor_name: actorName,
      action: "mute",
      target: targetId,
      target_name: targetName,
      time: now(),
      reason,
      automatic: false,
      chat_id: chatId,
    });
  } catch {
    await ctx.reply("Couldn't mute that user. Make sure I have the right admin permissions.");
  }
});

export default composer;
