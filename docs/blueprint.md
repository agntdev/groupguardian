# GroupGuard — Bot specification

**Archetype:** community

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram moderation bot for group chats that automates human verification, detects spam, and provides admin controls. It greets new members, enforces verification, explains automated actions, and maintains a short audit log of moderation events while respecting admin and pinned content exemptions.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Telegram group owners
- Telegram group admins

## Success criteria

- New members are verified within 1 minute or removed
- Spam is detected and escalated according to configured thresholds
- Admins can configure rules and view audit logs
- All automated actions are explained to the group
- Trusted users are exempt from automated actions

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu for new users
- **I’m human — verify** (button, actor: user, callback: verification:confirm) — Verify new member identity and lift restrictions
- **/warn** (command, actor: admin, command: /warn) — Warn a user with a reason
- **/mute** (command, actor: admin, command: /mute) — Mute a user for a specified duration
- **/kick** (command, actor: admin, command: /kick) — Kick a user with a reason
- **/ban** (command, actor: admin, command: /ban) — Ban a user with a reason
- **/trust** (command, actor: admin, command: /trust) — Mark a user as trusted (exempt from automated actions)
- **/untrust** (command, actor: admin, command: /untrust) — Remove a user's trusted status
- **/setwelcome** (command, actor: admin, command: /setwelcome) — Configure the welcome message
- **/setrules** (command, actor: admin, command: /setrules) — Configure the rules message
- **/setpolicy** (command, actor: admin, command: /setpolicy) — Configure spam detection thresholds and escalation policies
- **/log** (command, actor: admin, command: /log) — View recent audit log entries
- **/summary** (command, actor: admin, command: /summary) — View a summary of moderation activity

## Flows

### New Join Verification
_Trigger:_ user joins group

1. Send welcome message with verification button
2. Restrict user from posting
3. Wait for verification button click or timeout
4. If verified: lift restrictions and confirm
5. If timeout: remove user and explain reason

_Data touched:_ Member, Verification session

### Spam Detection & Escalation
_Trigger:_ user sends message

1. Check if user is admin or pinned content (skip if yes)
2. Check for spam heuristics (new account links, duplicates, message rate)
3. If spam detected: apply configured escalation (warn → mute → kick → ban)
4. Post explanation of action to chat
5. Record action in audit log

_Data touched:_ Member, Warning record, Moderation action, Config

### Admin Command Handling
_Trigger:_ admin sends command

1. Parse command and parameters
2. Validate admin permissions
3. Execute action (warn, mute, kick, ban, trust, untrust, setwelcome, setrules, setpolicy, log, summary)
4. Record action in audit log
5. Provide confirmation or error message

_Data touched:_ Member, Warning record, Moderation action, Config, Audit log

### Audit Log Management
_Trigger:_ action occurs

1. Record action details (actor, target, reason, time)
2. Maintain rolling list of last 500 entries
3. Provide /log and /summary commands to view history

_Data touched:_ Audit log

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Member** _(retention: persistent)_ — A chat participant with verification status and trusted flag
  - fields: id, name, join_timestamp, verification_status, trusted_flag, role
- **Verification session** _(retention: session)_ — Pending verification for a new member
  - fields: user_id, deadline, message_ids
- **Warning record** _(retention: persistent)_ — Warnings issued to a member
  - fields: who, why, time
- **Moderation action** _(retention: persistent)_ — Record of a mute/kick/ban/remove action
  - fields: actor, target, reason, time, automatic/manual
- **Config** _(retention: persistent)_ — Per-chat settings for the bot
  - fields: welcome_text, rules_text, verification_timeout, thresholds, trusted_users_list, auto_action_toggles
- **Audit log** _(retention: persistent)_ — Short rolling list of recent moderation actions
  - fields: actor, action, target, time, reason

## Integrations

- **Telegram** (required) — Bot API messaging and moderation
- **Admin notifications** (optional) — Direct messages to admins for escalations/summaries
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure welcome and rules messages
- Set verification timeout and spam thresholds
- Toggle auto-action escalation policies
- Mark users as trusted or untrusted
- View audit logs and summary reports
- Enable/disable admin notifications

## Notifications

- Automated action explanations posted to the group chat
- Admin notifications for escalations and summaries (configurable)
- Periodic summary reports to the group or owner/admin (optional)

## Permissions & privacy

- Bot has read/write access to the group chat
- Bot can restrict user permissions (mute/remove)
- Bot does not store user data beyond what's needed for moderation
- Audit logs are kept for 500 entries max
- Trusted user list is stored per-chat

## Edge cases

- User joins and leaves before verification
- Multiple verification attempts by the same user
- Admin sends a message that would otherwise be flagged as spam
- User sends a message that matches multiple spam heuristics
- Audit log reaches 500 entries and needs to roll over

## Required tests

- Verify new member is restricted and must click verification button
- Test spam detection with various heuristics
- Validate admin commands and audit log recording
- Ensure automated actions are explained to the group
- Test trusted user exemptions from automated actions

## Assumptions

- Verification timeout is 1 minute
- Default spam heuristics: new account links, duplicates, message rate
- Default escalation: warn → mute → kick → ban
- Audit log keeps last 500 actions
- Admin notifications are off by default
