package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/services"
)

type Handlers struct {
	cfg      *config.Config
	pg       *services.PostgresService
	redis    *services.RedisService
	ollama   *services.OllamaService
	qdrant   *services.QdrantService
	couchdb  *services.CouchDBService
}

func New(
	cfg *config.Config,
	pg *services.PostgresService,
	redis *services.RedisService,
	ollama *services.OllamaService,
	qdrant *services.QdrantService,
	couchdb *services.CouchDBService,
) *Handlers {
	return &Handlers{
		cfg:     cfg,
		pg:      pg,
		redis:   redis,
		ollama:  ollama,
		qdrant:  qdrant,
		couchdb: couchdb,
	}
}

// Health returns service status
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	response := map[string]interface{}{
		"status": "ok",
		"services": map[string]string{
			"postgres": "checking",
			"qdrant":   "checking",
			"redis":    "checking",
			"ollama":   "checking",
		},
	}

	// Check PostgreSQL
	identity, err := h.pg.GetDBIdentity(ctx)
	if err == nil {
		response["services"].(map[string]string)["postgres"] = "connected"
		response["db_identity"] = identity
	} else {
		response["services"].(map[string]string)["postgres"] = fmt.Sprintf("error: %v", err)
		response["status"] = "degraded"
	}

	// Check Qdrant
	if _, err := h.qdrant.GetCollection(ctx); err == nil {
		response["services"].(map[string]string)["qdrant"] = "connected"
	} else {
		response["services"].(map[string]string)["qdrant"] = fmt.Sprintf("error: %v", err)
		response["status"] = "degraded"
	}

	// Check Redis
	if err := h.redis.Ping(ctx); err == nil {
		response["services"].(map[string]string)["redis"] = "connected"
	} else {
		response["services"].(map[string]string)["redis"] = fmt.Sprintf("error: %v", err)
		response["status"] = "degraded"
	}

	// Ollama (lightweight check)
	response["services"].(map[string]string)["ollama"] = "assumed_connected"

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// Embed generates an embedding vector (with Redis caching)
func (h *Handlers) Embed(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	start := time.Now()

	// Try cache first
	cached, found, err := h.redis.GetEmbedding(ctx, req.Text)
	if err == nil && found {
		h.redis.IncrCacheHits(ctx)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"dim":        len(cached),
			"vector":     cached,
			"cached":     true,
			"latency_ms": time.Since(start).Milliseconds(),
		})
		return
	}

	h.redis.IncrCacheMisses(ctx)

	// Generate embedding
	embedding, err := h.ollama.GenerateEmbedding(ctx, req.Text)
	if err != nil {
		http.Error(w, fmt.Sprintf("Embedding generation failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Cache result
	h.redis.SetEmbedding(ctx, req.Text, embedding)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"dim":        len(embedding),
		"vector":     embedding,
		"cached":     false,
		"latency_ms": time.Since(start).Milliseconds(),
	})
}
