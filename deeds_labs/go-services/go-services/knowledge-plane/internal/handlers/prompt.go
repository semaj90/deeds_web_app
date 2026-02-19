package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/services"
)

type ComposePromptRequest struct {
	ErrorID          int                    `json:"error_id"`
	FileContext      string                 `json:"file_context,omitempty"`
	RetrievedHits    []Hit                  `json:"retrieved_hits,omitempty"`
	GraphContext     map[string]interface{} `json:"graph_context,omitempty"`
}

type ComposePromptResponse struct {
	SystemPrompt string                 `json:"system_prompt"`
	Blocks       []PromptBlock          `json:"blocks"`
	Meta         map[string]interface{} `json:"meta"`
	Timestamp    time.Time              `json:"timestamp"`
}

type PromptBlock struct {
	Type    string `json:"type"` // "error"|"context"|"fix_example"|"constraints"
	Content string `json:"content"`
	Weight  float64 `json:"weight,omitempty"`
}

type Hit struct {
	ID     string                 `json:"id"`
	Score  float64                `json:"score"`
	Kind   string                 `json:"kind"`
	Source string                 `json:"source,omitempty"`
	Chunk  string                 `json:"chunk,omitempty"`
	Meta   map[string]interface{} `json:"meta,omitempty"`
}

func NewComposePromptHandler(
	pg *services.PostgresService,
	qdrant *services.QdrantService,
	redis *services.RedisService,
	cfg *config.Config,
) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}

		var req ComposePromptRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request: "+err.Error())
			return
		}

		// TODO: Implement ACE-style prompt pack assembly
		response := &ComposePromptResponse{
			SystemPrompt: "You are an expert TypeScript fixer. Use the provided context to fix syntax errors.",
			Blocks: []PromptBlock{
				{Type: "error", Content: "TS1005: ',' expected", Weight: 1.0},
				{Type: "context", Content: "Similar fixes from knowledge base", Weight: 0.8},
				{Type: "constraints", Content: "Preserve formatting and indentation", Weight: 0.6},
			},
			Meta: map[string]interface{}{
				"error_id": req.ErrorID,
				"blocks_count": 3,
			},
			Timestamp: time.Now(),
		}

		writeJSON(w, http.StatusOK, response)
	}
}

// ComposePrompt is a method on Handlers for routing compatibility
func (h *Handlers) ComposePrompt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ComposePromptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}

	// TODO: Implement ACE-style prompt pack assembly
	response := &ComposePromptResponse{
		SystemPrompt: "You are an expert TypeScript fixer. Use the provided context to fix syntax errors.",
		Blocks: []PromptBlock{
			{Type: "error", Content: "TS1005: ',' expected", Weight: 1.0},
			{Type: "context", Content: "Similar fixes from knowledge base", Weight: 0.8},
			{Type: "constraints", Content: "Preserve formatting and indentation", Weight: 0.6},
		},
		Meta: map[string]interface{}{
			"error_id": req.ErrorID,
			"blocks_count": 3,
		},
		Timestamp: time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
