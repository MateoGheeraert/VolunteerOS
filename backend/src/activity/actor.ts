/**
 * Who made a change. Every activity log entry has one.
 * - `user`: a signed-in organizer or admin.
 * - `volunteer`: a volunteer acting through their own (possibly account-free) access.
 * - `ai`: an AI agent, `id` naming the agent, carrying out a command of `onBehalfOfUserId`.
 * - `system`: the application itself (scheduled jobs, scripts), with no id.
 */
export type Actor =
  | { type: 'user'; id: string }
  | { type: 'volunteer'; id: string }
  | { type: 'ai'; id: string; onBehalfOfUserId: string }
  | { type: 'system' };

export const SYSTEM_ACTOR: Actor = { type: 'system' };

export const userActor = (userId: string): Actor => ({ type: 'user', id: userId });
