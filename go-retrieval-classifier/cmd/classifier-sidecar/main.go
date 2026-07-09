package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"retrieval-classifier/internal/classifier"
	"retrieval-classifier/internal/hybrid"
	"time"
)

var (
	port            = flag.String("port", "8095", "HTTP server port")
	classifierPath  = flag.String("model", "classifier-models/xgboost-lane-classifier.json", "Path to XGBoost model JSON")
	metadataPath    = flag.String("metadata", "classifier-models/xgboost-metadata.json", "Path to model metadata")
	qdrantURL       = flag.String("qdrant", "http://127.0.0.1:6333", "Qdrant vector DB URL")
	postgresURL     = flag.String("postgres", "postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db", "PostgreSQL connection URL")
	logLevel        = flag.String("log", "info", "Log level (debug, info, warn, error)")
)

// PredictRequest is the classifier input
type PredictRequest struct {
	PacketKey    string    `json:"packet_key"`
	Features     []float32 `json:"features"` // [pagerank, som_row, som_col, community_id, days_old, has_content_vec, has_summary_vec, has_keyword_vec, graph_degree, bm25_score]
	QueryText    string    `json:"query_text,omitempty"`
	CaseID       string    `json:"case_id,omitempty"`
	TopK         int       `json:"top_k,omitempty"` // Number of results (default 10)
	HybridMode   string    `json:"hybrid_mode,omitempty"` // "dense", "sparse", "hybrid" (default "hybrid")
	IncludeTrace bool      `json:"include_trace,omitempty"` // Include execution trace
}

// PredictResponse is the classifier output
type PredictResponse struct {
	PacketKey       string                 `json:"packet_key"`
	Lane            string                 `json:"lane"` // qdrant-dense, neo4j-authority, som-topology, bm25-fallback
	Confidence      float32                `json:"confidence"`
	Candidates      []hybrid.SearchResult  `json:"candidates,omitempty"`
	Score           float32                `json:"score"`
	ExecutionTimeMs int64                  `json:"execution_time_ms"`
	Trace           map[string]interface{} `json:"trace,omitempty"`
}

func main() {
	flag.Parse()

	// Load classifier
	clf, err := classifier.LoadFromJSON(*classifierPath, *metadataPath)
	if err != nil {
		log.Fatalf("Failed to load classifier: %v", err)
	}
	log.Printf("Loaded classifier: %d features, %d classes", clf.NumFeatures(), clf.NumClasses())
	log.Printf("Classes: %v", clf.Classes())

	// Initialize hybrid search
	hs, err := hybrid.NewHybridSearcher(
		*qdrantURL,
		*postgresURL,
		*logLevel,
	)
	if err != nil {
		log.Fatalf("Failed to initialize hybrid search: %v", err)
	}
	defer hs.Close()
	log.Printf("Initialized hybrid search: Qdrant=%s, Postgres=%s", *qdrantURL, *postgresURL)

	// Setup HTTP handlers
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "ok",
			"classifier": "loaded",
		})
	})

	// Initialize fallback rules
	rules := classifier.NewFallbackRules()

	// [1] POST /predict-lane (ADVISORY ONLY — XGBoost lane recommendation)
	mux.HandleFunc("/predict-lane", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req PredictRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
			return
		}

		start := time.Now()

		// Validate input
		if len(req.Features) != clf.NumFeatures() {
			http.Error(w, fmt.Sprintf("Expected %d features, got %d", clf.NumFeatures(), len(req.Features)), http.StatusBadRequest)
			return
		}

		// Predict lane using classifier
		laneIdx, confidence := clf.Predict(req.Features)
		classifierLane := clf.Classes()[laneIdx]

		// Build feature map for fallback rules
		featureMap := map[string]float32{
			"pagerank":           req.Features[0],
			"som_row":            req.Features[1],
			"som_col":            req.Features[2],
			"community_id":       req.Features[3],
			"days_old":           req.Features[4],
			"has_content_vec":    req.Features[5],
			"has_summary_vec":    req.Features[6],
			"has_keyword_vec":    req.Features[7],
			"graph_degree":       req.Features[8],
			"bm25_score":         req.Features[9],
		}

		// Apply fallback rules (validation gate)
		decision := rules.ApplyFallback(classifierLane, confidence, featureMap)
		lane := decision.Lane

		duration := time.Since(start).Milliseconds()

		resp := map[string]interface{}{
			"lane":               lane,
			"confidence":         confidence,
			"reason":             decision.Reason,
			"execution_time_ms":  duration,
		}

		if req.IncludeTrace {
			resp["classifier_predicted"] = classifierLane
			resp["fallback_applied"] = decision.UsedFallback
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// [2] POST /search-hybrid (Execute hybrid search: Qdrant + BM25 + Neo4j)
	mux.HandleFunc("/search-hybrid", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			QueryText    string `json:"query_text"`
			Lane         string `json:"lane"`
			TopK         int    `json:"top_k"`
			IncludeTrace bool   `json:"include_trace"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
			return
		}

		topK := req.TopK
		if topK == 0 {
			topK = 50
		}

		// Execute parallel hybrid search
		candidates, err := hs.Search(&hybrid.SearchRequest{
			QueryText:    req.QueryText,
			Mode:         "hybrid",
			Lane:         req.Lane,
			TopK:         topK,
			IncludeTrace: req.IncludeTrace,
		})
		if err != nil {
			http.Error(w, fmt.Sprintf("Search failed: %v", err), http.StatusInternalServerError)
			return
		}

		resp := map[string]interface{}{
			"candidates": candidates,
			"count":      len(candidates),
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// [3] POST /search-rerank (RRF fusion ranking — PRODUCTION AUTHORITY)
	mux.HandleFunc("/search-rerank", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Candidates []map[string]interface{} `json:"candidates"`
			Weights    map[string]float32       `json:"weights"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
			return
		}

		// Set default weights if not provided
		weights := req.Weights
		if weights == nil {
			weights = map[string]float32{
				"dense":  0.6,
				"sparse": 0.4,
				"graph":  0.05,
			}
		}

		// RRF fusion: rank candidates
		type rankedCandidate struct {
			ID       string  `json:"id"`
			RrfScore float32 `json:"rrf_score"`
			Rank     int     `json:"rank"`
		}

		ranked := make([]rankedCandidate, 0, len(req.Candidates))
		for i, cand := range req.Candidates {
			rrfScore := float32(0.0)

			// Unpack ranks from candidate
			if rankDense, ok := cand["rank_dense"].(float64); ok {
				rrfScore += weights["dense"] / (60 + float32(rankDense))
			}
			if rankSparse, ok := cand["rank_sparse"].(float64); ok {
				rrfScore += weights["sparse"] / (60 + float32(rankSparse))
			}
			if rankGraph, ok := cand["rank_graph"].(float64); ok && rankGraph > 0 {
				rrfScore += weights["graph"] / (60 + float32(rankGraph))
			}

			id := cand["id"].(string)
			ranked = append(ranked, rankedCandidate{ID: id, RrfScore: rrfScore, Rank: i + 1})
		}

		resp := map[string]interface{}{
			"ranked": ranked,
			"top_k":  5,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// [4] POST /packet/materialize (Build ACE packet envelope from ranked results)
	mux.HandleFunc("/packet/materialize", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			PacketKeys         []string `json:"packet_keys"`
			IncludeEmbeddings  bool     `json:"include_embeddings"`
			IncludeTopology    bool     `json:"include_topology"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
			return
		}

		// Materialize packets from Postgres (canonical truth)
		// This is a placeholder — real implementation reads from Postgres
		resp := map[string]interface{}{
			"packets": []map[string]interface{}{},
			"count":   0,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// [5] POST /packet/validate (HMM state validation gate)
	mux.HandleFunc("/packet/validate", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			PacketKey         string `json:"packet_key"`
			PredictedLane     string `json:"predicted_lane"`
			CheckIdentity     bool   `json:"check_identity"`
			CheckPrerequisites bool  `json:"check_prerequisites"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
			return
		}

		// Validate lane against packet state (placeholder)
		// Real implementation checks HMM state, identity lane, prerequisite signals
		resp := map[string]interface{}{
			"valid":                 true,
			"lane":                  req.PredictedLane,
			"identity_state":        "canonical",
			"identity_confidence":   1.0,
			"prerequisite_checks":   map[string]bool{},
			"reason":                "placeholder validation",
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// [LEGACY] /lanes endpoint (for compatibility)
	mux.HandleFunc("/lanes", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"classes":     clf.Classes(),
			"num_classes": clf.NumClasses(),
		})
	})

	// Start server
	addr := ":" + *port
	log.Printf("Starting classifier sidecar on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
