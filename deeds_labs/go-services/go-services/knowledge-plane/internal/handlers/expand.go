package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/config"
	"github.com/semaj90/mau5law/go-services/knowledge-plane/internal/services"
)

type ExpandRequest struct {
	SeedIDs   []string `json:"seed_ids"`
	Depth     int      `json:"depth"`
	EdgeTypes []string `json:"edge_types,omitempty"`
	Limit     int      `json:"limit"`
}

type ExpandResponse struct {
	Nodes     []Node    `json:"nodes"`
	Edges     []Edge    `json:"edges"`
	Timestamp time.Time `json:"timestamp"`
}

type Node struct {
	ID   string `json:"id"`
	Type string `json:"type"`
	Name string `json:"name"`
}

type Edge struct {
	From string  `json:"from"`
	To   string  `json:"to"`
	Type string  `json:"type"`
	Weight float64 `json:"weight,omitempty"`
}

func NewExpandHandler(couchdb *services.CouchDBService, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "Method not allowed")
			return
		}

		var req ExpandRequest
		if err := decodeJSON(r, &req); err != nil {
			writeError(w, http.StatusBadRequest, "Invalid request: "+err.Error())
			return
		}

		// Default values
		if req.Depth == 0 {
			req.Depth = cfg.KAGDepth
		}
		if req.Limit == 0 {
			req.Limit = cfg.KAGLimit
		}

		// TODO: Implement KAG graph expansion (CouchDB edges view or Neo4j)
		response := &ExpandResponse{
			Nodes: []Node{
				{ID: "stub_file_1", Type: "file", Name: "gpu-leftover-cache.ts"},
			},
			Edges: []Edge{
				{From: "stub_error_1", To: "stub_file_1", Type: "OCCURS_IN", Weight: 1.0},
			},
			Timestamp: time.Now(),
		}

		writeJSON(w, http.StatusOK, response)
	}
}

// Expand is a method on Handlers for routing compatibility
func (h *Handlers) Expand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ExpandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Default values
	if req.Depth == 0 {
		req.Depth = h.cfg.KAGDepth
	}
	if req.Limit == 0 {
		req.Limit = h.cfg.KAGLimit
	}

	// TODO: Implement KAG graph expansion (CouchDB edges view or Neo4j)
	response := &ExpandResponse{
		Nodes: []Node{
			{ID: "stub_file_1", Type: "file", Name: "gpu-leftover-cache.ts"},
		},
		Edges: []Edge{
			{From: "stub_error_1", To: "stub_file_1", Type: "OCCURS_IN", Weight: 1.0},
		},
		Timestamp: time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
