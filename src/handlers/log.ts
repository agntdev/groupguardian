import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import { paginate } from "../toolkit/index.js";

const composer = new Composer<Ctx>();
const PER_PAGE = 5;

composer.command("log", async (ctx) => {
  const chatId = ctx.chat!.id;
  const actorId = ctx.from!.id;
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

  await renderLog(ctx, ctx.chat!.id, 0);
});

// Pagination callback
composer.callbackQuery(/^log:page:prev:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.callbackQuery.data.split(":")[3], 10);
  await renderLog(ctx, ctx.chat!.id, page);
});

composer.callbackQuery(/^log:page:next:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.callbackQuery.data.split(":")[3], 10);
  await renderLog(ctx, ctx.chat!.id, page);
});

async function renderLog(ctx: Ctx, chatId: number, page: number) {
  const repo = getRepo();
  const entries = await repo.getAuditLog(chatId, 50);
  const totalCount = await repo.getAuditLogCount(chatId);

  if (entries.length === 0) {
    const text = "No moderation actions yet. The log will show here once actions are taken.";
    try {
      await ctx.editMessageText(text);
    } catch {
      await ctx.reply(text);
    }
    return;
  }

  const result = paginate(entries, {
    page,
    perPage: PER_PAGE,
    callbackPrefix: "log:page",
    prevLabel: "« Newer",
    nextLabel: "Older »",
  });

  const lines = result.pageItems.map((e, i) => {
    const time = new Date(e.time).toLocaleString();
    const tag = e.automatic ? "[auto]" : "";
    const targetName = e.target_name || "unknown";
    return `${i + 1 + result.page * PER_PAGE}. ${tag} ${e.action} → ${targetName}\n   ${e.reason} — ${time}`;
  });

  const header = `📋 Audit log (${totalCount} total, page ${result.page + 1}/${result.totalPages}):\n`;
  const text = header + lines.join("\n\n");

  const keyboard = result.controls.inline_keyboard.length > 0 ? result.controls : undefined;

  try {
    await ctx.editMessageText(text, { reply_markup: keyboard });
  } catch {
    await ctx.reply(text, { reply_markup: keyboard });
  }
}

export default composer;
