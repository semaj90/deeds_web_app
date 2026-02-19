package handlers

import (
	"context"
	"net/http"
	"time"

	jsoniter "github.com/json-iterator/go"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/services"
)

// SIMD-optimized JSON (reused from error-parser pattern)
var jsonSIMD = jsoniter.ConfigCompatibleWithStandardLibrary

type HealthResponse struct {
	Status    string                 `json:"status"`
	Timestamp time.Time              `json:"timestamp"`
	Services  map[string]string      `json:"services"`
	DBIdentity *services.DBIdentity  `json:"db_identity,omitempty"`
	Config    map[string]interface{} `json:"config"`
}

func NewHealthHandler(
	pg *services.PostgresService,
	redis *services.RedisService,
	qdrant *services.QdrantService,
	cfg *config.Config,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		response := &HealthResponse{
			Status:    "ok",
			Timestamp: time.Now(),
			Services:  make(map[string]string),
			Config: map[string]interface{}{
				"qdrant_collection": cfg.QdrantCollection,
				"rag_top_k":         cfg.RAGTopK,
				"cache_ttls": map[string]int{
					"embedding_sec":  cfg.CacheEmbeddingTTL,
					"retrieval_sec":  cfg.CacheRetrievalTTL,
					"context_sec":    cfg.CacheContextTTL,
				},
			},
		}

		// Check PostgreSQL + get DB identity (prevents wrong-DB issues)
		if identity, err := pg.GetDBIdentity(ctx); err == nil {
			response.Services["postgres"] = "connected"
			response.DBIdentity = identity
		} else {
			response.Services["postgres"] = "disconnected: " + err.Error()
			response.Status = "degraded"
		}

		// Check Redis
		if err := redis.Ping(ctx); err == nil {
			response.Services["redis"] = "connected"
		} else {
			response.Services["redis"] = "disconnected: " + err.Error()
			response.Status = "degraded"
		}

		// Check Qdrant
		if err := qdrant.Ping(ctx); err == nil {
			response.Services["qdrant"] = "connected"
		} else {
			response.Services["qdrant"] = "disconnected: " + err.Error()
			response.Status = "degraded"
		}

		// Use SIMD JSON for faster encoding (error-parser pattern)
		w.Header().Set("Content-Type", "application/json")
		if response.Status == "ok" {
			w.WriteHeader(http.StatusOK)
		} else {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		jsonSIMD.NewEncoder(w).Encode(response)
	}
}

// Helper to write JSON responses with SIMD encoder
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	jsonSIMD.NewEncoder(w).Encode(data)
}

// Helper to write JSON errors
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// Helper to decode JSON with SIMD decoder
func decodeJSON(r *http.Request, v interface{}) error {
	return jsonSIMD.NewDecoder(r.Body).Decode(v)
}
