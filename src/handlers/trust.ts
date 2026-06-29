import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import { now } from "../lib/index.js";

const composer = new Composer<Ctx>();

composer.command("trust", async (ctx) => {
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
    await ctx.reply("Reply to a user's message with /trust to mark them as trusted.", {
      reply_parameters: { message_id: ctx.message!.message_id },
    });
    return;
  }

  const targetId = replyTo.from.id;
  const targetName = replyTo.from.first_name;

  const alreadyTrusted = await repo.isTrusted(chatId, targetId);
  if (alreadyTrusted) {
    await ctx.reply(`${targetName} is already trusted.`);
    return;
  }

  await repo.addTrusted(chatId, targetId);

  // Also update member record
  const member = await repo.getMember(chatId, targetId);
  if (member) {
    await repo.upsertMember(chatId, { ...member, trusted_flag: true });
  }

  await ctx.reply(`✅ ${targetName} is now trusted — they'll be exempt from automated moderation.`);

  // Audit log
  await repo.appendAuditLog(chatId, {
    actor: actorId,
    actor_name: actorName,
    action: "trust",
    target: targetId,
    target_name: targetName,
    time: now(),
    reason: "Marked as trusted",
    automatic: false,
    chat_id: chatId,
  });
});

export default composer;
