// Package main — Go Legal Library Search Service
//
// gRPC server implementing LibrarySearchService proto:
//   SearchLibrary    — unary parallel fan-out (citation + FTS + pgvector + Qdrant) → RRF
//   StreamLibrary    — server streaming progressive delivery
//   GetDocumentToc   — document table-of-contents tree
//   GetNodeContext   — node with children + chunks + breadcrumb
//   ResolveCitation  — citation label lookup
//   Health           — deep health check (pg + redis + qdrant + ollama)
//
// Also exposes HTTP on :8096 for SvelteKit direct calls:
//   GET  /health           — deep health check
//   POST /search           — parallel search with RRF fusion
//   GET  /suggest?q=       — autocomplete suggestions
//   GET  /toc/:id          — document table-of-contents
//   GET  /node/:id         — node context with chunks + children
//   POST /citation         — citation resolution
//
// ENV:
//
//	DATABASE_URL       — PostgreSQL connection string
//	QDRANT_URL         — Qdrant REST endpoint (default http://localhost:6333)
//	QDRANT_GRPC_HOST   — Qdrant gRPC host (default localhost)
//	QDRANT_GRPC_PORT   — Qdrant gRPC port (default 6334)
//	REDIS_URL          — Redis connection string (default redis://localhost:6379)
//	OLLAMA_URL         — Ollama API for query embedding (default http://localhost:11434)
//	GRPC_PORT          — gRPC listen port (default 50055)
//	HTTP_PORT          — HTTP health port (default 8096)
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"os/signal"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	qdrantclient "github.com/qdrant/go-client/qdrant"
	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/reflection"

	pb "github.com/deeds-web-app/services/go-search-service/proto/libsearch"
)

// ── Configuration ─────────────────────────────────────────────────────────

type config struct {
	DatabaseURL  string
	QdrantURL    string // REST fallback
	QdrantHost   string // gRPC host
	QdrantPort   int    // gRPC port
	RedisURL     string
	OllamaURL    string
	GRPCPort     string
	HTTPPort     string
}

func loadConfig() config {
	qdPort, _ := strconv.Atoi(envOr("QDRANT_GRPC_PORT", "6334"))
	return config{
		DatabaseURL: envOr("DATABASE_URL", "postgresql://legal_admin:123456@localhost:5432/legal_ai_db"),
		QdrantURL:   envOr("QDRANT_URL", "http://localhost:6333"),
		QdrantHost:  envOr("QDRANT_GRPC_HOST", "localhost"),
		QdrantPort:  qdPort,
		RedisURL:    envOr("REDIS_URL", "redis://localhost:6379"),
		OllamaURL:   envOr("OLLAMA_URL", "http://localhost:11434"),
		GRPCPort:    envOr("GRPC_PORT", "50055"),
		HTTPPort:    envOr("HTTP_PORT", "8096"),
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ── Server ────────────────────────────────────────────────────────────────

type libraryServer struct {
	pb.UnimplementedLibrarySearchServiceServer
	cfg        config
	pool       *pgxpool.Pool
	rdb        *redis.Client
	qdrant     *qdrantclient.Client // native gRPC client
	httpClient *http.Client         // shared for Ollama + fallback
}

// ── SearchLibrary (unary) ─────────────────────────────────────────────────

func (s *libraryServer) SearchLibrary(ctx context.Context, req *pb.LibrarySearchRequest) (*pb.LibrarySearchResponse, error) {
	if len(req.Query) < 2 {
		return &pb.LibrarySearchResponse{Hits: []*pb.LibraryHit{}, Total: 0}, nil
	}

	limit := int(req.Limit)
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	sr := &searchRequest{
		Query:        req.Query,
		Jurisdiction: req.Jurisdiction,
		CorpusType:   req.CorpusType,
		Limit:        limit,
		CaseID:       req.CaseId,
		UserID:       req.UserId,
		Embedding:    req.QueryEmbedding,
		FTSWeight:    0.4,
		VectorWeight: 0.6,
	}
	if w := req.Weights; w != nil {
		if w.FtsWeight > 0 {
			sr.FTSWeight = float64(w.FtsWeight)
		}
		if w.PgvectorWeight > 0 {
			sr.VectorWeight = float64(w.PgvectorWeight)
		}
	}

	resp := s.parallelSearch(ctx, sr)

	pbHits := make([]*pb.LibraryHit, len(resp.Hits))
	for i, h := range resp.Hits {
		pbHits[i] = hitToProto(&h)
	}

	meta := &pb.SearchMeta{
		TotalMs:         floatVal(resp.Meta, "totalMs"),
		EmbedMs:         floatVal(resp.Meta, "embedMs"),
		CitationMs:      floatVal(resp.Meta, "citationMs"),
		FtsMs:           floatVal(resp.Meta, "ftsMs"),
		PgvectorMs:      floatVal(resp.Meta, "pgvectorMs"),
		QdrantMs:        floatVal(resp.Meta, "qdrantMs"),
		FusionMs:        floatVal(resp.Meta, "fusionMs"),
		EmbeddingSource: strFromMap(resp.Meta, "embeddingSource"),
		CitationHits:    int32Val(resp.Meta, "citationHits"),
		FtsHits:         int32Val(resp.Meta, "ftsHits"),
		PgvectorHits:    int32Val(resp.Meta, "pgvectorHits"),
		QdrantHits:      int32Val(resp.Meta, "qdrantHits"),
	}

	return &pb.LibrarySearchResponse{
		Hits:  pbHits,
		Total: int32(resp.Total),
		Meta:  meta,
	}, nil
}

// ── StreamLibrary (server streaming) ──────────────────────────────────────

func (s *libraryServer) StreamLibrary(req *pb.LibrarySearchRequest, stream grpc.ServerStreamingServer[pb.LibrarySearchEvent]) error {
	ctx := stream.Context()

	_ = stream.Send(&pb.LibrarySearchEvent{
		Event: &pb.LibrarySearchEvent_Progress{
			Progress: &pb.SearchProgress{Stage: "embed", Message: "Computing query embedding..."},
		},
	})

	if len(req.Query) < 2 {
		return nil
	}

	limit := int(req.Limit)
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	sr := &searchRequest{
		Query:        req.Query,
		Jurisdiction: req.Jurisdiction,
		CorpusType:   req.CorpusType,
		Limit:        limit,
		CaseID:       req.CaseId,
		UserID:       req.UserId,
		Embedding:    req.QueryEmbedding,
		FTSWeight:    0.4,
		VectorWeight: 0.6,
	}
	if w := req.Weights; w != nil {
		if w.FtsWeight > 0 {
			sr.FTSWeight = float64(w.FtsWeight)
		}
		if w.PgvectorWeight > 0 {
			sr.VectorWeight = float64(w.PgvectorWeight)
		}
	}

	resp := s.parallelSearch(ctx, sr)

	_ = stream.Send(&pb.LibrarySearchEvent{
		Event: &pb.LibrarySearchEvent_Progress{
			Progress: &pb.SearchProgress{
				Stage:   "fusion",
				Current: int32(len(resp.Hits)),
				Total:   int32(resp.Total),
				Message: fmt.Sprintf("Fused %d results", resp.Total),
			},
		},
	})

	for _, h := range resp.Hits {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		_ = stream.Send(&pb.LibrarySearchEvent{
			Event: &pb.LibrarySearchEvent_Hit{Hit: hitToProto(&h)},
		})
	}

	return nil
}

// ── GetDocumentToc ────────────────────────────────────────────────────────

func (s *libraryServer) GetDocumentToc(ctx context.Context, req *pb.TocRequest) (*pb.TocResponse, error) {
	docID := req.DocumentId
	maxDepth := int(req.MaxDepth)

	var title, corpusType string
	err := s.pool.QueryRow(ctx,
		`SELECT title, corpus_type FROM library_documents WHERE id = $1`, docID,
	).Scan(&title, &corpusType)
	if err != nil {
		return nil, fmt.Errorf("document %d not found: %w", docID, err)
	}

	depthFilter := ""
	var params []any
	params = append(params, docID)
	if maxDepth > 0 {
		depthFilter = " AND depth <= $2"
		params = append(params, maxDepth)
	}

	rows, err := s.pool.Query(ctx, fmt.Sprintf(`
		SELECT id, heading, citation_label, node_type, node_path, depth, ordinal,
		       (SELECT count(*) FROM legal_chunks WHERE legal_node_id = ln.id) AS chunk_count
		FROM legal_nodes ln
		WHERE document_id = $1 %s
		ORDER BY ordinal, depth
	`, depthFilter), params...)
	if err != nil {
		return nil, fmt.Errorf("toc query failed: %w", err)
	}
	defer rows.Close()

	var flat []*pb.TocNode
	for rows.Next() {
		n := &pb.TocNode{}
		if err := rows.Scan(&n.NodeId, &n.Heading, &n.CitationLabel, &n.NodeType,
			&n.NodePath, &n.Depth, &n.Ordinal, &n.ChunkCount); err != nil {
			continue
		}
		flat = append(flat, n)
	}

	return &pb.TocResponse{
		Nodes:         flat,
		DocumentTitle: title,
		CorpusType:    corpusType,
	}, nil
}

// ── GetNodeContext ─────────────────────────────────────────────────────────

func (s *libraryServer) GetNodeContext(ctx context.Context, req *pb.NodeContextRequest) (*pb.NodeContextResponse, error) {
	nodeID := req.NodeId

	node := &pb.TocNode{}
	err := s.pool.QueryRow(ctx, `
		SELECT id, heading, citation_label, node_type, node_path, depth, ordinal
		FROM legal_nodes WHERE id = $1
	`, nodeID).Scan(&node.NodeId, &node.Heading, &node.CitationLabel, &node.NodeType,
		&node.NodePath, &node.Depth, &node.Ordinal)
	if err != nil {
		return nil, fmt.Errorf("node %d not found: %w", nodeID, err)
	}

	resp := &pb.NodeContextResponse{Node: node}

	// Chunks (included by default — only skip if explicitly set to false)
	includeChunks := true
	if req.IncludeChunks == false && req.IncludeChildren == false && req.MaxChildren > 0 {
		// Only skip chunks if the caller explicitly structured their request to exclude them
		includeChunks = false
	}
	if includeChunks {
		chunkRows, err := s.pool.Query(ctx, `
			SELECT id, chunk_index, chunk_text, page_start, page_end,
			       (embedding IS NOT NULL) AS has_embedding
			FROM legal_chunks
			WHERE legal_node_id = $1
			ORDER BY chunk_index
		`, nodeID)
		if err == nil {
			defer chunkRows.Close()
			var textParts []string
			for chunkRows.Next() {
				c := &pb.ChunkDetail{}
				if err := chunkRows.Scan(&c.ChunkId, &c.ChunkIndex, &c.ChunkText,
					&c.PageStart, &c.PageEnd, &c.HasEmbedding); err != nil {
					continue
				}
				resp.Chunks = append(resp.Chunks, c)
				textParts = append(textParts, c.ChunkText)
			}
			resp.FullText = strings.Join(textParts, "\n")
		}
	}

	// Children
	maxChildren := int(req.MaxChildren)
	if maxChildren <= 0 {
		maxChildren = 50
	}
	childRows, err := s.pool.Query(ctx, `
		SELECT id, heading, citation_label, node_type, node_path, depth, ordinal,
		       (SELECT count(*) FROM legal_chunks WHERE legal_node_id = ln.id) AS chunk_count
		FROM legal_nodes ln
		WHERE parent_id = $1
		ORDER BY ordinal
		LIMIT $2
	`, nodeID, maxChildren)
	if err == nil {
		defer childRows.Close()
		for childRows.Next() {
			c := &pb.TocNode{}
			if err := childRows.Scan(&c.NodeId, &c.Heading, &c.CitationLabel, &c.NodeType,
				&c.NodePath, &c.Depth, &c.Ordinal, &c.ChunkCount); err != nil {
				continue
			}
			resp.Children = append(resp.Children, c)
		}
	}

	breadcrumb := s.buildBreadcrumb(ctx, nodeID)
	if len(breadcrumb) > 0 {
		resp.Breadcrumb = &pb.Breadcrumb{Items: breadcrumb}
	}

	return resp, nil
}

func (s *libraryServer) buildBreadcrumb(ctx context.Context, nodeID int32) []*pb.BreadcrumbItem {
	var items []*pb.BreadcrumbItem
	currentID := nodeID

	for i := 0; i < 20; i++ {
		var parentID *int32
		item := &pb.BreadcrumbItem{}
		err := s.pool.QueryRow(ctx, `
			SELECT id, heading, node_type, depth, parent_id
			FROM legal_nodes WHERE id = $1
		`, currentID).Scan(&item.NodeId, &item.Heading, &item.NodeType, &item.Depth, &parentID)
		if err != nil {
			break
		}
		items = append([]*pb.BreadcrumbItem{item}, items...)
		if parentID == nil {
			break
		}
		currentID = *parentID
	}

	return items
}

// ── ResolveCitation ───────────────────────────────────────────────────────

func (s *libraryServer) ResolveCitation(ctx context.Context, req *pb.CitationRequest) (*pb.CitationResponse, error) {
	sr := &searchRequest{
		Query:        req.Citation,
		Jurisdiction: req.Jurisdiction,
		Limit:        20,
	}
	filters, params := buildFilters(sr)
	hits := s.searchCitation(ctx, req.Citation, filters, params, 20)

	pbHits := make([]*pb.LibraryHit, len(hits))
	for i, h := range hits {
		pbHits[i] = hitToProto(&h)
	}

	return &pb.CitationResponse{
		Matches: pbHits,
		Total:   int32(len(pbHits)),
	}, nil
}

// ── Health ─────────────────────────────────────────────────────────────────

func (s *libraryServer) Health(ctx context.Context, req *pb.HealthRequest) (*pb.HealthResponse, error) {
	status := "healthy"

	pgOk := s.pool.Ping(ctx) == nil

	redisOk := false
	if s.rdb != nil {
		redisOk = s.rdb.Ping(ctx).Err() == nil
	}

	// Check Qdrant via native client health
	qdrantOk := false
	if s.qdrant != nil {
		healthCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		defer cancel()
		_, err := s.qdrant.ListCollections(healthCtx)
		qdrantOk = err == nil
	}

	// Check Ollama
	embeddingUp := false
	olReq, _ := http.NewRequestWithContext(ctx, "GET", s.cfg.OllamaURL+"/api/tags", nil)
	olResp, err := s.httpClient.Do(olReq)
	if err == nil {
		embeddingUp = olResp.StatusCode == 200
		olResp.Body.Close()
	}

	// Count indexed docs and chunks
	var docCount, chunkCount int32
	s.pool.QueryRow(ctx, "SELECT count(*) FROM library_documents").Scan(&docCount)
	s.pool.QueryRow(ctx, "SELECT count(*) FROM legal_chunks").Scan(&chunkCount)

	if !pgOk {
		status = "unhealthy"
	} else if !redisOk || !qdrantOk {
		status = "degraded"
	}

	return &pb.HealthResponse{
		Status:             status,
		PgvectorConnected:  pgOk,
		QdrantConnected:    qdrantOk,
		RedisConnected:     redisOk,
		EmbeddingServiceUp: embeddingUp,
		Timestamp:          time.Now().Unix(),
		IndexedDocuments:   docCount,
		IndexedChunks:      chunkCount,
	}, nil
}

// ── Internal Types ────────────────────────────────────────────────────────

type searchRequest struct {
	Query        string
	Jurisdiction string
	CorpusType   string
	Limit        int
	CaseID       string
	UserID       string
	Embedding    []float32
	FTSWeight    float64
	VectorWeight float64
}

type libraryHit struct {
	ChunkID          string  `json:"chunkId"`
	DocumentID       string  `json:"documentId"`
	NodeID           string  `json:"nodeId"`
	Title            string  `json:"title"`
	CorpusType       string  `json:"corpusType"`
	SourceType       string  `json:"sourceType"`
	IsOfficial       bool    `json:"isOfficial"`
	OfficialURL      string  `json:"officialUrl"`
	Heading          string  `json:"heading"`
	CitationLabel    string  `json:"citationLabel"`
	NodePath         string  `json:"nodePath"`
	NodeType         string  `json:"nodeType"`
	Snippet          string  `json:"snippet"`
	PageStart        int     `json:"pageStart"`
	PageEnd          int     `json:"pageEnd"`
	Score            float64 `json:"score"`
	MatchType        string  `json:"matchType"`
	SourceConfidence string  `json:"sourceConfidence"`
	JurisdictionCode string  `json:"jurisdictionCode"`
	JurisdictionName string  `json:"jurisdictionName"`
}

type searchResponse struct {
	Hits  []libraryHit   `json:"hits"`
	Total int            `json:"total"`
	Meta  map[string]any `json:"meta"`
}

// ── Parallel Search ───────────────────────────────────────────────────────

func (s *libraryServer) parallelSearch(ctx context.Context, req *searchRequest) searchResponse {
	start := time.Now()
	meta := map[string]any{}

	// Get query embedding (needed for pgvector + Qdrant)
	var embedding []float32
	if len(req.Embedding) > 0 {
		embedding = req.Embedding
		meta["embeddingSource"] = "precomputed"
	} else {
		embStart := time.Now()
		var err error
		embedding, err = s.getQueryEmbedding(ctx, req.Query)
		meta["embedMs"] = time.Since(embStart).Milliseconds()
		if err != nil {
			meta["embeddingSource"] = "failed"
			log.Printf("⚠️  Embedding failed: %v", err)
		} else {
			meta["embeddingSource"] = "ollama"
		}
	}

	filters, params := buildFilters(req)

	type result struct {
		hits []libraryHit
		name string
		ms   int64
	}

	var wg sync.WaitGroup
	results := make(chan result, 4)

	// 1. Exact citation match
	wg.Add(1)
	go func() {
		defer wg.Done()
		t := time.Now()
		hits := s.searchCitation(ctx, req.Query, filters, params, req.Limit*2)
		results <- result{hits, "citation", time.Since(t).Milliseconds()}
	}()

	// 2. GIN full-text search
	wg.Add(1)
	go func() {
		defer wg.Done()
		t := time.Now()
		hits := s.searchFTS(ctx, req.Query, filters, params, req.Limit*2)
		results <- result{hits, "fts", time.Since(t).Milliseconds()}
	}()

	// 3. pgvector cosine similarity
	wg.Add(1)
	go func() {
		defer wg.Done()
		if embedding == nil {
			results <- result{nil, "pgvector", 0}
			return
		}
		t := time.Now()
		hits := s.searchPgvector(ctx, embedding, filters, params, req.Limit*2)
		results <- result{hits, "pgvector", time.Since(t).Milliseconds()}
	}()

	// 4. Qdrant ANN search (native gRPC client)
	wg.Add(1)
	go func() {
		defer wg.Done()
		if embedding == nil {
			results <- result{nil, "qdrant", 0}
			return
		}
		t := time.Now()
		hits := s.searchQdrant(ctx, embedding, req)
		results <- result{hits, "qdrant", time.Since(t).Milliseconds()}
	}()

	go func() {
		wg.Wait()
		close(results)
	}()

	allHits := map[string][]rankEntry{}
	for r := range results {
		meta[r.name+"Ms"] = r.ms
		meta[r.name+"Hits"] = len(r.hits)
		for rank, hit := range r.hits {
			allHits[hit.ChunkID] = append(allHits[hit.ChunkID], rankEntry{
				hit:    hit,
				rank:   rank + 1,
				source: r.name,
			})
		}
	}

	fusionStart := time.Now()
	fused := rrfFusion(allHits, req)
	meta["fusionMs"] = time.Since(fusionStart).Milliseconds()
	meta["totalMs"] = time.Since(start).Milliseconds()

	if len(fused) > req.Limit {
		fused = fused[:req.Limit]
	}

	return searchResponse{
		Hits:  fused,
		Total: len(fused),
		Meta:  meta,
	}
}

// ── Search Strategies ─────────────────────────────────────────────────────

func buildFilters(req *searchRequest) (string, []any) {
	var clauses []string
	var params []any
	idx := 1

	if req.Jurisdiction != "" {
		params = append(params, req.Jurisdiction)
		clauses = append(clauses, fmt.Sprintf("j.code = $%d", idx))
		idx++
	}
	if req.CorpusType != "" {
		params = append(params, req.CorpusType)
		clauses = append(clauses, fmt.Sprintf("ld.corpus_type = $%d::corpus_type", idx))
		idx++
	}

	where := ""
	if len(clauses) > 0 {
		where = " AND " + strings.Join(clauses, " AND ")
	}
	return where, params
}

func (s *libraryServer) searchCitation(ctx context.Context, query, filters string, filterParams []any, limit int) []libraryHit {
	params := append([]any{}, filterParams...)
	params = append(params, "%"+strings.ToLower(query)+"%")
	qIdx := len(params)
	params = append(params, limit)
	lIdx := len(params)

	q := fmt.Sprintf(`
		SELECT lc.id, ln.id, ln.document_id,
		       ld.title, ld.corpus_type, ld.source_type, ld.is_official, ld.official_url,
		       ln.heading, ln.citation_label, ln.node_path, ln.node_type,
		       lc.chunk_text, lc.page_start, lc.page_end,
		       ld.source_confidence,
		       j.code, j.name
		FROM legal_nodes ln
		JOIN legal_chunks lc ON lc.legal_node_id = ln.id
		JOIN library_documents ld ON ld.id = ln.document_id
		LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		WHERE lower(ln.citation_label) LIKE $%d
		%s
		ORDER BY length(ln.citation_label) ASC
		LIMIT $%d`, qIdx, filters, lIdx)

	return s.queryHits(ctx, q, params, "citation")
}

func (s *libraryServer) searchFTS(ctx context.Context, query, filters string, filterParams []any, limit int) []libraryHit {
	params := append([]any{}, filterParams...)
	params = append(params, query)
	qIdx := len(params)
	params = append(params, limit)
	lIdx := len(params)

	q := fmt.Sprintf(`
		SELECT lc.id, ln.id, ln.document_id,
		       ld.title, ld.corpus_type, ld.source_type, ld.is_official, ld.official_url,
		       ln.heading, ln.citation_label, ln.node_path, ln.node_type,
		       lc.chunk_text, lc.page_start, lc.page_end,
		       ld.source_confidence,
		       j.code, j.name,
		       ts_rank(lc.tsv, plainto_tsquery('english', $%d)) AS rank
		FROM legal_chunks lc
		JOIN legal_nodes ln ON ln.id = lc.legal_node_id
		JOIN library_documents ld ON ld.id = ln.document_id
		LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		WHERE lc.tsv @@ plainto_tsquery('english', $%d)
		%s
		ORDER BY rank DESC
		LIMIT $%d`, qIdx, qIdx, filters, lIdx)

	return s.queryHits(ctx, q, params, "fts")
}

func (s *libraryServer) searchPgvector(ctx context.Context, embedding []float32, filters string, filterParams []any, limit int) []libraryHit {
	params := append([]any{}, filterParams...)

	vecStr := float32SliceToVectorString(embedding)
	params = append(params, vecStr)
	vecIdx := len(params)
	params = append(params, limit)
	lIdx := len(params)

	q := fmt.Sprintf(`
		SELECT lc.id, ln.id, ln.document_id,
		       ld.title, ld.corpus_type, ld.source_type, ld.is_official, ld.official_url,
		       ln.heading, ln.citation_label, ln.node_path, ln.node_type,
		       lc.chunk_text, lc.page_start, lc.page_end,
		       ld.source_confidence,
		       j.code, j.name,
		       1 - (lc.embedding <=> $%d::vector) AS rank
		FROM legal_chunks lc
		JOIN legal_nodes ln ON ln.id = lc.legal_node_id
		JOIN library_documents ld ON ld.id = ln.document_id
		LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
		WHERE lc.embedding IS NOT NULL
		%s
		ORDER BY lc.embedding <=> $%d::vector
		LIMIT $%d`, vecIdx, filters, vecIdx, lIdx)

	return s.queryHits(ctx, q, params, "vector")
}

// searchQdrant uses the native Qdrant Go gRPC client for ANN search.
// Falls back to REST API if the native client is unavailable.
func (s *libraryServer) searchQdrant(ctx context.Context, embedding []float32, req *searchRequest) []libraryHit {
	if s.qdrant != nil {
		return s.searchQdrantNative(ctx, embedding, req)
	}
	return s.searchQdrantREST(ctx, embedding, req)
}

func (s *libraryServer) searchQdrantNative(ctx context.Context, embedding []float32, req *searchRequest) []libraryHit {
	limit := uint64(req.Limit * 2)

	// Build filter conditions
	var conditions []*qdrantclient.Condition
	if req.Jurisdiction != "" {
		conditions = append(conditions, qdrantclient.NewMatch("jurisdiction", req.Jurisdiction))
	}
	if req.CorpusType != "" {
		conditions = append(conditions, qdrantclient.NewMatch("corpus_type", req.CorpusType))
	}

	queryReq := &qdrantclient.QueryPoints{
		CollectionName: "legal_documents",
		Query:          qdrantclient.NewQuery(embedding...),
		Limit:          &limit,
		WithPayload:    qdrantclient.NewWithPayload(true),
	}
	if len(conditions) > 0 {
		queryReq.Filter = &qdrantclient.Filter{Must: conditions}
	}

	points, err := s.qdrant.Query(ctx, queryReq)
	if err != nil {
		log.Printf("⚠️  Qdrant native search failed, falling back to REST: %v", err)
		return s.searchQdrantREST(ctx, embedding, req)
	}

	var hits []libraryHit
	for _, p := range points {
		hit := libraryHit{
			Score:     float64(p.Score),
			MatchType: "qdrant",
		}
		if payload := p.GetPayload(); payload != nil {
			hit.ChunkID = qdrantStr(payload, "chunk_id")
			hit.DocumentID = qdrantStr(payload, "document_id")
			hit.NodeID = qdrantStr(payload, "node_id")
			hit.Title = qdrantStr(payload, "title")
			hit.Heading = qdrantStr(payload, "heading")
			hit.CitationLabel = qdrantStr(payload, "citation_label")
			hit.Snippet = qdrantStr(payload, "snippet")
			hit.CorpusType = qdrantStr(payload, "corpus_type")
			hit.JurisdictionCode = qdrantStr(payload, "jurisdiction")
		}
		if hit.ChunkID == "" {
			hit.ChunkID = fmt.Sprintf("qd-%v", p.GetId())
		}
		hits = append(hits, hit)
	}
	return hits
}

func (s *libraryServer) searchQdrantREST(ctx context.Context, embedding []float32, req *searchRequest) []libraryHit {
	type qdrantFilter struct {
		Must []map[string]any `json:"must,omitempty"`
	}
	type qdrantReq struct {
		Vector      []float32     `json:"vector"`
		Limit       int           `json:"limit"`
		WithPayload bool          `json:"with_payload"`
		Filter      *qdrantFilter `json:"filter,omitempty"`
	}

	body := qdrantReq{
		Vector:      embedding,
		Limit:       req.Limit * 2,
		WithPayload: true,
	}

	var must []map[string]any
	if req.Jurisdiction != "" {
		must = append(must, map[string]any{
			"key":   "jurisdiction",
			"match": map[string]any{"value": req.Jurisdiction},
		})
	}
	if req.CorpusType != "" {
		must = append(must, map[string]any{
			"key":   "corpus_type",
			"match": map[string]any{"value": req.CorpusType},
		})
	}
	if len(must) > 0 {
		body.Filter = &qdrantFilter{Must: must}
	}

	jsonBody, _ := json.Marshal(body)

	httpReq, _ := http.NewRequestWithContext(ctx, "POST",
		s.cfg.QdrantURL+"/collections/legal_documents/points/search",
		strings.NewReader(string(jsonBody)))
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		log.Printf("⚠️  Qdrant REST search failed: %v", err)
		return nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		log.Printf("⚠️  Qdrant REST returned %d", resp.StatusCode)
		return nil
	}

	var qdResp struct {
		Result []struct {
			ID      any            `json:"id"`
			Score   float64        `json:"score"`
			Payload map[string]any `json:"payload"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&qdResp); err != nil {
		return nil
	}

	var hits []libraryHit
	for _, r := range qdResp.Result {
		hit := libraryHit{
			Score:     r.Score,
			MatchType: "qdrant",
		}
		if p := r.Payload; p != nil {
			hit.ChunkID = strVal(p, "chunk_id")
			hit.DocumentID = strVal(p, "document_id")
			hit.NodeID = strVal(p, "node_id")
			hit.Title = strVal(p, "title")
			hit.Heading = strVal(p, "heading")
			hit.CitationLabel = strVal(p, "citation_label")
			hit.Snippet = strVal(p, "snippet")
			hit.CorpusType = strVal(p, "corpus_type")
			hit.JurisdictionCode = strVal(p, "jurisdiction")
		}
		if hit.ChunkID == "" {
			hit.ChunkID = fmt.Sprintf("qd-%v", r.ID)
		}
		hits = append(hits, hit)
	}
	return hits
}

// ── Query Helper ──────────────────────────────────────────────────────────

func (s *libraryServer) queryHits(ctx context.Context, sqlQuery string, params []any, matchType string) []libraryHit {
	rows, err := s.pool.Query(ctx, sqlQuery, params...)
	if err != nil {
		log.Printf("⚠️  %s query failed: %v", matchType, err)
		return nil
	}
	defer rows.Close()

	var hits []libraryHit
	for rows.Next() {
		var h libraryHit
		var rank *float64
		var jcode, jname, snippet *string
		var pageStart, pageEnd *int

		err := rows.Scan(
			&h.ChunkID, &h.NodeID, &h.DocumentID,
			&h.Title, &h.CorpusType, &h.SourceType, &h.IsOfficial, &h.OfficialURL,
			&h.Heading, &h.CitationLabel, &h.NodePath, &h.NodeType,
			&snippet, &pageStart, &pageEnd,
			&h.SourceConfidence,
			&jcode, &jname,
			&rank,
		)
		if err != nil {
			// Citation query has no rank column — try without it
			err = rows.Scan(
				&h.ChunkID, &h.NodeID, &h.DocumentID,
				&h.Title, &h.CorpusType, &h.SourceType, &h.IsOfficial, &h.OfficialURL,
				&h.Heading, &h.CitationLabel, &h.NodePath, &h.NodeType,
				&snippet, &pageStart, &pageEnd,
				&h.SourceConfidence,
				&jcode, &jname,
			)
			if err != nil {
				continue
			}
		}

		h.MatchType = matchType
		if rank != nil {
			h.Score = *rank
		} else {
			h.Score = 1.0
		}
		if snippet != nil {
			if len(*snippet) > 400 {
				h.Snippet = (*snippet)[:400] + "…"
			} else {
				h.Snippet = *snippet
			}
		}
		if pageStart != nil {
			h.PageStart = *pageStart
		}
		if pageEnd != nil {
			h.PageEnd = *pageEnd
		}
		if jcode != nil {
			h.JurisdictionCode = *jcode
		}
		if jname != nil {
			h.JurisdictionName = *jname
		}

		hits = append(hits, h)
	}
	return hits
}

// ── RRF Fusion ────────────────────────────────────────────────────────────

type rankEntry struct {
	hit    libraryHit
	rank   int
	source string
}

func rrfFusion(allHits map[string][]rankEntry, req *searchRequest) []libraryHit {
	const k = 60

	type fusedEntry struct {
		hit   libraryHit
		score float64
	}

	weights := map[string]float64{
		"citation": 1.0,
		"fts":      req.FTSWeight,
		"vector":   req.VectorWeight,
		"qdrant":   0.5,
	}

	fused := map[string]*fusedEntry{}

	for chunkID, entries := range allHits {
		for _, e := range entries {
			w := weights[e.source]
			rrfScore := w / (float64(k) + float64(e.rank))

			if f, ok := fused[chunkID]; ok {
				f.score += rrfScore
				if len(e.hit.Title) > len(f.hit.Title) {
					e.hit.Score = f.score
					e.hit.MatchType = "fused"
					f.hit = e.hit
				}
			} else {
				fused[chunkID] = &fusedEntry{hit: e.hit, score: rrfScore}
			}
		}
	}

	result := make([]libraryHit, 0, len(fused))
	for _, f := range fused {
		f.hit.Score = math.Round(f.score*10000) / 10000
		if len(fused) > 1 {
			f.hit.MatchType = "fused"
		}
		result = append(result, f.hit)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Score > result[j].Score
	})
	return result
}

// ── Embedding ─────────────────────────────────────────────────────────────

func (s *libraryServer) getQueryEmbedding(ctx context.Context, query string) ([]float32, error) {
	// Check Redis cache first
	if s.rdb != nil {
		cached, err := s.rdb.Get(ctx, "embed:search:"+query).Bytes()
		if err == nil {
			var vec []float32
			if json.Unmarshal(cached, &vec) == nil && len(vec) > 0 {
				return vec, nil
			}
		}
	}

	body, _ := json.Marshal(map[string]any{
		"model":  "embeddinggemma:latest",
		"prompt": query,
	})

	req, _ := http.NewRequestWithContext(ctx, "POST", s.cfg.OllamaURL+"/api/embeddings",
		strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama embed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("ollama embed status %d", resp.StatusCode)
	}

	var result struct {
		Embedding []float32 `json:"embedding"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	// Cache in Redis (24h TTL)
	if s.rdb != nil && len(result.Embedding) > 0 {
		data, _ := json.Marshal(result.Embedding)
		s.rdb.Set(ctx, "embed:search:"+query, data, 24*time.Hour)
	}

	return result.Embedding, nil
}

// ── HTTP Handlers ─────────────────────────────────────────────────────────

func (s *libraryServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	resp, _ := s.Health(r.Context(), &pb.HealthRequest{})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *libraryServer) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Query          string    `json:"query"`
		Jurisdiction   string    `json:"jurisdiction"`
		CorpusType     string    `json:"corpusType"`
		Limit          int       `json:"limit"`
		CaseID         string    `json:"caseId"`
		UserID         string    `json:"userId"`
		QueryEmbedding []float32 `json:"queryEmbedding"`
		FTSWeight      float64   `json:"ftsWeight"`
		VectorWeight   float64   `json:"vectorWeight"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if len(req.Query) < 2 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(searchResponse{Hits: []libraryHit{}, Total: 0, Meta: map[string]any{}})
		return
	}

	if req.Limit <= 0 || req.Limit > 100 {
		req.Limit = 20
	}
	if req.FTSWeight <= 0 {
		req.FTSWeight = 0.4
	}
	if req.VectorWeight <= 0 {
		req.VectorWeight = 0.6
	}

	sr := &searchRequest{
		Query:        req.Query,
		Jurisdiction: req.Jurisdiction,
		CorpusType:   req.CorpusType,
		Limit:        req.Limit,
		CaseID:       req.CaseID,
		UserID:       req.UserID,
		Embedding:    req.QueryEmbedding,
		FTSWeight:    req.FTSWeight,
		VectorWeight: req.VectorWeight,
	}

	resp := s.parallelSearch(r.Context(), sr)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *libraryServer) handleSuggest(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	limitStr := r.URL.Query().Get("limit")
	limit := 10
	if limitStr != "" {
		fmt.Sscanf(limitStr, "%d", &limit)
	}
	if limit <= 0 || limit > 50 {
		limit = 10
	}

	if len(query) < 1 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"suggestions": []string{}})
		return
	}

	rows, err := s.pool.Query(r.Context(), `
		(SELECT DISTINCT heading AS suggestion, 'heading' AS source
		 FROM legal_nodes
		 WHERE heading ILIKE $1
		 LIMIT $2)
		UNION ALL
		(SELECT DISTINCT citation_label AS suggestion, 'citation' AS source
		 FROM legal_nodes
		 WHERE citation_label ILIKE $1 AND citation_label != ''
		 LIMIT $2)
		UNION ALL
		(SELECT DISTINCT title AS suggestion, 'document' AS source
		 FROM library_documents
		 WHERE title ILIKE $1
		 LIMIT $2)
	`, query+"%", limit)
	if err != nil {
		http.Error(w, "query failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type suggestion struct {
		Text   string `json:"text"`
		Source string `json:"source"`
	}
	var suggestions []suggestion
	for rows.Next() {
		var sg suggestion
		if err := rows.Scan(&sg.Text, &sg.Source); err != nil {
			continue
		}
		suggestions = append(suggestions, sg)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"suggestions": suggestions})
}

func (s *libraryServer) handleToc(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 32)
	if err != nil {
		http.Error(w, "invalid document id", http.StatusBadRequest)
		return
	}

	maxDepthStr := r.URL.Query().Get("maxDepth")
	var maxDepth int32
	if maxDepthStr != "" {
		md, _ := strconv.ParseInt(maxDepthStr, 10, 32)
		maxDepth = int32(md)
	}

	resp, err := s.GetDocumentToc(r.Context(), &pb.TocRequest{
		DocumentId: int32(id),
		MaxDepth:   maxDepth,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *libraryServer) handleNode(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 32)
	if err != nil {
		http.Error(w, "invalid node id", http.StatusBadRequest)
		return
	}

	maxChildStr := r.URL.Query().Get("maxChildren")
	var maxChildren int32
	if maxChildStr != "" {
		mc, _ := strconv.ParseInt(maxChildStr, 10, 32)
		maxChildren = int32(mc)
	}

	resp, err := s.GetNodeContext(r.Context(), &pb.NodeContextRequest{
		NodeId:          int32(id),
		IncludeChildren: true,
		IncludeChunks:   true,
		MaxChildren:     maxChildren,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (s *libraryServer) handleCitation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Citation     string `json:"citation"`
		Jurisdiction string `json:"jurisdiction"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	resp, err := s.ResolveCitation(r.Context(), &pb.CitationRequest{
		Citation:     req.Citation,
		Jurisdiction: req.Jurisdiction,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ── Proto Conversion ──────────────────────────────────────────────────────

func hitToProto(h *libraryHit) *pb.LibraryHit {
	return &pb.LibraryHit{
		ChunkId:          h.ChunkID,
		DocumentId:       h.DocumentID,
		NodeId:           h.NodeID,
		Title:            h.Title,
		CorpusType:       h.CorpusType,
		SourceType:       h.SourceType,
		IsOfficial:       h.IsOfficial,
		OfficialUrl:      h.OfficialURL,
		Heading:          h.Heading,
		CitationLabel:    h.CitationLabel,
		NodePath:         h.NodePath,
		NodeType:         h.NodeType,
		Snippet:          h.Snippet,
		PageStart:        int32(h.PageStart),
		PageEnd:          int32(h.PageEnd),
		Score:            float32(h.Score),
		MatchType:        h.MatchType,
		SourceConfidence: h.SourceConfidence,
		Jurisdiction: &pb.Jurisdiction{
			Code: h.JurisdictionCode,
			Name: h.JurisdictionName,
		},
	}
}

// ── Utilities ─────────────────────────────────────────────────────────────

func float32SliceToVectorString(v []float32) string {
	parts := make([]string, len(v))
	for i, f := range v {
		parts[i] = fmt.Sprintf("%f", f)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func strVal(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
		return fmt.Sprintf("%v", v)
	}
	return ""
}

// qdrantStr extracts a string from Qdrant's typed payload value.
func qdrantStr(payload map[string]*qdrantclient.Value, key string) string {
	if v, ok := payload[key]; ok {
		if sv := v.GetStringValue(); sv != "" {
			return sv
		}
	}
	return ""
}

func floatVal(m map[string]any, key string) float32 {
	if v, ok := m[key]; ok {
		switch t := v.(type) {
		case float64:
			return float32(t)
		case int64:
			return float32(t)
		case int:
			return float32(t)
		}
	}
	return 0
}

func int32Val(m map[string]any, key string) int32 {
	if v, ok := m[key]; ok {
		switch t := v.(type) {
		case int:
			return int32(t)
		case int64:
			return int32(t)
		case float64:
			return int32(t)
		}
	}
	return 0
}

func strFromMap(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// ── Main ──────────────────────────────────────────────────────────────────

func main() {
	cfg := loadConfig()

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// PostgreSQL connection pool
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		log.Fatalf("PostgreSQL ping failed: %v", err)
	}
	log.Println("✅ PostgreSQL connected")

	// Redis (optional, non-fatal)
	var rdb *redis.Client
	opts, redisErr := redis.ParseURL(cfg.RedisURL)
	if redisErr == nil {
		rdb = redis.NewClient(opts)
		if rdb.Ping(ctx).Err() != nil {
			log.Println("⚠️  Redis not available — caching disabled")
			rdb = nil
		} else {
			log.Println("✅ Redis connected")
		}
	}

	// Qdrant native gRPC client (optional, falls back to REST)
	var qdClient *qdrantclient.Client
	qdClient, err = qdrantclient.NewClient(&qdrantclient.Config{
		Host: cfg.QdrantHost,
		Port: cfg.QdrantPort,
	})
	if err != nil {
		log.Printf("⚠️  Qdrant gRPC client failed (%s:%d): %v — using REST fallback",
			cfg.QdrantHost, cfg.QdrantPort, err)
		qdClient = nil
	} else {
		// Verify connection
		_, listErr := qdClient.ListCollections(ctx)
		if listErr != nil {
			log.Printf("⚠️  Qdrant gRPC connection check failed: %v — using REST fallback", listErr)
			qdClient.Close()
			qdClient = nil
		} else {
			log.Printf("✅ Qdrant connected (gRPC %s:%d)", cfg.QdrantHost, cfg.QdrantPort)
		}
	}

	// Shared HTTP client (for Ollama + Qdrant REST fallback)
	httpClient := &http.Client{
		Timeout: 15 * time.Second,
		Transport: &http.Transport{
			MaxIdleConns:        20,
			MaxIdleConnsPerHost: 10,
			IdleConnTimeout:     90 * time.Second,
			DisableKeepAlives:   false,
		},
	}

	srv := &libraryServer{
		cfg:        cfg,
		pool:       pool,
		rdb:        rdb,
		qdrant:     qdClient,
		httpClient: httpClient,
	}

	// HTTP server (for SvelteKit direct calls)
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", srv.handleHealth)
	mux.HandleFunc("POST /search", srv.handleSearch)
	mux.HandleFunc("GET /suggest", srv.handleSuggest)
	mux.HandleFunc("GET /toc/{id}", srv.handleToc)
	mux.HandleFunc("GET /node/{id}", srv.handleNode)
	mux.HandleFunc("POST /citation", srv.handleCitation)

	httpServer := &http.Server{Addr: ":" + cfg.HTTPPort, Handler: mux}

	go func() {
		log.Printf("🚀 HTTP listening on :%s", cfg.HTTPPort)
		if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	// gRPC server
	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Failed to listen on :%s: %v", cfg.GRPCPort, err)
	}

	grpcServer := grpc.NewServer(
		grpc.KeepaliveParams(keepalive.ServerParameters{
			Time:    10 * time.Second,
			Timeout: 5 * time.Second,
		}),
		grpc.KeepaliveEnforcementPolicy(keepalive.EnforcementPolicy{
			MinTime:             5 * time.Second,
			PermitWithoutStream: true,
		}),
		grpc.MaxRecvMsgSize(10*1024*1024),
		grpc.MaxSendMsgSize(10*1024*1024),
	)
	pb.RegisterLibrarySearchServiceServer(grpcServer, srv)
	reflection.Register(grpcServer)

	go func() {
		log.Printf("🚀 gRPC listening on :%s (LibrarySearchService registered)", cfg.GRPCPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC server error: %v", err)
		}
	}()

	log.Printf("🔍 Legal Library Search Service ready (HTTP :%s, gRPC :%s)", cfg.HTTPPort, cfg.GRPCPort)

	// Wait for shutdown
	<-ctx.Done()
	log.Println("Shutting down...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	grpcServer.GracefulStop()
	httpServer.Shutdown(shutdownCtx)
	if qdClient != nil {
		qdClient.Close()
	}
	log.Println("✅ Shutdown complete")
}
