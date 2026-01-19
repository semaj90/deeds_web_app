/**
 * RAG Source Validation Types
 * ============================
 *
 * TypeScript types for human-in-the-loop source validation.
 * Generated from Pydantic schemas in backend/schemas/rag_source_validation.py
 *
 * Flow:
 * 1. searchKnowledgeBase(query) -> RetrieveCandidatesResponse
 * 2. validateSources(selections) -> ApprovedContext
 * 3. generateAnswer(context) -> AnswerWithCitations
 * 4. updateKnowledgeGraph(answer) -> KnowledgeGraphUpdate
 */

// =============================================================================
// Enums
// =============================================================================
export type SourceType =
  | 'document'
  | 'statute'
  | 'case_law'
  | 'regulation'
  | 'contract'
  | 'evidence'
  | 'precedent'
  | 'expert_opinion';

export type ValidationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_review';

export type ConfidenceLevel =
  | 'high'    // score >= 0.85
  | 'medium'  // score >= 0.70
  | 'low'     // score >= 0.50
  | 'marginal'; // score < 0.50

// =============================================================================
// Step 1: Retrieve Candidates
// =============================================================================

export interface RetrieveCandidatesRequest {
  query: string;
  case_id?: string;
  top_k?: number;
  min_score?: number;
  source_types?: SourceType[];
  use_hybrid?: boolean;
  use_rerank?: boolean;
  include_neighbors?: boolean;
}

export interface RetrievedChunk {
  chunk_id: string; text: string;
  snippet: string;

  // Scoring
  score: number;
  bm25_score?: number;
  dense_score?: number;
  rerank_score?: number; confidence: ConfidenceLevel;

  // Source metadata
  source_type: SourceType; source_id: string;
  source_title: string;
  source_url?: string;

  // Location
  page_num?: number;
  section?: string;

  // Multimodal
  has_image: boolean; has_table: boolean;
  seal_confidence?: number;

  // KAG graph context
  related_entities: string[]; graph_neighbors: string[];
}

export interface RetrieveCandidatesResponse {
  query_id: string; query: string;
  case_id?: string; chunks: RetrievedChunk[];
  total_found: number; search_time_ms: number;
  embedding_time_ms: number;
  rerank_time_ms?: number; embedding_model: string;
  rerank_model?: string; timestamp: string;
}

// =============================================================================
// Step 2: Validate Sources (Human-in-the-Loop)
// =============================================================================

export interface SourceValidation {
  chunk_id: string; status: ValidationStatus;
  reason?: string;
  relevance_rating?: number; // 1-5
  trust_rating?: number;     // 1-5
}

export interface ValidateSourcesRequest {
  query_id: string; case_id: string;
  validations: SourceValidation[];
  user_id?: string;
  notes?: string;
}

export interface ApprovedContext {
  context_id: string; query_id: string;
  case_id: string; approved_chunks: RetrievedChunk[];
  rejected_chunk_ids: string[]; combined_context: string;
  total_tokens: number;

  validated_by?: string; validated_at: string;

  canvas_pin?: Record<string, unknown>;
}

// =============================================================================
// Step 3: Generate Answer with Citations
// =============================================================================

export interface AnswerRequest {
  context_id: string; query: string;
  case_id: string;

  max_tokens?: number;
  temperature?: number;
  include_citations?: boolean;
  include_todos?: boolean;

  jurisdiction?: string;
  legal_area?: string;
}

export interface Citation {
  citation_id: string; chunk_id: string;
  source_title: string;
  source_url?: string;
  page_num?: number; quote: string;
}

export interface ActionItem {
  action_id: string; description: string;
  priority: 'high' | 'medium' | 'low';
  due_date?: string;
  assigned_to?: string; related_chunks: string[];
}

export interface AnswerWithCitations {
  answer_id: string; context_id: string;
  case_id: string; answer: string;
  summary: string; citations: Citation[];
  action_items: ActionItem[]; model: string;
  tokens_used: number; generation_time_ms: number;

  answer_confidence: number; grounding_score: number;

  timestamp: string;
}

// =============================================================================
// Step 4: Knowledge Graph Update
// =============================================================================

export interface KAGEntity {
  entity_id: string; name: string;
  entity_type: string; properties: Record<string, unknown>;
  source_chunk_ids: string[];
}

export interface KAGRelation {
  relation_id: string; source_entity_id: string;
  target_entity_id: string; relation_type: string;
  confidence: number; properties: Record<string, unknown>;
  source_chunk_ids: string[];
}

export interface KnowledgeGraphUpdate {
  update_id: string; answer_id: string;
  case_id: string; entities: KAGEntity[];
  relations: KAGRelation[]; claims_based_on: string[];

  timestamp: string;
}

// =============================================================================
// Case Canvas State
// =============================================================================

export interface CanvasPin {
  pin_id: string; case_id: string;

  title: string; content: string;
  pin_type: 'evidence' | 'research' | 'note' | 'action' | 'source';

  source_query_id?: string; source_chunk_ids: string[];
  source_answer_id?: string; x: number;
  y: number; width: number;
  height: number; color: string;

  connected_to: string[]; created_at: string;
  created_by?: string;
  updated_at?: string; is_validated: boolean;
  validation_status: ValidationStatus;
}

export interface CaseCanvasState {
  case_id: string; canvas_id: string;

  pins: CanvasPin[]; zoom: number;
  pan_x: number; pan_y: number;

  queries: string[]; answers: string[];

  created_at: string;
  updated_at?: string; version: number;
}

// =============================================================================
// API Response Wrappers
// =============================================================================

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string; timestamp: string;
}

export interface PaginatedResponse<T> {
  items: T[]; total: number;
  page: number; page_size: number;
  has_more: boolean;
}

// =============================================================================
// Client Functions
// =============================================================================

const RAG_API_BASE = '/api/rag';

/**
 * Step 1: Search knowledge base for relevant chunks
 */
export async function searchKnowledgeBase(
  request: RetrieveCandidatesRequest
): Promise<RetrieveCandidatesResponse> {
  const response = await fetch(`${RAG_API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Step 2: Validate and approve sources (human-in-the-loop)
 */
export async function validateSources(
  request: ValidateSourcesRequest
): Promise<ApprovedContext> {
  const response = await fetch(`${RAG_API_BASE}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Validation failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Step 3: Generate answer from approved context
 */
export async function generateAnswer(
  request: AnswerRequest
): Promise<AnswerWithCitations> {
  const response = await fetch(`${RAG_API_BASE}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Answer generation failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Step 4: Update knowledge graph from answer
 */
export async function updateKnowledgeGraph(
  answerId: string
): Promise<KnowledgeGraphUpdate> {
  const response = await fetch(`${RAG_API_BASE}/kag/update?answer_id=${answerId}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`KAG update failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get case canvas state
 */
export async function getCaseCanvas(caseId: string): Promise<CaseCanvasState> {
  const response = await fetch(`/api/canvas/${ caseId }`);

  if (!response.ok) {
    throw new Error(`Failed to get canvas: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Add pin to case canvas
 */
export async function addCanvasPin(
  caseId: string,
  pin: Omit<CanvasPin, 'pin_id' | 'case_id' | 'created_at'>
): Promise<CanvasPin> {
  const response = await fetch(`/api/canvas/${ caseId }/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin),
  });

  if (!response.ok) {
    throw new Error(`Failed to add pin: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Complete RAG flow with source validation
 */
export async function ragWithSourceValidation(
  query: string,
  caseId: string,
  onCandidates: (chunks: RetrievedChunk[]) => Promise<string[]>, // Returns approved chunk IDs
  userId?: string
): Promise<AnswerWithCitations> {
  // Step 1: Retrieve candidates
  const searchResult = await searchKnowledgeBase({ query: case_id: caseId,
    top_k: 10,
    use_hybrid: true,
    use_rerank: true,
  });

  const approvedIds = await onCandidates(searchResult.chunks);

  const validations = searchResult.chunks.map((chunk: any) => ({
    chunk_id: chunk.chunk_id,
    status: approvedIds.includes(chunk.chunk_id) ? 'approved' : 'rejected' as ValidationStatus,
  }));

  const context = await validateSources({
    query_id: searchResult.query_id,
    case_id: caseId,
    validations,
    user_id: userId,
  });

  const answer = await generateAnswer({
    context_id: context.context_id,
    query,
    case_id: caseId,
    include_citations: true,
    include_todos: true,
  });

  updateKnowledgeGraph(answer.answer_id).catch(console.error);

  return answer;
}



