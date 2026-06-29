import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { Repo } from "../store/index.js";

/**
 * Middleware that restricts subsequent handlers to chat admins/owners.
 * Must run in a group chat. For private chat: always passes (the user
 * is the only participant — they are effectively the "owner").
 */
export function requireAdmin(repo: Repo): Composer<Ctx> {
  const composer = new Composer<Ctx>();

  composer.use(async (ctx, next) => {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;

    if (!chatId || !userId) {
      await ctx.reply("Couldn't verify your identity. Please try again.");
      return;
    }

    // Private chats: allow all (the user is the owner of their own chat)
    if (ctx.chat?.type === "private") {
      return next();
    }

    try {
      const admins = await ctx.getChatAdministrators();
      const isAdmin = admins.some(
        (a) => a.user.id === userId,
      );
      if (!isAdmin) {
        await ctx.reply(
          "Only group admins can use this command. Ask an admin for help.",
        );
        return;
      }
    } catch {
      // If we can't check (e.g., bot lacks permissions), fall back to
      // the member record
      const member = await repo.getMember(chatId, userId);
      if (!member || (member.role !== "admin" && member.role !== "owner")) {
        await ctx.reply(
          "Only group admins can use this command. Ask an admin for help.",
        );
        return;
      }
    }

    return next();
  });

  return composer;
}
