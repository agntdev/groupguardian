import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import { now } from "../lib/index.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";

// Make /setrules reachable from the /start main menu.
registerMainMenuItem({ label: "📜 Set rules", data: "setrules:show", order: 31 });

const composer = new Composer<Ctx>();

// Main menu button — view current rules (admin only)
composer.callbackQuery("setrules:show", async (ctx) => {
  await ctx.answerCallbackQuery();
  const actorId = ctx.from!.id;
  const repo = getRepo();

  if (ctx.chat?.type === "private") {
    await ctx.reply("This command works in group chats only. Add me to a group and make me an admin.");
    return;
  }

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

  const config = await repo.getConfig(ctx.chat!.id);
  const text = `Current rules:\n\n${config.rules_text}\n\nReply with\n/setrules <rules>\nto change them.`;
  const back = inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]);
  try {
    await ctx.editMessageText(text, { reply_markup: back });
  } catch {
    await ctx.reply(text);
  }
});

composer.command("setrules", async (ctx) => {
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
      `Current rules:\n\n${config.rules_text}\n\nReply with /setrules <rules> to change them.`,
    );
    return;
  }

  await repo.updateConfig(chatId, { rules_text: text });

  await ctx.reply(`✅ Rules updated:\n\n${text}`);

  // Audit log
  await repo.appendAuditLog(chatId, {
    actor: actorId,
    actor_name: actorName,
    action: "config",
    target: null,
    target_name: "config",
    time: now(),
    reason: "Updated rules",
    automatic: false,
    chat_id: chatId,
  });
});

export default composer;
