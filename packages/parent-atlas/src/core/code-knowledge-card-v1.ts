/** CODE-KNOW: proposal-only cards. Never mint or repair packet identities. */
export type CardKindV1 = 'symbol' | 'module' | 'package' | 'library_nuance' | 'citation';
export interface SourceCitationV1 {
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  start_byte: number;
  end_byte: number;
  content_hash: string;
}
export interface KnowledgeCardBaseV1 {
  schema_version: 'atlas.code-knowledge-card.v1';
  card_kind: CardKindV1;
  packet_key: string;
  citation: SourceCitationV1;
  receipt_id: string | null;
  predicate_id: string | null;
  admitted: boolean;
}
export interface SymbolKnowledgeCardV1 extends KnowledgeCardBaseV1 {
  card_kind: 'symbol';
  symbol_version_id: string;
  language: string;
  symbol_kind: string;
  qualified_name: string;
  signature: string | null;
}
export interface ModuleKnowledgeCardV1 extends KnowledgeCardBaseV1 {
  card_kind: 'module';
  module_path: string;
  imports: string[];
  exports: string[];
}
export interface PackageKnowledgeCardV1 extends KnowledgeCardBaseV1 {
  card_kind: 'package';
  package_name: string;
  package_version: string | null;
  declared_dependencies: string[];
}
export interface LibraryNuanceCardV1 extends KnowledgeCardBaseV1 {
  card_kind: 'library_nuance';
  library_name: string;
  language: string;
  constraint: string;
}
export interface CitationKnowledgeCardV1 extends KnowledgeCardBaseV1 {
  card_kind: 'citation';
  statement: string;
}
export type CodeKnowledgeCardV1 = SymbolKnowledgeCardV1 | ModuleKnowledgeCardV1 | PackageKnowledgeCardV1 | LibraryNuanceCardV1 | CitationKnowledgeCardV1;
const digest = /^sha256:[0-9a-f]{64}$/;
export function validateKnowledgeCardV1(card: CodeKnowledgeCardV1): string[] {
  const errors: string[] = [];
  if (card.schema_version !== 'atlas.code-knowledge-card.v1') errors.push('SCHEMA_MISMATCH');
  if (!card.packet_key) errors.push('PACKET_KEY_MISSING');
  if (!card.citation.source_ref || !digest.test(card.citation.source_revision) || !digest.test(card.citation.workspace_revision) || !digest.test(card.citation.content_hash)) errors.push('PROVENANCE_UNQUALIFIED');
  if (!Number.isSafeInteger(card.citation.start_byte) || card.citation.start_byte < 0 || !Number.isSafeInteger(card.citation.end_byte) || card.citation.end_byte <= card.citation.start_byte) errors.push('SPAN_INVALID');
  if (!card.admitted || !card.receipt_id || !card.predicate_id) errors.push('EVIDENCE_NOT_ADMITTED');
  if (card.card_kind === 'symbol' && !card.symbol_version_id) errors.push('SYMBOL_VERSION_MISSING');
  return errors;
}
/** Does not claim execution of the OaK tool; only prepares validated inputs. */
export function compileSymbolEvidenceBundleV1(cards: CodeKnowledgeCardV1[]) {
  const admitted = cards.flatMap((card) => card.card_kind === 'symbol' && validateKnowledgeCardV1(card).length === 0 ? [card] : []);
  return { capability: 'oak.find_symbol_evidence', status: admitted.length ? 'PROPOSAL_ONLY' as const : 'BLOCKED' as const, cards: admitted };
}
