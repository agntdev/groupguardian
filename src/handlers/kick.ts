import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import { now } from "../lib/index.js";

const composer = new Composer<Ctx>();

composer.command("kick", async (ctx) => {
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
    await ctx.reply("Reply to a user's message with /kick <reason> to kick them.", {
      reply_parameters: { message_id: ctx.message!.message_id },
    });
    return;
  }

  const targetId = replyTo.from.id;
  const targetName = replyTo.from.first_name;
  const reason = ctx.match?.trim() || "No reason given";

  try {
    await ctx.api.banChatMember(chatId, targetId);
    // Unban immediately — this is a kick, not a ban
    await ctx.api.unbanChatMember(chatId, targetId);

    await ctx.reply(
      `🚫 ${targetName} was kicked by ${actorName}.\nReason: ${reason}`,
      { reply_parameters: { message_id: replyTo.message_id } },
    );

    // Audit log
    await repo.appendAuditLog(chatId, {
      actor: actorId,
      actor_name: actorName,
      action: "kick",
      target: targetId,
      target_name: targetName,
      time: now(),
      reason,
      automatic: false,
      chat_id: chatId,
    });
  } catch {
    await ctx.reply("Couldn't kick that user. Make sure I have the right admin permissions.");
  }
});

export default composer;