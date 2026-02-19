package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"time"
)

// Retrieve handles RAG retrieval with hybrid search (pgvector + Qdrant)
func (h *Handlers) Retrieve(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		Query  string `json:"query"`
		TopK   int    `json:"top_k"`
		Mode   string `json:"mode"` // "pgvector", "qdrant", "hybrid"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	if req.TopK == 0 {
		req.TopK = h.cfg.RAGTopK
	}
	if req.Mode == "" {
		req.Mode = "hybrid"
	}

	start := time.Now()

	// Generate query embedding
	queryVec, err := h.getEmbeddingCached(ctx, req.Query)
	if err != nil {
		http.Error(w, fmt.Sprintf("Embedding failed: %v", err), http.StatusInternalServerError)
		return
	}

	var hits []map[string]interface{}
	sources := make(map[string]int)

	// Execute retrieval based on mode
	switch req.Mode {
	case "pgvector":
		pgHits, err := h.pg.FindSimilarErrors(ctx, queryVec, req.TopK)
		if err != nil {
			http.Error(w, fmt.Sprintf("pgvector search failed: %v", err), http.StatusInternalServerError)
			return
		}
		for _, hit := range pgHits {
			hits = append(hits, map[string]interface{}{
				"id":    fmt.Sprintf("%d", hit.ErrorID),
				"score": 1.0 / (1.0 + float64(hit.Distance)), // Convert distance to score
				"kind":  "ts_error",
				"source": hit.FilePath,
				"chunk": fmt.Sprintf("%s at line %d: %s", hit.Code, hit.Line, hit.Message),
				"meta": map[string]interface{}{
					"code":         hit.Code,
					"line":         hit.Line,
					"message":      hit.Message,
					"impact_score": hit.ImpactScore,
					"distance":     hit.Distance,
				},
			})
		}
		sources["pgvector"] = len(pgHits)

	case "qdrant":
		qHits, err := h.qdrant.Search(ctx, queryVec, req.TopK, nil)
		if err != nil {
			http.Error(w, fmt.Sprintf("Qdrant search failed: %v", err), http.StatusInternalServerError)
			return
		}
		for _, hit := range qHits {
			hits = append(hits, map[string]interface{}{
				"id":     hit.ID,
				"score":  hit.Score,
				"kind":   hit.Kind,
				"source": hit.Source,
				"chunk":  hit.Chunk,
				"meta":   hit.Meta,
			})
		}
		sources["qdrant"] = len(qHits)

	case "hybrid":
		// Parallel retrieval from both sources
		type pgResult struct {
			hits []map[string]interface{}
			err  error
		}
		type qdrantResult struct {
			hits []map[string]interface{}
			err  error
		}

		pgChan := make(chan pgResult, 1)
		qdrantChan := make(chan qdrantResult, 1)

		// pgvector search
		go func() {
			pgHits, err := h.pg.FindSimilarErrors(ctx, queryVec, req.TopK)
			result := pgResult{err: err}
			for _, hit := range pgHits {
				result.hits = append(result.hits, map[string]interface{}{
					"id":    fmt.Sprintf("%d", hit.ErrorID),
					"score": 1.0 / (1.0 + float64(hit.Distance)),
					"kind":  "ts_error",
					"source": hit.FilePath,
					"chunk": fmt.Sprintf("%s at line %d: %s", hit.Code, hit.Line, hit.Message),
					"meta": map[string]interface{}{
						"code":         hit.Code,
						"line":         hit.Line,
						"message":      hit.Message,
						"impact_score": hit.ImpactScore,
						"distance":     hit.Distance,
					},
				})
			}
			pgChan <- result
		}()

		// Qdrant search
		go func() {
			qHits, err := h.qdrant.Search(ctx, queryVec, req.TopK, nil)
			result := qdrantResult{err: err}
			for _, hit := range qHits {
				result.hits = append(result.hits, map[string]interface{}{
					"id":     hit.ID,
					"score":  hit.Score,
					"kind":   hit.Kind,
					"source": hit.Source,
					"chunk":  hit.Chunk,
					"meta":   hit.Meta,
				})
			}
			qdrantChan <- result
		}()

		// Wait for both
		pgRes := <-pgChan
		qdrantRes := <-qdrantChan

		if pgRes.err != nil {
			http.Error(w, fmt.Sprintf("pgvector search failed: %v", pgRes.err), http.StatusInternalServerError)
			return
		}
		if qdrantRes.err != nil {
			http.Error(w, fmt.Sprintf("Qdrant search failed: %v", qdrantRes.err), http.StatusInternalServerError)
			return
		}

		// Merge with inverse rank fusion
		hits = h.hybridMerge(pgRes.hits, qdrantRes.hits, req.TopK)
		sources["pgvector"] = len(pgRes.hits)
		sources["qdrant"] = len(qdrantRes.hits)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"hits":       hits,
		"sources":    sources,
		"latency_ms": time.Since(start).Milliseconds(),
	})
}

// hybridMerge performs inverse rank fusion on two hit lists
func (h *Handlers) hybridMerge(pgHits, qdrantHits []map[string]interface{}, topK int) []map[string]interface{} {
	const k = 60 // RRF constant

	scores := make(map[string]float64)
	hitMap := make(map[string]map[string]interface{})

	// Score from pgvector
	for rank, hit := range pgHits {
		id := hit["id"].(string)
		rrf := 1.0 / float64(k+rank)
		scores[id] = h.cfg.HybridWeightPG * rrf
		hitMap[id] = hit
	}

	// Score from Qdrant
	for rank, hit := range qdrantHits {
		id := hit["id"].(string)
		rrf := 1.0 / float64(k+rank)
		if existingScore, exists := scores[id]; exists {
			scores[id] = existingScore + h.cfg.HybridWeightQdrant*rrf
		} else {
			scores[id] = h.cfg.HybridWeightQdrant * rrf
			hitMap[id] = hit
		}
	}

	// Sort by combined score
	type scoredHit struct {
		id    string
		score float64
		hit   map[string]interface{}
	}
	scored := make([]scoredHit, 0, len(scores))
	for id, score := range scores {
		scored = append(scored, scoredHit{
			id:    id,
			score: score,
			hit:   hitMap[id],
		})
	}

	sort.Slice(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	// Return top K
	result := make([]map[string]interface{}, 0, topK)
	for i := 0; i < len(scored) && i < topK; i++ {
		hit := scored[i].hit
		hit["score"] = scored[i].score // Update with hybrid score
		result = append(result, hit)
	}

	return result
}

// getEmbeddingCached retrieves embedding with Redis caching
func (h *Handlers) getEmbeddingCached(ctx context.Context, text string) ([]float32, error) {
	// Try cache
	cached, found, err := h.redis.GetEmbedding(ctx, text)
	if err == nil && found {
		h.redis.IncrCacheHits(ctx)
		return cached, nil
	}

	h.redis.IncrCacheMisses(ctx)

	// Generate
	embedding, err := h.ollama.GenerateEmbedding(ctx, text)
	if err != nil {
		return nil, err
	}

	// Cache
	h.redis.SetEmbedding(ctx, text, embedding)

	return embedding, nil
}
