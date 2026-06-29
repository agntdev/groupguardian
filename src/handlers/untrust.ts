import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import { now } from "../lib/index.js";

const composer = new Composer<Ctx>();

composer.command("untrust", async (ctx) => {
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
    await ctx.reply("Reply to a user's message with /untrust to revoke their trusted status.", {
      reply_parameters: { message_id: ctx.message!.message_id },
    });
    return;
  }

  const targetId = replyTo.from.id;
  const targetName = replyTo.from.first_name;

  const isTrusted = await repo.isTrusted(chatId, targetId);
  if (!isTrusted) {
    await ctx.reply(`${targetName} isn't trusted.`);
    return;
  }

  await repo.removeTrusted(chatId, targetId);

  // Also update member record
  const member = await repo.getMember(chatId, targetId);
  if (member) {
    await repo.upsertMember(chatId, { ...member, trusted_flag: false });
  }

  await ctx.reply(`🔓 ${targetName} is no longer trusted — automated moderation now applies.`);

  // Audit log
  await repo.appendAuditLog(chatId, {
    actor: actorId,
    actor_name: actorName,
    action: "untrust",
    target: targetId,
    target_name: targetName,
    time: now(),
    reason: "Removed trusted status",
    automatic: false,
    chat_id: chatId,
  });
});

export default composer;
