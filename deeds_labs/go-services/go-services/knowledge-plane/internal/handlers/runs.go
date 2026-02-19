package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/services"
)

type RunRequest struct {
	RunID         string                 `json:"run_id"`
	File          string                 `json:"file"`
	Diff          string                 `json:"diff"`
	PreErrors     int                    `json:"pre_errors"`
	PostErrors    int                    `json:"post_errors"`
	Outcome       string                 `json:"outcome"` // "success"|"failure"
	PromptHash    string                 `json:"prompt_hash,omitempty"`
	RetrievedIDs  []string               `json:"retrieved_ids,omitempty"`
	ValidationMS  int64                  `json:"validation_ms,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

type RunResponse struct {
	Success       bool      `json:"success"`
	CouchDBID     string    `json:"couchdb_id,omitempty"`
	QdrantID      string    `json:"qdrant_id,omitempty"`
	JSONLPath     string    `json:"jsonl_path"`
	Timestamp     time.Time `json:"timestamp"`
}

func NewRunsHandler(
	couchdb *services.CouchDBService,
	qdrant *services.QdrantService,
	cfg *config.Config,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}

		var req RunRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request: "+err.Error())
			return
		}

		// TODO: Implement run logging (JSONL + CouchDB + Qdrant ingestion)
		response := &RunResponse{
			Success:   true,
			JSONLPath: "reports/phase87/runs/phase87_runs.jsonl",
			Timestamp: time.Now(),
		}

		writeJSON(w, http.StatusOK, response)
	}
}

// IngestRun is a method on Handlers for routing compatibility
func (h *Handlers) IngestRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RunRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}

	// TODO: Implement run logging (JSONL + CouchDB + Qdrant ingestion)
	response := &RunResponse{
		Success:   true,
		JSONLPath: "reports/phase87/runs/phase87_runs.jsonl",
		Timestamp: time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
