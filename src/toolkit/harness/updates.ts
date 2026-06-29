import type { Chat, ChatMemberUpdated, MessageEntity, Update, User } from "grammy/types";

// Synthetic Update builders for the replay harness. Ids/dates are caller-supplied
// (the runner assigns them deterministically per step) so replays are reproducible.

const DEFAULT_CHAT_ID = 1;
const DEFAULT_USER_ID = 1;
/** Id the harness uses for the bot's own user (matches the fake botInfo). */
export const HARNESS_BOT_ID = 42;

function privateChat(id: number): Chat.PrivateChat {
  return { id, type: "private", first_name: "Test" };
}

function supergroupChat(id: number): Chat.SupergroupChat {
  return { id, type: "supergroup", title: "Test Group" };
}

function humanUser(id: number): User {
  return { id, is_bot: false, first_name: "Test" };
}

/** bot_command entity for a leading "/cmd" so grammY's command router matches. */
function botCommandEntities(text: string): MessageEntity[] | undefined {
  const m = /^\/[A-Za-z0-9_]+/.exec(text);
  return m ? [{ type: "bot_command", offset: 0, length: m[0].length }] : undefined;
}

/** A text message update. A leading "/command" automatically gets a bot_command entity. */
export function textUpdate(
  updateId: number,
  text: string,
  opts?: { chatId?: number; userId?: number },
): Update {
  const chatId = opts?.chatId ?? DEFAULT_CHAT_ID;
  const userId = opts?.userId ?? DEFAULT_USER_ID;
  const entities = botCommandEntities(text);
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: 0,
      chat: privateChat(chatId),
      from: humanUser(userId),
      text,
      ...(entities ? { entities } : {}),
    },
  };
}

/**
 * A text message in a group/supergroup chat. Leading "/command" automatically
 * gets a bot_command entity. Use this for testing admin commands and spam
 * detection in group context.
 */
export function groupTextUpdate(
  updateId: number,
  text: string,
  opts?: { chatId?: number; userId?: number; replyToMessageId?: number; replyToUserId?: number; replyToFirstName?: string; firstName?: string },
): Update {
  const chatId = opts?.chatId ?? DEFAULT_CHAT_ID;
  const userId = opts?.userId ?? DEFAULT_USER_ID;
  const firstName = opts?.firstName ?? "Test";
  const entities = botCommandEntities(text);
  const message: Record<string, unknown> = {
    message_id: updateId,
    date: 0,
    chat: supergroupChat(chatId),
    from: { id: userId, is_bot: false, first_name: firstName },
    text,
    ...(entities ? { entities } : {}),
  };
  if (opts?.replyToMessageId) {
    message.reply_to_message = {
      message_id: opts.replyToMessageId,
      date: 0,
      chat: supergroupChat(chatId),
      from: { id: opts.replyToUserId ?? userId + 1, is_bot: false, first_name: opts.replyToFirstName ?? "Target" },
      text: "(replied message)",
    };
  }
  return { update_id: updateId, message: message as unknown as Update["message"] };
}

/**
 * A chat_member update for new-member join testing.
 * Use this to simulate a user joining a supergroup (triggers the on("chat_member") handler).
 */
export function memberJoinUpdate(
  updateId: number,
  opts?: { chatId?: number; userId?: number; firstName?: string },
): Update {
  const chatId = opts?.chatId ?? DEFAULT_CHAT_ID;
  const userId = opts?.userId ?? DEFAULT_USER_ID;
  const firstName = opts?.firstName ?? "Test";
  const chatMemberUpdated: ChatMemberUpdated = {
    chat: supergroupChat(chatId),
    from: humanUser(userId),
    date: 0,
    old_chat_member: { user: humanUser(userId), status: "left" },
    new_chat_member: { user: humanUser(userId), status: "member" },
  };
  return {
    update_id: updateId,
    chat_member: chatMemberUpdated,
  };
}

/** A callback-query update (button tap). Includes the message the button was on,
 *  so handlers can edit it. */
export function callbackUpdate(
  updateId: number,
  data: string,
  opts?: { chatId?: number; userId?: number; messageId?: number },
): Update {
  const chatId = opts?.chatId ?? DEFAULT_CHAT_ID;
  const userId = opts?.userId ?? DEFAULT_USER_ID;
  const messageId = opts?.messageId ?? updateId;
  return {
    update_id: updateId,
    callback_query: {
      id: String(updateId),
      from: humanUser(userId),
      message: {
        message_id: messageId,
        date: 0,
        chat: privateChat(chatId),
        from: { id: HARNESS_BOT_ID, is_bot: true, first_name: "TestBot" },
        text: "(previous)",
      },
      chat_instance: `ci-${chatId}`,
      data,
    },
  };
}

/**
 * A callback-query update where the originating chat is a supergroup.
 * Use this for group-context callback tests (e.g. verification button in a group).
 */
export function groupCallbackUpdate(
  updateId: number,
  data: string,
  opts?: { chatId?: number; userId?: number; messageId?: number },
): Update {
  const chatId = opts?.chatId ?? DEFAULT_CHAT_ID;
  const userId = opts?.userId ?? DEFAULT_USER_ID;
  const messageId = opts?.messageId ?? updateId;
  return {
    update_id: updateId,
    callback_query: {
      id: String(updateId),
      from: humanUser(userId),
      message: {
        message_id: messageId,
        date: 0,
        chat: supergroupChat(chatId),
        from: { id: HARNESS_BOT_ID, is_bot: true, first_name: "TestBot" },
        text: "(previous)",
      },
      chat_instance: `ci-${chatId}`,
      data,
    },
  };
}
