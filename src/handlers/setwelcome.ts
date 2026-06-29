import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import { now } from "../lib/index.js";

const composer = new Composer<Ctx>();

composer.command("setwelcome", async (ctx) => {
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

  const text = ctx.match?.trim() || "";
  if (!text) {
    const config = await repo.getConfig(chatId);
    await ctx.reply(
      `Current welcome message:\n\n${config.welcome_text}\n\nReply with /setwelcome <message> to change it.`,
    );
    return;
  }

  await repo.updateConfig(chatId, { welcome_text: text });

  await ctx.reply(`✅ Welcome message updated. New members will see:\n\n${text}`);

  // Audit log
  await repo.appendAuditLog(chatId, {
    actor: actorId,
    actor_name: actorName,
    action: "config",
    target: null,
    target_name: "config",
    time: now(),
    reason: "Updated welcome message",
    automatic: false,
    chat_id: chatId,
  });
});

export default composer;
