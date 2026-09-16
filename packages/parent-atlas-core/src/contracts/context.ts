/**
 * Context assembly contracts. These are transport shapes only; they do not
 * persist ACE/RLM state or establish canonical source authority.
 */
export interface AceContext {
  kind: 'ace';
  cards: Array<Record<string, unknown>>;
  tokenBudget: number;
  sourceRevision?: string | null;
  workspaceRevision?: string | null;
}

export interface RlmContext {
  kind: 'rlm';
  items: Array<Record<string, unknown>>;
  tokenBudget: number;
  sourceRevision?: string | null;
  workspaceRevision?: string | null;
}
