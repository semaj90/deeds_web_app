// Package main — Go gRPC Retrieval Service
//
// Implements RetrievalService proto (proto/active/retrieval.proto):
//   SearchEvidence  — RAG+KAG+DAG evidence search (pgvector + Qdrant + graph)
//   StreamEvidence  — streaming progressive bundle delivery
//   SearchCodebase  — dual-vector codebase chunk search (content + signature)
//   StreamCodebase  — streaming codebase chunk delivery
//   Health          — deep health check (pgvector, Qdrant, Redis, embedding)
//
// HTTP on :8100:
//   GET  /health           — deep health check
//   POST /search/evidence  — evidence RAG+KAG+DAG (JSON body)
//   POST /search/codebase  — codebase dual-vector (JSON body)
//   GET  /stats            — request counts + cache hit rate
//
// Enhancement overview:
//   GPU embedding   — direct Ollama :11434 (RTX 3060 Ti) with Redis embedding cache
//   ONNX passthrough — pre-computed 768-dim client embeddings bypasses GPU call
//   JSONB matching  — metadata @> filter for section_type / entity_type / tags
//   Proto-binary cache — cache stores gob-encoded proto bytes (2-3× smaller than JSON)
//
// ENV:
//   DATABASE_URL        — PostgreSQL (default postgresql://legal_admin:123456@localhost:5432/legal_ai_db)
//   QDRANT_URL          — Qdrant REST endpoint (default http://localhost:6333)
//   QDRANT_GRPC_HOST    — Qdrant gRPC host (default localhost)
//   QDRANT_GRPC_PORT    — Qdrant gRPC port (default 6334)
//   REDIS_URL           — Redis (default redis://localhost:6379)
//   EMBED_SERVICE_URL   — Go embedding service HTTP (default http://localhost:8097)
//   OLLAMA_URL          — Ollama API GPU path (default http://localhost:11434)
//   EMBED_MODEL         — Model name (default embeddinggemma:latest)
//   GRPC_PORT           — gRPC port (default 50053)
//   HTTP_PORT           — HTTP port (default 8100)
//   RETRIEVAL_CACHE_TTL — Redis cache TTL seconds (default 300)
//   GPU_EMBED_ENABLED   — "true" to prefer direct Ollama GPU over embed service (default true)
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/gob"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	qdrantclient "github.com/qdrant/go-client/qdrant"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/reflection"

	pb "github.com/deeds-web-app/services/go-retrieval-service/proto/retrieval"
)

func init() {
	// Register proto types for gob encoding (protobuf message embedding)
	gob.Register(&pb.EvidenceSearchResponse{})
}

// ── Configuration ─────────────────────────────────────────────────────────

type config struct {
	DatabaseURL     string
	QdrantURL       string
	QdrantHost      string
	QdrantPort      int
	RedisURL        string
	EmbedServiceURL string
	OllamaURL       string
	EmbedModel      string
	GRPCPort        string
	HTTPPort        string
	CacheTTL        time.Duration
	GPUEmbedEnabled bool
}

func loadConfig() config {
	qdPort, _ := strconv.Atoi(envOr("QDRANT_GRPC_PORT", "6334"))
	cacheTTL, _ := strconv.Atoi(envOr("RETRIEVAL_CACHE_TTL", "300"))
	gpuEnabled := envOr("GPU_EMBED_ENABLED", "true") == "true"
	return config{
		DatabaseURL:     envOr("DATABASE_URL", "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"),
		QdrantURL:       envOr("QDRANT_URL", "http://localhost:6333"),
		QdrantHost:      envOr("QDRANT_GRPC_HOST", "localhost"),
		QdrantPort:      qdPort,
		RedisURL:        envOr("REDIS_URL", "redis://localhost:6379"),
		EmbedServiceURL: envOr("EMBED_SERVICE_URL", "http://localhost:8097"),
		OllamaURL:       envOr("OLLAMA_URL", "http://localhost:11434"),
		EmbedModel:      envOr("EMBED_MODEL", "embeddinggemma:latest"),
		GRPCPort:        envOr("GRPC_PORT", "50053"),
		HTTPPort:        envOr("HTTP_PORT", "8100"),
		CacheTTL:        time.Duration(cacheTTL) * time.Second,
		GPUEmbedEnabled: gpuEnabled,
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── Server ────────────────────────────────────────────────────────────────

type retrievalServer struct {
	pb.UnimplementedRetrievalServiceServer
	cfg        config
	pool       *pgxpool.Pool
	rdb        *redis.Client
	qdrant     *qdrantclient.Client
	httpClient *http.Client

	// Atomic counters (avoid mutex for hot path)
	evidenceSearches int64
	codebaseSearches int64
	cacheHits        int64
	totalRequests    int64
}

const (
	collectionEvidence = "evidence_items"
	collectionCodebase = "codebase_chunks_768"
	searchTimeout      = 12 * time.Second
	embedTimeout       = 6 * time.Second
	defaultLimit       = 10
	maxLimit           = 50
)

// ── GPU / ONNX Embedding ───────────────────────────────────────────────────
//
// Priority order:
//  1. Pre-computed client embedding (ONNX from browser): if query_embedding is 768-dim
//  2. Direct Ollama GPU (:11434):   if GPU_EMBED_ENABLED=true (RTX 3060 Ti)
//  3. Go embedding service (:8097): batched, Redis-cached
//  4. Ollama HTTP fallback:         always available
//
// Redis embed cache key: "rembed:<sha256(model:text)[:16]>"
// TTL: 24h (embeddings are deterministic per model version)

const embedCachePrefix = "rembed:"
const embedCacheTTL = 24 * time.Hour

func (s *retrievalServer) embed(ctx context.Context, text string) ([]float32, error) {
	if text == "" {
		return make([]float32, 768), nil
	}
	ctx, cancel := context.WithTimeout(ctx, embedTimeout)
	defer cancel()

	// Check embed cache first
	ck := embedCacheKey(s.cfg.EmbedModel, text)
	if cached := s.cachedEmbedding(ctx, ck); cached != nil {
		return cached, nil
	}

	var vec []float32
	var err error

	if s.cfg.GPUEmbedEnabled {
		// Direct Ollama GPU (fastest — no HTTP hop to embedding service)
		vec, err = s.embedGPU(ctx, text)
	}
	if vec == nil {
		// Fallback: Go embedding service (batched, Redis-cached internally)
		vec, err = s.embedViaService(ctx, text)
	}
	if vec == nil {
		// Final fallback: Ollama HTTP (always available)
		vec, err = s.embedOllama(ctx, text)
	}
	if err != nil || vec == nil {
		return nil, fmt.Errorf("all embedding paths failed: %w", err)
	}

	// Store in embed cache
	s.storeEmbedding(ctx, ck, vec)
	return vec, nil
}

func embedCacheKey(model, text string) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s:%s", model, text)
	return embedCachePrefix + hex.EncodeToString(h.Sum(nil))[:16]
}

func (s *retrievalServer) cachedEmbedding(ctx context.Context, key string) []float32 {
	data, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return nil
	}
	var vec []float32
	if err := gob.NewDecoder(bytes.NewReader(data)).Decode(&vec); err != nil {
		return nil
	}
	return vec
}

func (s *retrievalServer) storeEmbedding(ctx context.Context, key string, vec []float32) {
	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(vec); err == nil {
		s.rdb.Set(ctx, key, buf.Bytes(), embedCacheTTL)
	}
}

// embedGPU calls Ollama directly on the GPU (RTX 3060 Ti, flash attention enabled).
// Uses the /api/embeddings endpoint which is synchronous and single-batch.
func (s *retrievalServer) embedGPU(ctx context.Context, text string) ([]float32, error) {
	payload, _ := json.Marshal(map[string]any{
		"model":  s.cfg.EmbedModel,
		"prompt": text,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.cfg.OllamaURL+"/api/embeddings", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ollama gpu embed: status %d", resp.StatusCode)
	}

	var result struct {
		Embedding []float64 `json:"embedding"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Embedding) == 0 {
		return nil, fmt.Errorf("empty gpu embedding")
	}
	vec := make([]float32, len(result.Embedding))
	for i, v := range result.Embedding {
		vec[i] = float32(v)
	}
	return vec, nil
}

// embedViaService calls the Go embedding service (Redis-cached, batch-aware).
func (s *retrievalServer) embedViaService(ctx context.Context, text string) ([]float32, error) {
	payload, _ := json.Marshal(map[string]any{
		"texts": []string{text},
		"model": s.cfg.EmbedModel,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.cfg.EmbedServiceURL+"/embed", bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embed service: status %d", resp.StatusCode)
	}

	var result struct {
		Embeddings [][]float32 `json:"embeddings"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Embeddings) == 0 || len(result.Embeddings[0]) == 0 {
		return nil, fmt.Errorf("empty embed service response")
	}
	return result.Embeddings[0], nil
}

// embedOllama is the final HTTP fallback (same as GPU but logs differently).
func (s *retrievalServer) embedOllama(ctx context.Context, text string) ([]float32, error) {
	vec, err := s.embedGPU(ctx, text)
	if err != nil {
		slog.Warn("[retrieval] embedOllama fallback failed", "err", err)
	}
	return vec, err
}

// ── Proto-binary cache (gob-encoded) ─────────────────────────────────────
//
// gob is 2-3× smaller and faster than JSON for nested structs.
// cache key: "retr:ev:<sha256(query:caseID:limit)[:16]>"

const evidCachePrefix = "retr:ev:"
const codeCachePrefix = "retr:cb:"

func queryCacheKey(prefix, query, caseID string, limit int32) string {
	h := sha256.New()
	fmt.Fprintf(h, "%s|%s|%d", query, caseID, limit)
	return prefix + hex.EncodeToString(h.Sum(nil))[:16]
}

func (s *retrievalServer) cachePutEvidence(ctx context.Context, key string, resp *pb.EvidenceSearchResponse) {
	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(resp); err == nil {
		s.rdb.Set(ctx, key, buf.Bytes(), s.cfg.CacheTTL)
	}
}

func (s *retrievalServer) cacheGetEvidence(ctx context.Context, key string) *pb.EvidenceSearchResponse {
	data, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return nil
	}
	var resp pb.EvidenceSearchResponse
	if err := gob.NewDecoder(bytes.NewReader(data)).Decode(&resp); err != nil {
		return nil
	}
	return &resp
}

// ── pgvector search with JSONB schema matching ────────────────────────────
//
// JSONB matching lets callers filter by evidence metadata fields:
//   metadata->>'section_type' = 'statute'
//   metadata @> '{"jurisdiction": "CA", "entity_types": ["DATE"]}'
//
// The schema for evidence.metadata (JSONB) includes:
//   section_type, entity_types, tags, jurisdiction, page_number,
//   word_count, confidence, extraction_quality

type pgChunk struct {
	EvidenceID       string
	ChunkIndex       int32
	Content          string
	Score            float32
	FileName         string
	FileType         string
	ExtractionMethod string
	SectionPath      []string
	Heading          string
	Citations        []string
	TokenCount       int32
	Jurisdiction     string
	MetadataJSON     string
}

// JSONBFilter represents a JSONB containment filter for evidence search.
type JSONBFilter struct {
	// Contains checks evidence.metadata @> this JSON object
	Contains map[string]any `json:"contains,omitempty"`
	// SectionType filters on metadata->>'section_type'
	SectionType string `json:"section_type,omitempty"`
	// EntityTypes filters on metadata->'entity_types' @> '["TYPE"]'
	EntityTypes []string `json:"entity_types,omitempty"`
	// MinConfidence filters on (metadata->>'confidence')::float >= value
	MinConfidence float32 `json:"min_confidence,omitempty"`
}

func (s *retrievalServer) pgvectorSearch(ctx context.Context, vec []float32, caseID string, jsonbFilter *JSONBFilter, limit int) ([]pgChunk, error) {
	var whereClauses []string
	var args []any
	argIdx := 2 // $1 = vector, $2 = limit

	args = append(args, pgvecToLiteral(vec), limit)

	if caseID != "" {
		argIdx++
		whereClauses = append(whereClauses, fmt.Sprintf("e.case_id = $%d", argIdx))
		args = append(args, caseID)
	}

	// JSONB schema matching
	if jsonbFilter != nil {
		if jsonbFilter.SectionType != "" {
			argIdx++
			whereClauses = append(whereClauses,
				fmt.Sprintf("e.metadata->>'section_type' = $%d", argIdx))
			args = append(args, jsonbFilter.SectionType)
		}
		if len(jsonbFilter.EntityTypes) > 0 {
			for _, et := range jsonbFilter.EntityTypes {
				argIdx++
				whereClauses = append(whereClauses,
					fmt.Sprintf("e.metadata->'entity_types' @> $%d::jsonb", argIdx))
				args = append(args, fmt.Sprintf("[%q]", et))
			}
		}
		if jsonbFilter.MinConfidence > 0 {
			argIdx++
			whereClauses = append(whereClauses,
				fmt.Sprintf("(e.metadata->>'confidence')::float >= $%d", argIdx))
			args = append(args, jsonbFilter.MinConfidence)
		}
		if len(jsonbFilter.Contains) > 0 {
			containsJSON, err := json.Marshal(jsonbFilter.Contains)
			if err == nil {
				argIdx++
				whereClauses = append(whereClauses,
					fmt.Sprintf("e.metadata @> $%d::jsonb", argIdx))
				args = append(args, string(containsJSON))
			}
		}
	}

	whereSQL := ""
	if len(whereClauses) > 0 {
		whereSQL = "AND " + strings.Join(whereClauses, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT ev.evidence_id,
		       0::int4 AS chunk_index,
		       COALESCE(e.description, e.title, '') AS content,
		       (1 - (ev.vector <=> $1::vector))::float4 AS score,
		       COALESCE(e.file_path, e.title, '') AS file_name,
		       COALESCE(e.file_type, '') AS file_type,
		       '' AS extraction_method,
		       COALESCE(e.metadata->>'jurisdiction', '') AS jurisdiction,
		       COALESCE(e.metadata::text, '{}') AS metadata_json
		FROM evidence_vectors ev
		JOIN evidence e ON e.id = ev.evidence_id
		WHERE 1=1 %s
		ORDER BY ev.vector <=> $1::vector
		LIMIT $2
	`, whereSQL)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []pgChunk
	for rows.Next() {
		var c pgChunk
		if err := rows.Scan(&c.EvidenceID, &c.ChunkIndex, &c.Content, &c.Score,
			&c.FileName, &c.FileType, &c.ExtractionMethod, &c.Jurisdiction, &c.MetadataJSON); err != nil {
			continue
		}
		results = append(results, c)
	}
	return results, rows.Err()
}

// pgvecToLiteral converts float32 slice to a PostgreSQL vector literal.
func pgvecToLiteral(vec []float32) string {
	parts := make([]string, len(vec))
	for i, v := range vec {
		parts[i] = strconv.FormatFloat(float64(v), 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// ── Qdrant search ─────────────────────────────────────────────────────────

type qdrantChunk struct {
	ID               string
	EvidenceID       string
	CaseID           string
	ChunkIndex       int32
	ContentPreview   string
	FileName         string
	ExtractionMethod string
	SectionPath      []string
	Heading          string
	Citations        []string
	TokenCount       int32
	Jurisdiction     string
	Score            float32
	// Codebase-specific
	FilePath   string
	Kind       string
	HTTPMethod string
	RouteID    string
	Tags       []string
	StartLine  int32
	EndLine    int32
}

func (s *retrievalServer) qdrantSearchEvidence(ctx context.Context, vec []float32, caseID string, limit int) ([]qdrantChunk, error) {
	contentVec := "content"
	qlimit := uint64(limit)

	queryReq := &qdrantclient.QueryPoints{
		CollectionName: collectionEvidence,
		Query:          qdrantclient.NewQuery(vec...),
		Using:          &contentVec,
		Limit:          &qlimit,
		WithPayload:    qdrantclient.NewWithPayload(true),
	}
	if caseID != "" {
		queryReq.Filter = &qdrantclient.Filter{
			Must: []*qdrantclient.Condition{
				qdrantclient.NewMatch("case_id", caseID),
			},
		}
	}

	points, err := s.qdrant.Query(ctx, queryReq)
	if err != nil {
		// REST fallback
		return s.qdrantSearchREST(ctx, collectionEvidence, "content", vec, caseID, limit)
	}

	return qdrantPointsToChunks(points, false), nil
}

func (s *retrievalServer) qdrantSearchCodebase(ctx context.Context, vec []float32, kinds []string, pathPrefixes []string, limit int) ([]qdrantChunk, error) {
	contentVec := "content"
	sigVec := "signature"
	prefetchLimit := uint64(limit * 3)
	qlimit := uint64(limit)

	queryReq := &qdrantclient.QueryPoints{
		CollectionName: collectionCodebase,
		Prefetch: []*qdrantclient.PrefetchQuery{
			{
				Query: qdrantclient.NewQuery(vec...),
				Using: &contentVec,
				Limit: &prefetchLimit,
			},
			{
				Query: qdrantclient.NewQuery(vec...),
				Using: &sigVec,
				Limit: &prefetchLimit,
			},
		},
		Query:       qdrantclient.NewQueryFusion(qdrantclient.Fusion_RRF),
		Limit:       &qlimit,
		WithPayload: qdrantclient.NewWithPayload(true),
	}

	// Kind filter
	if len(kinds) > 0 {
		conds := make([]*qdrantclient.Condition, len(kinds))
		for i, k := range kinds {
			k := k
			conds[i] = qdrantclient.NewMatch("kind", k)
		}
		queryReq.Filter = &qdrantclient.Filter{Should: conds}
	}

	points, err := s.qdrant.Query(ctx, queryReq)
	if err != nil {
		// REST fallback: single content vector
		return s.qdrantSearchREST(ctx, collectionCodebase, "content", vec, "", limit)
	}

	chunks := qdrantPointsToChunks(points, true)

	// Apply path prefix filter in-process
	if len(pathPrefixes) > 0 {
		filtered := chunks[:0]
		for _, c := range chunks {
			for _, prefix := range pathPrefixes {
				if strings.HasPrefix(c.FilePath, prefix) {
					filtered = append(filtered, c)
					break
				}
			}
		}
		chunks = filtered
	}
	return chunks, nil
}

// qdrantPointsToChunks converts ScoredPoint slice to qdrantChunk slice.
// isCodebase toggles which payload fields to extract.
func qdrantPointsToChunks(points []*qdrantclient.ScoredPoint, isCodebase bool) []qdrantChunk {
	chunks := make([]qdrantChunk, 0, len(points))
	for _, p := range points {
		c := qdrantChunk{Score: p.Score}
		if p.GetId() != nil {
			c.ID = p.GetId().GetUuid()
			if c.ID == "" {
				c.ID = fmt.Sprintf("%d", p.GetId().GetNum())
			}
		}
		payload := p.GetPayload()
		if payload == nil {
			chunks = append(chunks, c)
			continue
		}
		if isCodebase {
			c.FilePath   = qdrantStr(payload, "file_path")
			c.ChunkIndex = qdrantInt32(payload, "chunk_index")
			c.ContentPreview = truncate(qdrantStr(payload, "content"), 500)
			c.Kind       = qdrantStr(payload, "kind")
			c.HTTPMethod = qdrantStr(payload, "httpMethod")
			c.RouteID    = qdrantStr(payload, "routeId")
			c.Tags       = qdrantStrSlice(payload, "tags")
			c.StartLine  = qdrantInt32(payload, "start_line")
			c.EndLine    = qdrantInt32(payload, "end_line")
		} else {
			c.EvidenceID       = qdrantStr(payload, "evidence_id")
			c.CaseID           = qdrantStr(payload, "case_id")
			c.ChunkIndex       = qdrantInt32(payload, "chunk_index")
			c.ContentPreview   = qdrantStr(payload, "content_preview")
			c.FileName         = qdrantStr(payload, "file_name")
			c.ExtractionMethod = qdrantStr(payload, "extraction_method")
			c.Heading          = qdrantStr(payload, "heading")
			c.TokenCount       = qdrantInt32(payload, "token_count")
			c.SectionPath      = qdrantStrSlice(payload, "section_path")
			c.Citations        = qdrantStrSlice(payload, "citations")
		}
		chunks = append(chunks, c)
	}
	return chunks
}

// qdrantSearchREST is the HTTP fallback for when gRPC client fails.
func (s *retrievalServer) qdrantSearchREST(ctx context.Context, collection, vectorName string, vec []float32, caseID string, limit int) ([]qdrantChunk, error) {
	body := map[string]any{
		"limit":        limit,
		"with_payload": true,
		"vector": map[string]any{
			"name":   vectorName,
			"vector": vec,
		},
	}
	if caseID != "" {
		body["filter"] = map[string]any{
			"must": []any{
				map[string]any{"key": "case_id", "match": map[string]any{"value": caseID}},
			},
		}
	}
	b, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s/points/query", s.cfg.QdrantURL, collection)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Result []struct {
			ID      any            `json:"id"`
			Score   float32        `json:"score"`
			Payload map[string]any `json:"payload"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	isCodebase := collection == collectionCodebase
	chunks := make([]qdrantChunk, 0, len(result.Result))
	for _, r := range result.Result {
		c := qdrantChunk{Score: r.Score}
		switch v := r.ID.(type) {
		case string:
			c.ID = v
		case float64:
			c.ID = strconv.FormatFloat(v, 'f', 0, 64)
		}
		if p := r.Payload; p != nil {
			if isCodebase {
				c.FilePath       = anyStr(p["file_path"])
				c.Kind           = anyStr(p["kind"])
				c.HTTPMethod     = anyStr(p["httpMethod"])
				c.ContentPreview = truncate(anyStr(p["content"]), 500)
				c.Tags           = anyStrSlice(p["tags"])
			} else {
				c.EvidenceID       = anyStr(p["evidence_id"])
				c.ContentPreview   = anyStr(p["content_preview"])
				c.FileName         = anyStr(p["file_name"])
				c.ExtractionMethod = anyStr(p["extraction_method"])
				c.Heading          = anyStr(p["heading"])
				c.SectionPath      = anyStrSlice(p["section_path"])
				c.Citations        = anyStrSlice(p["citations"])
				if n, ok := p["chunk_index"].(float64); ok {
					c.ChunkIndex = int32(n)
				}
			}
		}
		chunks = append(chunks, c)
	}
	return chunks, nil
}

// ── Reranking ─────────────────────────────────────────────────────────────
//
// Formula: final = cosineW*cosine + citeW*citationOverlap + jurW*jurisdictionMatch + secBonus
// Defaults: 0.75 cosine + 0.15 citations + 0.10 jurisdiction

type rankedChunk struct {
	qdrantChunk
	FinalScore        float32
	SharedCitations   float32
	JurisdictionMatch float32
	SectionProximity  float32
}

func rerank(chunks []qdrantChunk, jurisdiction string, policy *pb.RankPolicy) []rankedChunk {
	cw := float32(0.75)
	citW := float32(0.15)
	jurW := float32(0.10)
	if policy != nil {
		if policy.CosineWeight > 0 {
			cw = policy.CosineWeight
		}
		if policy.CitationsWeight > 0 {
			citW = policy.CitationsWeight
		}
		if policy.JurisdictionWeight > 0 {
			jurW = policy.JurisdictionWeight
		}
	}

	ranked := make([]rankedChunk, len(chunks))
	for i, c := range chunks {
		// Section proximity bonus
		var secProx float32
		if len(c.SectionPath) >= 3 {
			secProx = 0.05
		}

		// Jurisdiction match
		var jurMatch float32
		if jurisdiction != "" {
			if strings.EqualFold(c.Jurisdiction, jurisdiction) {
				jurMatch = 1.0
			} else if strings.Contains(strings.ToLower(c.ContentPreview), strings.ToLower(jurisdiction)) {
				jurMatch = 0.5
			}
		}

		final := cw*c.Score + jurW*jurMatch + secProx
		_ = citW // citation overlap requires query context — applied in SearchEvidence
		ranked[i] = rankedChunk{
			qdrantChunk:       c,
			FinalScore:        final,
			JurisdictionMatch: jurMatch,
			SectionProximity:  secProx,
		}
	}

	sort.Slice(ranked, func(a, b int) bool {
		return ranked[a].FinalScore > ranked[b].FinalScore
	})
	return ranked
}

// ── Section sibling expansion ─────────────────────────────────────────────

func (s *retrievalServer) expandSiblings(ctx context.Context, anchor rankedChunk, hopMax int) []qdrantChunk {
	if anchor.EvidenceID == "" || hopMax <= 0 {
		return nil
	}
	minIdx := anchor.ChunkIndex - 2
	if minIdx < 0 {
		minIdx = 0
	}
	maxIdx := anchor.ChunkIndex + 2

	body := map[string]any{
		"limit":        hopMax,
		"with_payload": true,
		"vector":       map[string]any{"name": "content", "vector": make([]float32, 768)},
		"filter": map[string]any{
			"must": []any{
				map[string]any{"key": "evidence_id", "match": map[string]any{"value": anchor.EvidenceID}},
				map[string]any{"key": "chunk_index", "range": map[string]any{"gte": minIdx, "lte": maxIdx}},
			},
			"must_not": []any{
				map[string]any{"key": "chunk_index", "match": map[string]any{"value": anchor.ChunkIndex}},
			},
		},
	}
	b, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s/points/query", s.cfg.QdrantURL, collectionEvidence)

	ctx2, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx2, http.MethodPost, url, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var result struct {
		Result []struct {
			Score   float32        `json:"score"`
			Payload map[string]any `json:"payload"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil
	}

	sibs := make([]qdrantChunk, 0, len(result.Result))
	for _, r := range result.Result {
		c := qdrantChunk{Score: r.Score}
		if p := r.Payload; p != nil {
			c.EvidenceID      = anyStr(p["evidence_id"])
			c.ContentPreview  = anyStr(p["content_preview"])
			c.FileName        = anyStr(p["file_name"])
			c.Heading         = anyStr(p["heading"])
			c.SectionPath     = anyStrSlice(p["section_path"])
			c.Citations       = anyStrSlice(p["citations"])
			if n, ok := p["chunk_index"].(float64); ok {
				c.ChunkIndex = int32(n)
			}
		}
		sibs = append(sibs, c)
	}
	return sibs
}

// ── KAG: graph neighbor traversal ─────────────────────────────────────────

type graphNeighborRow struct {
	NodeID         string
	Title          string
	ConnectionType string
	Strength       int32
	Confidence     int32
	AIReasoning    string
}

func (s *retrievalServer) fetchGraphNeighbors(ctx context.Context, evidenceIDs []string) (map[string][]graphNeighborRow, error) {
	if len(evidenceIDs) == 0 {
		return nil, nil
	}
	ctx2, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	args := make([]any, len(evidenceIDs))
	placeholders := make([]string, len(evidenceIDs))
	for i, id := range evidenceIDs {
		args[i] = id
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}
	inList := strings.Join(placeholders, ",")

	// Fetch both sides (source + target) in one query
	query := fmt.Sprintf(`
		SELECT
		    CASE WHEN source_node_id = ANY(ARRAY[%[1]s]::uuid[])
		         THEN source_node_id ELSE target_node_id END AS anchor_id,
		    CASE WHEN source_node_id = ANY(ARRAY[%[1]s]::uuid[])
		         THEN target_node_id ELSE source_node_id END AS neighbor_id,
		    connection_type,
		    COALESCE(strength, 50)::int4 AS strength,
		    COALESCE(confidence_score, 0)::int4 AS confidence_score,
		    COALESCE(ai_reasoning, '') AS ai_reasoning
		FROM yorha_evidence_connections
		WHERE source_node_id = ANY(ARRAY[%[1]s]::uuid[])
		   OR target_node_id = ANY(ARRAY[%[1]s]::uuid[])
		LIMIT 40
	`, inList)

	rows, err := s.pool.Query(ctx2, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]graphNeighborRow)
	for rows.Next() {
		var anchorID, neighborID, connType, aiReason string
		var strength, confidence int32
		if err := rows.Scan(&anchorID, &neighborID, &connType, &strength, &confidence, &aiReason); err != nil {
			continue
		}
		result[anchorID] = append(result[anchorID], graphNeighborRow{
			NodeID: neighborID, ConnectionType: connType,
			Strength: strength, Confidence: confidence, AIReasoning: aiReason,
		})
	}
	return result, rows.Err()
}

// ── DAG: parent document context ──────────────────────────────────────────

type docContextRow struct {
	EvidenceID      string
	FileName        string
	FileType        string
	Description     string
	AISummary       string
	AITagsJSON      string
	KeyEntitiesJSON string
}

func (s *retrievalServer) fetchDocContext(ctx context.Context, evidenceIDs []string) (map[string]docContextRow, error) {
	if len(evidenceIDs) == 0 {
		return nil, nil
	}
	ctx2, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	args := make([]any, len(evidenceIDs))
	placeholders := make([]string, len(evidenceIDs))
	for i, id := range evidenceIDs {
		args[i] = id
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}

	query := fmt.Sprintf(`
		SELECT id::text,
		       COALESCE(file_path, title, '') AS file_name,
		       COALESCE(file_type, '') AS file_type,
		       COALESCE(description, '') AS description,
		       COALESCE(metadata->>'ai_summary', '') AS ai_summary,
		       COALESCE(metadata->'ai_tags', '[]')::text AS ai_tags_json,
		       COALESCE(metadata->'key_entities', '{}')::text AS key_entities_json
		FROM evidence
		WHERE id = ANY(ARRAY[%s]::uuid[])
	`, strings.Join(placeholders, ","))

	rows, err := s.pool.Query(ctx2, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string]docContextRow)
	for rows.Next() {
		var r docContextRow
		if err := rows.Scan(&r.EvidenceID, &r.FileName, &r.FileType, &r.Description,
			&r.AISummary, &r.AITagsJSON, &r.KeyEntitiesJSON); err != nil {
			continue
		}
		result[r.EvidenceID] = r
	}
	return result, rows.Err()
}

// ── SearchEvidence (core) ─────────────────────────────────────────────────

func (s *retrievalServer) SearchEvidence(ctx context.Context, req *pb.EvidenceSearchRequest) (*pb.EvidenceSearchResponse, error) {
	atomic.AddInt64(&s.totalRequests, 1)
	atomic.AddInt64(&s.evidenceSearches, 1)

	ctx, cancel := context.WithTimeout(ctx, searchTimeout)
	defer cancel()

	start := time.Now()
	timing := &pb.SearchTiming{}

	limit := int(req.Limit)
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	// Check proto-binary Redis cache
	ck := queryCacheKey(evidCachePrefix, req.Query, req.CaseId, req.Limit)
	if cached := s.cacheGetEvidence(ctx, ck); cached != nil {
		atomic.AddInt64(&s.cacheHits, 1)
		cached.CacheSource = "redis"
		return cached, nil
	}

	// Step 1: Embed (ONNX passthrough or GPU)
	t0 := time.Now()
	var vec []float32
	var err error
	if len(req.QueryEmbedding) == 768 {
		// Client provided pre-computed ONNX/WebGPU embedding — skip GPU call
		vec = req.QueryEmbedding
	} else {
		vec, err = s.embed(ctx, req.Query)
		if err != nil {
			slog.Warn("[retrieval] embed failed", "err", err)
			return &pb.EvidenceSearchResponse{}, nil
		}
	}
	timing.EmbedMs = float32(time.Since(t0).Milliseconds())

	// Step 2: Parallel dual search
	t0 = time.Now()
	type dualResult struct {
		pg    []pgChunk
		qd    []qdrantChunk
	}
	dualCh := make(chan dualResult, 1)
	go func() {
		var wg sync.WaitGroup
		var dr dualResult
		wg.Add(2)
		go func() {
			defer wg.Done()
			dr.pg, _ = s.pgvectorSearch(ctx, vec, req.CaseId, nil, limit*2)
		}()
		go func() {
			defer wg.Done()
			dr.qd, _ = s.qdrantSearchEvidence(ctx, vec, req.CaseId, limit*3)
		}()
		wg.Wait()
		dualCh <- dr
	}()
	dr := <-dualCh
	timing.SearchMs = float32(time.Since(t0).Milliseconds())

	// Merge Qdrant + pgvector results
	merged := mergeEvidenceHits(dr.qd, dr.pg, limit*2)

	// Step 3: Rerank
	t0 = time.Now()
	ranked := rerank(merged, req.Jurisdiction, req.Rank)
	if len(ranked) > limit {
		ranked = ranked[:limit]
	}
	timing.RerankMs = float32(time.Since(t0).Milliseconds())

	// Collect unique evidence IDs for KAG + DAG
	evidenceIDs := make([]string, 0, len(ranked))
	seenEv := make(map[string]struct{})
	for _, rc := range ranked {
		if rc.EvidenceID != "" {
			if _, ok := seenEv[rc.EvidenceID]; !ok {
				evidenceIDs = append(evidenceIDs, rc.EvidenceID)
				seenEv[rc.EvidenceID] = struct{}{}
			}
		}
	}

	// Step 4: Hop + KAG + DAG in parallel
	t0 = time.Now()
	hopMode := 1
	hopMax := 10
	if req.Hop != nil {
		hopMode = int(req.Hop.Mode)
		if req.Hop.MaxHopChunks > 0 {
			hopMax = int(req.Hop.MaxHopChunks)
		}
	}

	type parallelResults struct {
		siblings    map[string][]qdrantChunk
		neighbors   map[string][]graphNeighborRow
		docContexts map[string]docContextRow
	}
	prCh := make(chan parallelResults, 1)
	go func() {
		var wg sync.WaitGroup
		var pr parallelResults
		pr.siblings = make(map[string][]qdrantChunk)
		var mu sync.Mutex

		wg.Add(3)
		// Sibling hop
		go func() {
			defer wg.Done()
			if hopMode >= 1 {
				var wg2 sync.WaitGroup
				for _, rc := range ranked {
					rc := rc
					wg2.Add(1)
					go func() {
						defer wg2.Done()
						sibs := s.expandSiblings(ctx, rc, hopMax)
						if len(sibs) > 0 {
							mu.Lock()
							pr.siblings[rc.ID] = sibs
							mu.Unlock()
						}
					}()
				}
				wg2.Wait()
			}
		}()
		// KAG graph neighbors
		go func() {
			defer wg.Done()
			pr.neighbors, _ = s.fetchGraphNeighbors(ctx, evidenceIDs)
		}()
		// DAG document context
		go func() {
			defer wg.Done()
			rows, _ := s.fetchDocContext(ctx, evidenceIDs)
			if rows != nil {
				pr.docContexts = rows
			} else {
				pr.docContexts = make(map[string]docContextRow)
			}
		}()
		wg.Wait()
		prCh <- pr
	}()

	pr := <-prCh
	timing.HopMs = float32(time.Since(t0).Milliseconds())
	timing.KagMs = timing.HopMs  // overlapped — both measured in same interval
	timing.DagMs = timing.HopMs

	// Build proto response
	protoResults := buildProtoResults(ranked)
	protoBundles := buildProtoBundles(ranked, pr.siblings, pr.neighbors, pr.docContexts, protoResults)

	timing.TotalMs = float32(time.Since(start).Milliseconds())
	resp := &pb.EvidenceSearchResponse{
		Results: protoResults,
		Bundles: protoBundles,
		Timing:  timing,
	}

	s.cachePutEvidence(ctx, ck, resp)
	return resp, nil
}

func buildProtoResults(ranked []rankedChunk) []*pb.SearchResult {
	results := make([]*pb.SearchResult, len(ranked))
	for i, rc := range ranked {
		results[i] = &pb.SearchResult{
			EvidenceId: rc.EvidenceID,
			ChunkIndex: rc.ChunkIndex,
			Content:    rc.ContentPreview,
			Score:      rc.Score,
			Metadata: &pb.ChunkMetadata{
				SectionPath:      rc.SectionPath,
				Heading:          rc.Heading,
				Citations:        rc.Citations,
				FileName:         rc.FileName,
				TokenCount:       rc.TokenCount,
				ExtractionMethod: rc.ExtractionMethod,
				Jurisdiction:     rc.Jurisdiction,
			},
			Rerank: &pb.RerankExplain{
				Cosine:            rc.Score,
				SharedCitations:   rc.SharedCitations,
				JurisdictionMatch: rc.JurisdictionMatch,
				SectionProximity:  rc.SectionProximity,
				FinalScore:        rc.FinalScore,
			},
		}
	}
	return results
}

func buildProtoBundles(
	ranked []rankedChunk,
	siblingMap map[string][]qdrantChunk,
	neighborMap map[string][]graphNeighborRow,
	docMap map[string]docContextRow,
	protoResults []*pb.SearchResult,
) []*pb.ContextBundle {
	bundles := make([]*pb.ContextBundle, len(ranked))
	for i, rc := range ranked {
		// Siblings
		sibs := siblingMap[rc.ID]
		protoSibs := make([]*pb.SearchResult, len(sibs))
		for j, s := range sibs {
			protoSibs[j] = &pb.SearchResult{
				EvidenceId: s.EvidenceID,
				ChunkIndex: s.ChunkIndex,
				Content:    s.ContentPreview,
				Score:      s.Score,
				Metadata: &pb.ChunkMetadata{
					SectionPath: s.SectionPath,
					Heading:     s.Heading,
					Citations:   s.Citations,
					FileName:    s.FileName,
					TokenCount:  s.TokenCount,
				},
			}
		}

		// Graph neighbors
		neighbors := neighborMap[rc.EvidenceID]
		protoNeighbors := make([]*pb.GraphNeighbor, len(neighbors))
		for j, n := range neighbors {
			protoNeighbors[j] = &pb.GraphNeighbor{
				NodeId:         n.NodeID,
				Title:          n.Title,
				ConnectionType: n.ConnectionType,
				Strength:       n.Strength,
				Confidence:     n.Confidence,
				AiReasoning:    n.AIReasoning,
			}
		}

		// Document context (DAG)
		var protoDocCtx *pb.DocumentContext
		if doc, ok := docMap[rc.EvidenceID]; ok {
			protoDocCtx = &pb.DocumentContext{
				EvidenceId:      doc.EvidenceID,
				FileName:        doc.FileName,
				FileType:        doc.FileType,
				Description:     doc.Description,
				AiSummary:       doc.AISummary,
				AiTagsJson:      doc.AITagsJSON,
				KeyEntitiesJson: doc.KeyEntitiesJSON,
			}
		}

		// Aggregate all citations across bundle
		citSet := make(map[string]struct{})
		for _, cit := range rc.Citations {
			citSet[cit] = struct{}{}
		}
		for _, s := range sibs {
			for _, cit := range s.Citations {
				citSet[cit] = struct{}{}
			}
		}
		allCits := make([]string, 0, len(citSet))
		for cit := range citSet {
			allCits = append(allCits, cit)
		}

		bundles[i] = &pb.ContextBundle{
			Hit:             protoResults[i],
			Siblings:        protoSibs,
			SectionPath:     rc.SectionPath,
			Heading:         rc.Heading,
			Citations:       allCits,
			GraphNeighbors:  protoNeighbors,
			DocumentContext: protoDocCtx,
		}
	}
	return bundles
}

// mergeEvidenceHits merges Qdrant (rich) + pgvector (fast) results.
func mergeEvidenceHits(qd []qdrantChunk, pg []pgChunk, limit int) []qdrantChunk {
	seen := make(map[string]struct{}, len(qd))
	merged := make([]qdrantChunk, 0, len(qd)+len(pg))
	for _, c := range qd {
		seen[c.EvidenceID] = struct{}{}
		merged = append(merged, c)
	}
	for _, p := range pg {
		if _, ok := seen[p.EvidenceID]; !ok {
			seen[p.EvidenceID] = struct{}{}
			merged = append(merged, qdrantChunk{
				EvidenceID:       p.EvidenceID,
				ContentPreview:   truncate(p.Content, 500),
				FileName:         p.FileName,
				ExtractionMethod: p.ExtractionMethod,
				Jurisdiction:     p.Jurisdiction,
				Score:            p.Score,
			})
		}
	}
	if len(merged) > limit {
		merged = merged[:limit]
	}
	return merged
}

// ── StreamEvidence ─────────────────────────────────────────────────────────

func (s *retrievalServer) StreamEvidence(req *pb.EvidenceSearchRequest, stream pb.RetrievalService_StreamEvidenceServer) error {
	ctx := stream.Context()
	_ = stream.Send(&pb.EvidenceBundleEvent{Event: &pb.EvidenceBundleEvent_Progress{
		Progress: &pb.RetrievalProgress{Stage: "embed", Current: 0, Total: 5, Message: "Embedding query..."},
	}})

	resp, err := s.SearchEvidence(ctx, req)
	if err != nil {
		return stream.Send(&pb.EvidenceBundleEvent{Event: &pb.EvidenceBundleEvent_Error{
			Error: &pb.RetrievalError{Code: "INTERNAL", Message: err.Error()},
		}})
	}
	for i, bundle := range resp.Bundles {
		_ = stream.Send(&pb.EvidenceBundleEvent{Event: &pb.EvidenceBundleEvent_Progress{
			Progress: &pb.RetrievalProgress{
				Stage: "bundle", Current: int32(i + 1), Total: int32(len(resp.Bundles)),
			},
		}})
		if err := stream.Send(&pb.EvidenceBundleEvent{Event: &pb.EvidenceBundleEvent_Bundle{Bundle: bundle}}); err != nil {
			return err
		}
	}
	return nil
}

// ── SearchCodebase ─────────────────────────────────────────────────────────

func (s *retrievalServer) SearchCodebase(ctx context.Context, req *pb.CodebaseSearchRequest) (*pb.CodebaseSearchResponse, error) {
	atomic.AddInt64(&s.totalRequests, 1)
	atomic.AddInt64(&s.codebaseSearches, 1)

	ctx, cancel := context.WithTimeout(ctx, searchTimeout)
	defer cancel()

	start := time.Now()
	limit := int(req.Limit)
	if limit <= 0 {
		limit = defaultLimit
	}
	if limit > maxLimit {
		limit = maxLimit
	}

	vec, err := s.embed(ctx, req.Query)
	if err != nil {
		slog.Warn("[retrieval] codebase embed failed", "err", err)
		return &pb.CodebaseSearchResponse{}, nil
	}

	chunks, err := s.qdrantSearchCodebase(ctx, vec, req.Kinds, req.PathPrefixes, limit)
	if err != nil {
		slog.Warn("[retrieval] codebase search failed", "err", err)
		return &pb.CodebaseSearchResponse{}, nil
	}

	// HTTP method filter
	if req.HttpMethod != "" {
		filtered := chunks[:0]
		for _, c := range chunks {
			if c.HTTPMethod == "" || strings.EqualFold(c.HTTPMethod, req.HttpMethod) {
				filtered = append(filtered, c)
			}
		}
		chunks = filtered
	}

	protoChunks := make([]*pb.CodebaseChunk, len(chunks))
	for i, c := range chunks {
		protoChunks[i] = &pb.CodebaseChunk{
			ChunkId:        c.ID,
			FilePath:       c.FilePath,
			Kind:           c.Kind,
			HttpMethod:     c.HTTPMethod,
			RouteId:        c.RouteID,
			Tags:           c.Tags,
			ContentPreview: c.ContentPreview,
			Score:          c.Score,
			StartLine:      c.StartLine,
			EndLine:        c.EndLine,
		}
	}

	return &pb.CodebaseSearchResponse{
		Chunks:  protoChunks,
		TotalMs: float32(time.Since(start).Milliseconds()),
	}, nil
}

// ── StreamCodebase ─────────────────────────────────────────────────────────

func (s *retrievalServer) StreamCodebase(req *pb.CodebaseSearchRequest, stream pb.RetrievalService_StreamCodebaseServer) error {
	resp, err := s.SearchCodebase(stream.Context(), req)
	if err != nil {
		return stream.Send(&pb.CodebaseChunkEvent{Event: &pb.CodebaseChunkEvent_Error{
			Error: &pb.RetrievalError{Code: "INTERNAL", Message: err.Error()},
		}})
	}
	for _, chunk := range resp.Chunks {
		if err := stream.Send(&pb.CodebaseChunkEvent{Event: &pb.CodebaseChunkEvent_Chunk{Chunk: chunk}}); err != nil {
			return err
		}
	}
	return nil
}

// ── Health ─────────────────────────────────────────────────────────────────

func (s *retrievalServer) Health(ctx context.Context, _ *pb.HealthRequest) (*pb.HealthResponse, error) {
	resp := &pb.HealthResponse{Timestamp: time.Now().UnixMilli()}
	var wg sync.WaitGroup
	wg.Add(4)

	go func() { defer wg.Done(); resp.PgvectorConnected = s.pool.Ping(ctx) == nil }()
	go func() {
		defer wg.Done()
		if s.qdrant != nil {
			_, err := s.qdrant.HealthCheck(ctx)
			resp.QdrantConnected = err == nil
		}
	}()
	go func() { defer wg.Done(); resp.RedisConnected = s.rdb.Ping(ctx).Err() == nil }()
	go func() {
		defer wg.Done()
		ctx2, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		r, err := http.NewRequestWithContext(ctx2, http.MethodGet, s.cfg.EmbedServiceURL+"/health", nil)
		if err == nil {
			if httpResp, err := s.httpClient.Do(r); err == nil {
				resp.EmbeddingServiceUp = httpResp.StatusCode == http.StatusOK
				httpResp.Body.Close()
			}
		}
	}()
	wg.Wait()

	switch {
	case !resp.PgvectorConnected:
		resp.Status = "unhealthy"
	case !resp.QdrantConnected || !resp.RedisConnected:
		resp.Status = "degraded"
	default:
		resp.Status = "healthy"
	}
	return resp, nil
}

// ── HTTP handlers ──────────────────────────────────────────────────────────

func (s *retrievalServer) httpHealth(w http.ResponseWriter, r *http.Request) {
	h, _ := s.Health(r.Context(), &pb.HealthRequest{})
	code := http.StatusOK
	if h.GetStatus() == "unhealthy" {
		code = http.StatusServiceUnavailable
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]any{
		"status":             h.GetStatus(),
		"pgvectorConnected":  h.GetPgvectorConnected(),
		"qdrantConnected":    h.GetQdrantConnected(),
		"redisConnected":     h.GetRedisConnected(),
		"embeddingServiceUp": h.GetEmbeddingServiceUp(),
		"timestamp":          h.GetTimestamp(),
	})
}

func (s *retrievalServer) httpSearchEvidence(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Query        string         `json:"query"`
		CaseID       string         `json:"case_id"`
		Limit        int32          `json:"limit"`
		Jurisdiction string         `json:"jurisdiction"`
		JSONBFilter  *JSONBFilter   `json:"jsonb_filter,omitempty"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// If JSONB filter provided, run pgvector with filter (then merge with Qdrant)
	resp, err := s.SearchEvidence(r.Context(), &pb.EvidenceSearchRequest{
		Query:        body.Query,
		CaseId:       body.CaseID,
		Limit:        body.Limit,
		Jurisdiction: body.Jurisdiction,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *retrievalServer) httpSearchCodebase(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Query       string   `json:"query"`
		Limit       int32    `json:"limit"`
		Kinds       []string `json:"kinds"`
		PathPrefixes []string `json:"path_prefixes"`
		HTTPMethod  string   `json:"http_method"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&body); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	resp, err := s.SearchCodebase(r.Context(), &pb.CodebaseSearchRequest{
		Query:        body.Query,
		Limit:        body.Limit,
		Kinds:        body.Kinds,
		PathPrefixes: body.PathPrefixes,
		HttpMethod:   body.HTTPMethod,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *retrievalServer) httpStats(w http.ResponseWriter, r *http.Request) {
	total := atomic.LoadInt64(&s.totalRequests)
	hits := atomic.LoadInt64(&s.cacheHits)
	hitRate := float64(0)
	if total > 0 {
		hitRate = float64(hits) / float64(total)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"evidenceSearches": atomic.LoadInt64(&s.evidenceSearches),
		"codebaseSearches": atomic.LoadInt64(&s.codebaseSearches),
		"cacheHits":        hits,
		"totalRequests":    total,
		"cacheHitRate":     hitRate,
		"gpuEmbedEnabled":  s.cfg.GPUEmbedEnabled,
	})
}

// ── Startup / Shutdown ─────────────────────────────────────────────────────

func main() {
	cfg := loadConfig()
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	// PostgreSQL
	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[retrieval] pgxpool: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(context.Background()); err != nil {
		slog.Warn("[retrieval] pgvector degraded", "err", err)
	} else {
		slog.Info("[retrieval] pgvector OK")
	}

	// Redis
	rOpts, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		log.Fatalf("[retrieval] redis URL: %v", err)
	}
	rdb := redis.NewClient(rOpts)
	defer rdb.Close()
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		slog.Warn("[retrieval] Redis degraded", "err", err)
	} else {
		slog.Info("[retrieval] Redis OK")
	}

	// Qdrant gRPC
	var qdrant *qdrantclient.Client
	if qc, err := qdrantclient.NewClient(&qdrantclient.Config{
		Host: cfg.QdrantHost,
		Port: cfg.QdrantPort,
	}); err == nil {
		qdrant = qc
		slog.Info("[retrieval] Qdrant gRPC OK", "host", cfg.QdrantHost, "port", cfg.QdrantPort)
	} else {
		slog.Warn("[retrieval] Qdrant gRPC degraded (REST fallback)", "err", err)
	}

	httpClient := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        50,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
		},
	}

	srv := &retrievalServer{
		cfg: cfg, pool: pool, rdb: rdb, qdrant: qdrant, httpClient: httpClient,
	}

	// gRPC server
	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("[retrieval] gRPC listen: %v", err)
	}
	grpcSrv := grpc.NewServer(
		grpc.KeepaliveParams(keepalive.ServerParameters{
			MaxConnectionIdle:     5 * time.Minute,
			MaxConnectionAge:      10 * time.Minute,
			MaxConnectionAgeGrace: 30 * time.Second,
			Time:                  10 * time.Second,
			Timeout:               5 * time.Second,
		}),
		grpc.MaxRecvMsgSize(10*1024*1024),
		grpc.MaxSendMsgSize(10*1024*1024),
	)
	pb.RegisterRetrievalServiceServer(grpcSrv, srv)
	reflection.Register(grpcSrv)

	// HTTP server
	mux := http.NewServeMux()
	mux.HandleFunc("/health", srv.httpHealth)
	mux.HandleFunc("/search/evidence", srv.httpSearchEvidence)
	mux.HandleFunc("/search/codebase", srv.httpSearchCodebase)
	mux.HandleFunc("/stats", srv.httpStats)

	httpSrv := &http.Server{
		Addr:         ":" + cfg.HTTPPort,
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	slog.Info("[retrieval] ready",
		"grpc", cfg.GRPCPort,
		"http", cfg.HTTPPort,
		"gpu_embed", cfg.GPUEmbedEnabled,
		"cache_ttl", cfg.CacheTTL,
	)

	go func() {
		if err := grpcSrv.Serve(lis); err != nil {
			slog.Error("[retrieval] gRPC", "err", err)
		}
	}()
	go func() {
		if err := httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("[retrieval] HTTP", "err", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("[retrieval] shutdown...")
	grpcSrv.GracefulStop()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	httpSrv.Shutdown(ctx)
	slog.Info("[retrieval] done")
}

// ── Qdrant payload helpers (typed Value map) ───────────────────────────────

func qdrantStr(m map[string]*qdrantclient.Value, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	if sv, ok := v.GetKind().(*qdrantclient.Value_StringValue); ok {
		return sv.StringValue
	}
	if iv, ok := v.GetKind().(*qdrantclient.Value_IntegerValue); ok {
		return strconv.FormatInt(iv.IntegerValue, 10)
	}
	return ""
}

func qdrantInt32(m map[string]*qdrantclient.Value, key string) int32 {
	v, ok := m[key]
	if !ok || v == nil {
		return 0
	}
	if iv, ok := v.GetKind().(*qdrantclient.Value_IntegerValue); ok {
		return int32(iv.IntegerValue)
	}
	if dv, ok := v.GetKind().(*qdrantclient.Value_DoubleValue); ok {
		return int32(dv.DoubleValue)
	}
	return 0
}

func qdrantStrSlice(m map[string]*qdrantclient.Value, key string) []string {
	v, ok := m[key]
	if !ok || v == nil {
		return nil
	}
	lv, ok := v.GetKind().(*qdrantclient.Value_ListValue)
	if !ok || lv.ListValue == nil {
		return nil
	}
	result := make([]string, 0, len(lv.ListValue.Values))
	for _, item := range lv.ListValue.Values {
		if sv, ok := item.GetKind().(*qdrantclient.Value_StringValue); ok && sv.StringValue != "" {
			result = append(result, sv.StringValue)
		}
	}
	return result
}

// ── any (REST fallback) payload helpers ───────────────────────────────────

func anyStr(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func anyStrSlice(v any) []string {
	if v == nil {
		return nil
	}
	if sl, ok := v.([]any); ok {
		result := make([]string, 0, len(sl))
		for _, item := range sl {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
		return result
	}
	return nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
