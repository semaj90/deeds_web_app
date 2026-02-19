package api

import (
	"encoding/json"
	"net/http"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/infra/compat"
)

// Handler contains dependencies for API handlers
type Handler struct {
	cfg   *compat.Config
	log   *compat.Logger
	redis *compat.RedisClient
	db    *compat.PostgresClient
}

// New creates a new API handler
func New(cfg *compat.Config, log *compat.Logger, redis *compat.RedisClient, db *compat.PostgresClient) *Handler {
	return &Handler{
		cfg:   cfg,
		log:   log,
		redis: redis,
		db:    db,
	}
}

// Routes sets up the HTTP routes
func Routes(h *Handler) http.Handler {
	mux := http.NewServeMux()

	// Health endpoint
	mux.HandleFunc("/health", h.handleHealth)

	// RAG endpoints
	mux.HandleFunc("/retrieve", h.handleRetrieve)

	// Prompt composition
	mux.HandleFunc("/compose_prompt", h.handleComposePrompt)

	// Run logging
	mux.HandleFunc("/runs", h.handleRuns)

	// Svelte 5 documentation search (for Gemma3 tool calls)
	mux.HandleFunc("/svelte/docs", h.handleSvelteDocs)

	// Agentic error visualization
	mux.HandleFunc("/visualize/error-map", h.handleErrorVisualization)

	return mux
}

// handleHealth returns database identity and service status
func (h *Handler) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Get database identity - this ensures we're never on the wrong DB
	dbHealth, err := h.db.Health(ctx)
	if err != nil {
		h.log.Error("health check failed", "error", err)
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unhealthy",
			"error":  err.Error(),
		})
		return
	}

	response := map[string]interface{}{
		"status":   "ok",
		"database": dbHealth,
		"service":  "knowledge-plane",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// handleRetrieve handles RAG retrieval (hybrid: pgvector + Qdrant)
func (h *Handler) handleRetrieve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// TODO: Implement hybrid retrieval
	// 1. Generate embedding via Ollama
	// 2. Query pgvector HNSW
	// 3. Query Qdrant
	// 4. RRF merge
	// 5. Return ranked contexts

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "not_implemented",
		"message": "Retrieval endpoint will be implemented after discovery",
	})
}

// handleComposePrompt assembles a prompt pack for the fixer
func (h *Handler) handleComposePrompt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// TODO: Implement prompt composition
	// Input: error row + file snippet + retrieved contexts + graph neighborhood
	// Output: ACE-style prompt pack (system, tools, constraints, diff hints)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "not_implemented",
		"message": "Prompt composition will be implemented after discovery",
	})
}

// handleRuns logs fix attempts and outcomes
func (h *Handler) handleRuns(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// TODO: Implement run logging
	// Store: prompt hash, retrieved IDs, diff, validation metrics, outcome
	// Append to jsonl + upsert to Qdrant as ace_llm_output

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "not_implemented",
		"message": "Run logging will be implemented after discovery",
	})
}
