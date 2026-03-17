/**
 * View-model types for the Universal Legal Corpus UI layer.
 * These are shaped for Svelte components — flattened, with computed fields.
 * DB types are inferred from Drizzle schema (LegalNode, LibraryDocument, etc.).
 */

// ============================================
// Document views
// ============================================

/** Card display on /library listing */
export interface DocumentCard {
	id: string;
	title: string;
	shortTitle: string | null;
	citation: string | null;
	jurisdiction: string | null;        // resolved name, not FK
	jurisdictionCode: string | null;
	corpusType: string;
	sourceType: string;
	processingStatus: string;
	effectiveDate: string | null;       // ISO date
	sourceConfidence: string;
	pageCount: number | null;
	isOfficial: boolean;
	nodeCount: number;                  // aggregated
	chunkCount: number;                 // aggregated
	createdAt: string;
}

/** Full document metadata for /library/[documentId] header */
export interface DocumentDetail extends DocumentCard {
	officialUrl: string | null;
	sourceHash: string | null;
	mimeType: string | null;
	minioKey: string;
	versions: DocumentVersionSummary[];
}

/** Version row in version history panel */
export interface DocumentVersionSummary {
	id: string;
	versionLabel: string | null;
	sourceDate: string | null;
	isCurrent: boolean;
	amendmentNote: string | null;
}

// ============================================
// TOC / tree navigation
// ============================================

/** TOC sidebar node for /library/[documentId] */
export interface DocumentTocNode {
	id: string;
	parentId: string | null;
	label: string;                      // heading or citationLabel fallback
	nodeType: string;
	ordinal: string | null;
	heading: string | null;
	citationLabel: string | null;
	nodePath: string;
	depth: number;
	hasChildren: boolean;
	children: DocumentTocNode[];
}

// ============================================
// Reader pane
// ============================================

/** Full node content for the main reader text pane */
export interface ReaderNode {
	id: string;
	documentId: string;
	nodeType: string;
	heading: string | null;
	citationLabel: string | null;
	fullText: string;
	textClean: string;
	pageStart: number | null;
	pageEnd: number | null;
	depth: number;
	nodePath: string;
	glossaryTerms: GlossaryTermRef[];   // definitions found in this node
	citedAuthorities: CitedAuthorityRef[]; // outgoing citations from this node
}

/** Inline glossary reference within reader text */
export interface GlossaryTermRef {
	id: string;
	term: string;
	definitionText: string;
	confidence: number;
}

/** Outgoing citation link within reader text */
export interface CitedAuthorityRef {
	id: string;
	citationText: string;
	citationType: string;
	normalizedTarget: string | null;
	toNodeId: string | null;            // null if target not ingested
	toNodeHeading: string | null;
}

// ============================================
// Glossary views
// ============================================

/** Card for /library/glossary term listing */
export interface GlossaryTermCard {
	id: string;
	term: string;
	normalizedTerm: string;
	category: string | null;            // derived from node context
	shortDefinition: string;            // truncated definitionText
	definitionText: string;
	sourceNodeCount: number;            // how many nodes define/reference this term
	linkedDocuments: GlossaryLinkedDoc[];
	confidence: number;
}

/** Compact doc reference in glossary card */
export interface GlossaryLinkedDoc {
	documentId: string;
	title: string;
	citationLabel: string | null;
}

// ============================================
// Search results
// ============================================

/** Unified search hit across legal corpus */
export interface LegalSearchHit {
	documentId: string;
	nodeId: string | null;
	chunkId: string | null;
	title: string;
	citationLabel: string | null;
	heading: string | null;
	snippet: string;                    // highlighted text excerpt
	jurisdiction: string | null;
	corpusType: string;
	score: number;
	sourceConfidence: string;
	matchType: 'semantic' | 'fulltext' | 'prefix' | 'hybrid';
}

// ============================================
// Case ↔ corpus linkage
// ============================================

/** Linked legal authority shown on case detail page */
export interface CaseLinkedAuthority {
	linkId: string;
	category: string;                   // charged_under, cited_authority, etc.
	documentId: string | null;
	documentTitle: string | null;
	nodeId: string | null;
	nodeHeading: string | null;
	citationText: string | null;
	relevanceScore: number | null;
	notes: string | null;
	createdAt: string;
}

/** Case summary with linked POI, evidence, and legal authorities */
export interface CaseWithCorpus {
	id: string;
	title: string;
	caseNumber: string | null;
	status: string;
	priority: string;
	jurisdiction: string | null;
	court: string | null;
	clientName: string | null;
	opposingParty: string | null;
	filingDate: string | null;
	persons: CasePersonSummary[];
	evidenceItems: CaseEvidenceSummary[];
	linkedAuthorities: CaseLinkedAuthority[];
	crimes: CaseCrimeSummary[];
}

/** POI summary for case detail */
export interface CasePersonSummary {
	personId: string;
	fullName: string;
	role: string | null;
	riskLevel: string | null;
	relationshipType: string | null;
	isPrimary: boolean;
}

/** Evidence summary for case detail */
export interface CaseEvidenceSummary {
	id: string;
	kind: string;
	title: string;
	description: string | null;
	mimeType: string | null;
	sizeBytes: string | null;
	hash: string | null;
	tags: string[];
	aiSummary: string | null;
	createdAt: string;
}

/** Crime/charge summary */
export interface CaseCrimeSummary {
	id: string;
	crimeCode: string;
	crimeCategory: string;
	crimeClassification: string;
	attempted: boolean;
	sentencingYear: number | null;
	sentenceLengthMonths: number | null;
	enhancements: string[] | null;
}

// ============================================
// Ingestion / pipeline
// ============================================

/** Ingestion job progress for SSE streaming */
export interface IngestionProgress {
	jobId: string;
	documentId: string;
	stage: string;
	status: string;
	progress: number;                   // 0..100
	errorText: string | null;
	metrics: Record<string, unknown>;
}

// ============================================
// State constitution corpus
// ============================================

/** State card for /library/corpus */
export interface StateConstitutionCard {
	stateCode: string;
	stateName: string;
	isOfficial: boolean;
	sourceConfidence: string;
	format: string;
	lastFetchedAt: string | null;
	lastFetchStatus: string | null;
	documentId: string | null;
	processingStatus: string | null;
	nodeCount: number;
	chunkCount: number;
}
