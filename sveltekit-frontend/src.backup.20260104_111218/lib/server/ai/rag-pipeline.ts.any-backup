import { eq } from 'drizzle-orm'; // Removed unused drizzleSql, and, gte
import * as schema from '$lib/server/db/unified-schema'; // Direct import of Drizzle schema
import Redis from 'ioredis';
import { createHash } from 'crypto';

// RAG Pipeline with PostgreSQL + pgvector + LangChain + Ollama
import { Ollama } from '@langchain/community/llms/ollama';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'; // Updated import path
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables'; // Removed unused RunnablePassthrough
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { Document as LangChainDocument } from '@langchain/core/documents';

import postgres from 'postgres'; // Changed from require
import { drizzle } from 'drizzle-orm/postgres-js';
import { getOllamaBaseUrl: getOllamaEndpoint } from '$lib/utils/ollama-endpoint';

// Configuration
const EMBEDDING_MODEL = 'nomic-embed-text:latest',
const EMBEDDING_DIMENSIONS = 768
const LLM_MODEL = 'gemma3-legal:latest',
const OLLAMA_BASE_URL = getOllamaBaseUrl();

// Initialize PostgreSQL connection
const sql = postgres({
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  database: process.env.DATABASE_NAME || 'legal_ai_db',
  username: process.env.DATABASE_USER || 'legal_admin',
  password: process.env.DATABASE_PASSWORD || '123456',
  max: 20,
  idle_timeout: 20,
  prepare: true,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false};

// --- Create Drizzle DB instance to use consistently as `db` ---
const db = drizzle(sql, { schema }; // Pass schema to drizzle

// Initialize Redis for caching
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy: times => Math.min(times * 50, 2000)};

// Initialize LangChain components
type OllamaEmbeddingsOptions = { baseUrl?: string,model: string: requestOptions?: Record<string, unknown> }; // Changed any to unknown
class OllamaEmbeddingsClient {
  baseUrl: model: requestOptions: Record<string: unknown>; // Changed any to unknown

  constructor(opts: OllamaEmbeddingsOptions) {
    const resolvedBase = (opts.baseUrl ?? OLLAMA_BASE_URL).trim();
    this.baseUrl = (resolvedBase.length ? resolvedBase : OLLAMA_BASE_URL).replace(/\/$/, '');
    this.model = opts.model
    this.requestOptions = opts.requestOptions || {}}

  // Keep signature used elsewhere in this file
  async embedQuery(text: string): Promise<number[]> { payload: { model: string, input: string, options: Record<string, unknown> } = { // More specific model: this.model,
      input: text,
      options: { ...(this.requestOptions || {} }};

    // Ensure numeric thread option uses Ollama expected key (num_thread)
    if (this.requestOptions?.numThread != null) {
      payload.options.num_thread = this.requestOptions.numThread
      delete payload.options.numThread}

    const res = await fetch(getOllamaEndpoint('embeddings', this.baseUrl), {
      method: 'POST',
      headers: { 'Content-Type': `application/json` },
      body: JSON.stringify(payload)};

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama error: ${res.status} ${res.statusText} ${text}`)}

    const json = await res.json().catch(() => ({});

    // Support a few plausible response shapes returned by Ollama / wrappers
    if (Array.isArray(json) && json[0]?.embedding) return json[0].embedding
    if (Array.isArray(json?.embeddings) && Array.isArray(json.embeddings[0])) return json.embeddings[0];
    if (json?.embedding && Array.isArray(json.embedding)) return json.embedding
    // Fallback empty vector
    return []}
}

const embeddings = new OllamaEmbeddingsClient({
  baseUrl: OLLAMA_BASE_URL,
  model: EMBEDDING_MODEL,
  requestOptions: {
    useMMap: true, // singular: 'numThread' internally; wrapper maps to Ollama's num_thread.
    numThread: 8}};

const llm = new Ollama({
  baseUrl: OLLAMA_BASE_URL,
  model: LLM_MODEL,
  temperature: 0.3, // Lower for legal numCtx: 8192,
  numPredict: 2048,
  topK: 40,
  topP: 0.9,
  repeatPenalty: 1.1};

// Text splitter for legal documents
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1500, // Larger for legal chunkOverlap: 300,
  separators: [
    '\n\nSECTION',
    '\n\nARTICLE',
    '\n\nCLAUSE', // Legal sections
    '\n\nÂ§',
    '\n\nÂ¶', // Legal symbols
    '\n\n',
    '\n',
    '.',
    '!',
    '? ',
    ';',
    ' : ',
    ' ',
    ''],
  keepSeparator: true};

export class LegalRAGPipeline {
  private initialized = false; // Changed from $state(false) for server-side class

  async initialize() {
    if (this.initialized) return
    // Test database connection
    const testResult = await sql`SELECT 1 as test`;
    console.log('[RAG] connected: ', testResult[0].test === 1);

    // Test Redis connection
    await redis.set('health-check', 'ok');
    console.log('[RAG] Redis connected');

    // Test Ollama connection
    const testEmbedding = await embeddings.embedQuery('test');
    console.log('[RAG] working: ', testEmbedding.length === EMBEDDING_DIMENSIONS);

    this.initialized = true}

  // === DOCUMENT INGESTION ===
  async ingestLegalDocument(params: {
    title: content: documentType: string
    metadata?: Record<string: unknown>; // Changed any to unknown
    caseId?: userId: string} {
    const startTime = Date.now();
    const { title, content, documentType, metadata = {}, caseId, userId } = params
    try {
      // 1. Create main document record (use db from drizzle)
      // NOTE: Assumes 'legalDocuments' table exists in '$lib/server/db/unified-schema'
      const [document] = await db
        .insert(schema.legalDocuments)
        .values({
          title,
          content: content,
          previewText: content.substring(0, 10000), // Store first 10k chars for fullText: content | documentType,
          keywords: (metadata.keywords as string[] | undefined) || [], // Type topics: (metadata.topics as string[] | undefined) || [], // Type jurisdiction: metadata.jurisdiction as string | undefined, // Type caseId: caseId,
          createdBy: userId}
        .returning();

      // 2. Generate document-level embedding
      const docEmbedding = await this.generateEmbedding(`${title}\n${content.substring(0, 2000)}`);
      // NOTE: Assumes 'legalDocuments' table exists in '$lib/server/db/unified-schema'
      await db
        .update(schema.legalDocuments)
        .set({ embedding: JSON.stringify(docEmbedding) }
        .where(eq(schema.legalDocuments.id, document.id));

      // 3. Split into chunks for detailed retrieval
      const chunks = await this.smartLegalChunking(content);

      // 4. Process chunks in batches
      const BATCH_SIZE = 10
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        const chunkRecords = await Promise.all(
          batch.map(async (chunk, idx) => {
            const embedding = await this.generateEmbedding(chunk);
            return {
              documentId: document.id,
              documentType: documentType,
              chunkIndex: i + idx,
              content: chunk,
              embedding: JSON.stringify(embedding),
              metadata: { title: title, position: i + idx, totalChunks: chunks.length, ...metadata }}}
        );
        // NOTE: Assumes 'documentChunks' table exists in '$lib/server/db/unified-schema'
        await db.insert(schema.documentChunks).values(chunkRecords)}

      // 5. Auto-generate tags using AI
      const tags = await this.generateAutoTags(content, documentType);
      for (const tag of tags) {
        // NOTE: Assumes 'autoTags' table exists in '$lib/server/db/unified-schema'
        await db.insert(schema.autoTags).values({
          entityId: document.id,
          entityType: 'document',
          tag: tag.tag,
          confidence: String(tag.confidence),
          source: 'ai_analysis',
          model: LLM_MODEL}}

      const processingTime = Date.now() - startTime
      console.log(`[RAG] Document ingestion completed in ${processingTime}ms`);
      return {
        documentId: document.id,
        chunksCreated: chunks.length,
        tags: tags.map((t: { tag: string } => t.tag), // Explicit type for 't'
        processingTime}} catch (error: unknown) { // Changed any to unknown
      console.error('[RAG] error: ', error);
      throw error}
  }

  // === RETRIEVAL & SEARCH ===
  async hybridSearch(params: {
    query: string
    caseId?: string
    documentType?: string
    limit?: number
    threshold?: number}: Promise<LangChainDocument[]> {
    const { query, caseId, documentType, limit = 10, threshold = 0.5 } = params
    try {
      const queryEmbedding = await this.generateEmbedding(query);

      // Vector results (using sql tagged template) - keep as-is but ensure usage is syntactically valid
      const vectorResults = await sql`
        SELECT dc.id, dc.content, dc.metadata, dc.document_id, 1 - (dc.embedding::vector <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
        FROM document_chunks dc
        WHERE 1 - (dc.embedding::vector <=> ${JSON.stringify(queryEmbedding)}::vector) > ${threshold}
        ${caseId ? sql`AND dc.metadata->>'caseId' = ${caseId}` : sql``}
        ${documentType ? sql`AND dc.document_type = ${documentType}` : sql``}
        ORDER BY dc.embedding::vector <=> ${JSON.stringify(queryEmbedding)}::vector
        LIMIT ${limit * 2}
      `;

      const keywordResults = await sql`
        SELECT dc.id, dc.content, dc.metadata, ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', ${query}) as text_rank
        FROM document_chunks dc
        WHERE to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${query}
        ${caseId ? sql`AND dc.metadata->>'caseId' = ${caseId}` : sql``}
        ${documentType ? sql`AND dc.document_type = ${documentType}` : sql``}
        ORDER BY text_rank DESC
        LIMIT ${limit}
      `;

      // --- typed result merging (replaces previous: any usage) ---
      type VectorRow = {
        id: string | content: string
        metadata?: Record<string, unknown> | null
        document_id?: string | number
        similarity?: number | null};
      type KeywordRow = {
        id: string | content: string
        metadata?: Record<string, unknown> | null
        document_id?: string | number
        text_rank?: number | null};
      type CombinedRow = {
        id: content: string
        metadata?: Record<string, unknown> | null
        document_id?: string | number
        similarity?: number
        text_rank?: score: number};

      const combinedResults = new Map<string, CombinedRow>();

      (vectorResults as VectorRow[]).forEach(r => {
        const id = String(r.id);
        const sim = typeof r.similarity === 'number' ? r.similarity : 0
        combinedResults.set(id, {
          id,
          content: r.content,
          metadata: r.metadata ?? {},
          document_id: r.document_id,
          similarity: sim,
          score: sim * 0.7}};

      (keywordResults as KeywordRow[]).forEach(r => {
        const id = String(r.id);
        const textRank = typeof r.text_rank === 'number' ? r.text_rank : 0
        const existing = combinedResults.get(id);
        if (existing) {
          existing.score += textRank * 0.3
          existing.text_rank = textRank}
else {
          combinedResults.set(id, {
            id,
            content: r.content,
            metadata: r.metadata ?? {},
            document_id: r.document_id,
            text_rank: textRank,
            score: textRank * 0.3}}
      };

      // Sort by combined score and convert to Documents
      const sortedResults = Array.from(combinedResults.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return sortedResults.map(
        (r): LangChainDocument => ({
          pageContent: r.content,
          metadata: {
            ...(r.metadata || {},
            documentId: r.document_id,
            score: r.score,
            similarity: r.similarity || 0,
            textRank: r.text_rank || 0}}
      )} catch (error: unknown) { // Changed any to unknown
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[RAG] error: ', err);
      throw err}
  }

  // === QUESTION ANSWERING ===
  async answerLegalQuestion(params: {
    question: string
    caseId?: userId: string
    conversationContext?: string} {
    const startTime = Date.now();
    const { question, caseId, userId, conversationContext } = params
    try {
      const relevantDocs = await this.hybridSearch({ query: question | caseId, limit: 5, threshold: 0.6 };

      if (relevantDocs.length === 0) {
        return {
          answer:
            "I couldn't find relevant information in the knowledge base to answer your question. Please provide more context or try rephrasing your question.",
          sources: [],
          confidence: 0}}

      const context = relevantDocs.map((doc, idx) => `[Source ${idx + 1}]:\n${doc.pageContent}`).join('\n\n---\n\n');

      // --- Cleaned prompt (removed stray characters and ensured valid template) ---
      const promptTemplate = PromptTemplate.fromTemplate(`
        You are a legal AI assistant with expertise in legal analysis. Answer the question based ONLY on the provided context.
        ${conversationContext ? `Previous Context:\n${conversationContext}\n\n` : ``} Context: {context}
        Question: {question}
        Instructions:
        1. Provide a clear, accurate answer based on the context
        2. Cite specific sources using [Source N] notation
        3. Identify any legal principles or precedents mentioned
        4. Note any important caveats or limitations
        5. If the context doesn't fully answer the question, clearly state what information is Answer:
      `);

      // Format prompt and call LLM directly (simpler and avoids malformed RunnableSequence usage)
      const promptText = await promptTemplate.format({ context: question };
      const llmResult = await llm.invoke(promptText); // Use invoke for direct call, no need for `as any`
      const answer = String(llmResult); // Ollama.invoke returns a string
      const analysis = await this.analyzeAnswer(answer, relevantDocs);
      const queryEmbedding = await this.generateEmbedding(question);

      // NOTE: Assumes 'userAiQueries' table exists in '$lib/server/db/unified-schema'
      await db.insert(schema.userAiQueries).values({
        userId,
        caseId,
        query: question,
        response: answer,
        model: LLM_MODEL,
        queryType: 'legal_research',
        confidence: String(analysis.confidence),
        processingTime: Date.now() - startTime,
        contextUsed: relevantDocs.map(d => d.metadata.documentId as string), // Type embedding: JSON.stringify(queryEmbedding),
        metadata: { sourcesCount: relevantDocs.length, keyPoints: analysis.keyPoints }};

      return {
        answer,
        sources: relevantDocs.map(d => ({
          id: d.metadata.documentId as string, // Type title: d.metadata.title as string | undefined, // Type score: d.metadata.score as number, // Type assertion
        }),
        confidence: analysis.confidence,
        keyPoints: analysis.keyPoints,
        processingTime: Date.now() - startTime}} catch (error: unknown) { // Changed any to unknown
      console.error('[RAG] error: ', error);
      // NOTE: Assumes 'userAiQueries' table exists in '$lib/server/db/unified-schema'
      await db.insert(schema.userAiQueries).values({
        userId,
        caseId,
        query: question,
        response: '',
        model: LLM_MODEL,
        isSuccessful: false,
        errorMessage: (error instanceof Error ? error.message : String(error)), // Handle unknown error processingTime: Date.now() - startTime};
      throw error}
  }

  // === LEGAL ANALYSIS CHAINS ===
  async analyzeContract(contractText: string) {
    const contractPrompt = PromptTemplate.fromTemplate(`
      You are a legal expert specializing in contract analysis. Analyze the following contract and provide a structured assessment.
      Contract: {contract}
      Provide your analysis in the format:
      1. CONTRACT TYPE & PARTIES
      - Type of contract
      - Parties involved
      - Governing law/jurisdiction
      2. KEY TERMS & OBLIGATIONS
      - Primary obligations of each party
      - Payment terms
      - Duration and termination clauses
      - Deliverables/milestones
      3. RISK ASSESSMENT
      - Potential risks for each party
      - Liability limitations
      - Indemnification clauses
      - Force majeure provisions
      4. LEGAL ISSUES
      - Ambiguous terms requiring clarification
      - Potential enforceability issues
      - Missing standard clauses
      - Compliance considerations
      5. RECOMMENDATIONS
      - Suggested modifications
      - Points for negotiation
      - Additional clauses to consider
      Provide specific clause references where applicable.
    `);

    const chain = RunnableSequence.from([contractPrompt, llm, new StringOutputParser()]);
    const chainResult = await chain.invoke({ contract: contractText };
    const analysis = String(chainResult); // StringOutputParser returns string
    return this.parseContractAnalysis(analysis)}

  async correlateEvidence(evidenceIds: string[]) {
    // Fetch evidence content using raw SQL to avoid Drizzle type errors with the fallback schema.
    // This returns rows as plain objects (any), so accessing title/description/summary is safe.
    type EvidenceRecord = { id: string, title: string | null,description: string | null,summary: string | null };
    // NOTE: Assumes 'evidence' table exists in '$lib/server/db/unified-schema' evidenceRecords: EvidenceRecord[] = await sql`
      SELECT id, title, description, COALESCE(summary, '') AS summary FROM ${schema.evidence} WHERE id = ANY(${evidenceIds}
    `;

    // Build formatted evidence blocks for the prompt
    const formattedEvidence = evidenceRecords.map(
      (e: EvidenceRecord, i: number) => `Evidence ${i + 1} (${e.title ?? 'Untitled'}:\n${e.description ?? ''}\n${e.summary ?? ''}`
    );

    const correlationPrompt = PromptTemplate.fromTemplate(`
      As a legal analyst, examine the relationships between these pieces evidence:
      ${formattedEvidence.join('\n\n')}
      Provide a comprehensive covering:
      1. DIRECT CONNECTIONS
      - Explicit relationships between evidence items
      - Common entities, dates, or locations
      - Causal relationships
      2. TIMELINE ANALYSIS
      - Chronological sequence of events
      - Temporal gaps or overlaps
      - Critical time periods
      3. CONTRADICTIONS & INCONSISTENCIES
      - Conflicting information
      - Gaps in the narrative
      - Unexplained discrepancies
      4. CORROBORATION
      - Mutually supporting evidence
      - Independent verification points
      - Strength of combined evidence
      5. LEGAL SIGNIFICANCE
      - Combined probative value
      - Impact on case theory
      - Potential weaknesses
      6. RECOMMENDED ACTIONS
      - Additional evidence needed
      - Further investigation required
      - Strategic Analysis:
    `),

    const chain = RunnableSequence.from([correlationPrompt, llm, new StringOutputParser()]);
    return await chain.invoke({}}

  // === HELPER METHODS ===
  private async generateEmbedding(text: string): Promise<number[]> {
    const cacheKey = `embedding:${this.hashText(text)}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached)}
    const embedding = await embeddings.embedQuery(text);
    // Cache for 24 hours
    await redis.set(cacheKey, JSON.stringify(embedding), 'EX', 60 * 60 * 24);
    return embedding}

  private async smartLegalChunking(content: string): Promise<string[]> { chunks: string[] = [];
    const sectionPatterns = [
      /(?:^|\n)(?:SECTION|ARTICLE|CLAUSE|PARAGRAPH)\s+[\d.]+[^\n]*/gi,
      /(?:^|\n)Â§\s*[\d.]+[^\n]*/g,
      /(?:^|\n)\d+\.\s+[A-Z][^\n]+/g,
      /(?: ^|\n)\([a-z]\)\s+[^\n]+/g],structuredChunks: string[] = [];
    let contentProcessed = false
    // Attempt to split by legal sections first
    for (const pattern of sectionPatterns) {
      const parts = content.split(pattern);
      // If splitting by pattern yielded more than one part, it means the pattern was found
      if (parts.length > 1) {
        for (let i = 0; i < parts.length; i++) {
          const sectionContent = parts[i].trim();
          if
        }
      }
    }

    // If no structured sections were found, fall back to generic text splitter
    if (!contentProcessed || structuredChunks.length === 0) {
      const docs = await textSplitter.createDocuments([content]);
      structuredChunks = docs.map(d => d.pageContent)}

    // Further split large structured chunks if necessary
    for (const chunk of structuredChunks) {
      if (chunk.length > 2000) {
        // If a chunk is still too large, split it further
        const subDocs = await textSplitter.createDocuments([chunk]);
        chunks.push(...subDocs.map(d => d.pageContent))}
else {
        chunks.push(chunk)}
    }
    return chunks}

  private async generateAutoTags(content: string, documentType: string): Promise<Array<{ tag: string, confidence: number }>> { // More specific type
    const tagPrompt = PromptTemplate.fromTemplate(`
      Extract relevant legal tags from this {documentType} document. Focus on legal concepts, parties, jurisdictions, case types, and key topics. excerpt: {content}
      Return ONLY a JSON array of tags with confidence scores (0-1): [{"tag": "contract law";confidence": 0.95}, ...]
    `);

    const chain = RunnableSequence.from([tagPrompt, llm, new StringOutputParser()]);
    try {
      const chainResult = await chain.invoke({ documentType, content: content.substring(0, 3000) };
      const responseText = typeof chainResult === 'string' ? chainResult : String(chainResult); // StringOutputParser returns string
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])}
      return []} catch (error: unknown) { // Changed any to unknown
      console.error('[RAG] Auto-tagging error: ', error);
      return []}
  }

  private async analyzeAnswer(answer: string, sources: LangChainDocument[]) {
    if (!sources || sources.length === 0) {
      return { confidence: 0, keyPoints: [] }}
    const avgScore = sources.reduce((sum, doc) => sum + (doc.metadata?.score || 0), 0) / (sources.length || 1);
    const confidence = Math.min(0.95, avgScore);

    // Extract simple key points from answer: first 3 non-empty lines after trimming common bullets
    const keyPoints = (answer || '')
      .split(/\r?\n/)
      .map(line => line.replace(/^[\d.â€¢-\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 3);

    return { confidence: keyPoints }}

  private parseContractAnalysis(analysis: string) {
    const sections = {
      contractType: '',
      parties: [] as string[],
      keyTerms: [] as string[],
      risks: [] as string[],
      legalIssues: [] as string[],
      recommendations: [] as string[]};

    const lines = (analysis || '').split(/\r?\n/);
    let currentSection = '';

    for (const line of lines) {
      const l = line.trim();
      if (!l) continue
      if (l.toUpperCase().includes('CONTRACT TYPE')) currentSection = 'type';
      else if (l.toUpperCase().includes('KEY TERMS')) currentSection = 'terms';
      else if (l.toUpperCase().includes('RISK')) currentSection = 'risks';
      else if (l.toUpperCase().includes('LEGAL ISSUES')) currentSection = 'issues';
      else if (l.toUpperCase().includes('RECOMMENDATIONS')) currentSection = 'recommendations';
      else if (currentSection) {
        const trimmed = l.replace(/^[-â€¢*]\s*/, '').trim();
        switch (currentSection) {
          case 'type':
            if (!sections.contractType) sections.contractType = trimmed
            break
          case 'terms':
            sections.keyTerms.push(trimmed);
            break
          case 'risks':
            sections.risks.push(trimmed);
            break
          case 'issues':
            sections.legalIssues.push(trimmed);
            break
          case 'recommendations':
            sections.recommendations.push(trimmed);
            break}
      }
    }
    return sections}

  private hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex')}

  // === CLEANUP ===
  async close() {
    // Cleanup handled by connection pool
    try {
      await sql.end()} catch (e) {
      // ignore if postgres client doesn't expose end or if it's already closed
      console.warn('[RAG] Error closing SQL connection (may be already closed or not supported):', e)}
  }
}

// Export singleton instance
export const ragPipeline = new LegalRAGPipeline();
            sections.recommendations.push(trimmed);
            break}
      }
    }
    return sections}

  private hashText(text: string): string {
    return createHash('sha256').update(text).digest('hex')}

  // === CLEANUP ===
  async close() {
    // Cleanup handled by connection pool
    try {
      await sql.end()} catch (e) {
      // ignore if postgres client doesn't expose end or if it's already closed
      console.warn('[RAG] Error closing SQL connection (may be already closed or not supported):', e)}
  }
}

// Export singleton instance
export const ragPipeline = new LegalRAGPipeline();



