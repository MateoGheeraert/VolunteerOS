/**
 * Mila, the AI assistant, as building blocks. Use these wherever the AI shows up, so she looks the
 * same on every page (her colors are the `mila-*` tokens and the `bg-mila-gradient` utilities in
 * globals.css, her buttons the `mila` and `mila-soft` Button variants):
 * - MilaPanel: her section on a page, with her face, name and an action.
 * - MilaBar: her in one line, where the page's own content comes first.
 * - MilaSuggestion (+ MilaSuggestionList): one proposal to accept or reject.
 * - MilaBubble: her asking or telling something.
 * - MilaThinking: while she works. MilaBadge: marks something as hers.
 * - MilaAvatar: her face alone.
 */
export { MILA_NAME, MilaAvatar } from './mila-avatar';
export { MilaBar } from './mila-bar';
export { MilaBubble } from './mila-bubble';
export { MilaPanel } from './mila-panel';
export { MilaBadge, MilaThinking } from './mila-status';
export { MilaSuggestion, MilaSuggestionList } from './mila-suggestion';
