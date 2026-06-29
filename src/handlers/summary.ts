import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { getRepo } from "../state.js";
import type { AuditLogEntry } from "../store/index.js";

const composer = new Composer<Ctx>();

composer.command("summary", async (ctx) => {
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

  const entries = await repo.getAuditLog(chatId, 100);
  const totalCount = await repo.getAuditLogCount(chatId);

  if (entries.length === 0) {
    await ctx.reply("No moderation activity yet. Activity will show here once the bot starts moderating.");
    return;
  }

  // Aggregate counts by action type
  const byAction: Record<string, { total: number; automatic: number }> = {};
  for (const e of entries) {
    if (!byAction[e.action]) {
      byAction[e.action] = { total: 0, automatic: 0 };
    }
    byAction[e.action].total++;
    if (e.automatic) byAction[e.action].automatic++;
  }

  // Recent entries (last 5)
  const recent = entries.slice(0, 5);
  const actionLines = Object.entries(byAction)
    .sort(([, a], [, b]) => b.total - a.total)
    .map(([action, counts]) => {
      const autoStr = counts.automatic > 0 ? ` (${counts.automatic} auto)` : "";
      return `• ${action}: ${counts.total}${autoStr}`;
    });

  const summaryLines = [
    `📊 Moderation summary (${totalCount} total actions):`,
    "",
    ...actionLines,
    "",
    "Recent actions:",
    ...recent.map((e: AuditLogEntry) => {
      const time = new Date(e.time).toLocaleString();
      const tag = e.automatic ? "[auto]" : "";
      return `• ${tag} ${e.action} → ${e.target_name} — ${time}`;
    }),
  ];

  await ctx.reply(summaryLines.join("\n"));
});

export default composer;
