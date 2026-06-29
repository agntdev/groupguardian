import { Composer } from "grammy";
import { readdirSync } from "node:fs";
import { createBot, type BotContext } from "./toolkit/index.js";
import { getRepo, getDataStore } from "./state.js";

// The per-chat session shape (ephemeral conversation state only). Extend as the
// bot grows. Durable domain data must NOT live here — use the toolkit's
// persistent storage (see AGENTS.md).
export interface Session {
  // Multi-step flow state (used by setwelcome, setrules, setpolicy flows)
  step?: string;
  pendingField?: string;
}

export type Ctx = BotContext<Session>;

// Export repo + store so handlers can import them directly.
export { getRepo, getDataStore } from "./state.js";

/**
 * buildBot — assembles the bot, AUTO-LOADS every feature handler from
 * src/handlers/, then registers the global fallback. Does NOT start the bot.
 * Add a feature by creating src/handlers/<name>.ts that default-exports a grammY
 * Composer — NEVER edit this file (concurrent feature PRs would conflict).
 */
export async function buildBot(token: string) {
  // Initialize persistent state before registering handlers
  const repo = getRepo();
  const store = getDataStore();

  const bot = createBot<Session>(token, {
    initial: () => ({}),
  });

  const dir = new URL("./handlers/", import.meta.url);
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter(
      (f) =>
        (f.endsWith(".js") || f.endsWith(".ts")) &&
        !f.endsWith(".d.ts") &&
        !f.includes(".test.") &&
        !f.includes(".spec."),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    files = []; // no handlers/ dir yet → nothing to load
  }
  for (const file of files.sort()) {
    const mod = (await import(new URL(file, dir).href)) as { default?: Composer<Ctx> };
    if (!mod.default) {
      throw new Error(`handler ${file} must default-export a grammY Composer`);
    }
    bot.use(mod.default);
  }

  // Catch-all fallback for unknown text in private chats.
  // In group chats, group-moderation handlers handle everything — ordinary
  // conversation must never trigger replies.
  bot.on("message:text", async (ctx) => {
    if (ctx.chat?.type === "private") {
      await ctx.reply("Sorry, I didn't understand that. Try /help.");
    }
    // In groups: silently ignore non-command messages (spam detection runs
    // in its own middleware registered by the verification handler).
  });

  return bot;
}
