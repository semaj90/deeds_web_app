package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// ContextChatRequest from SvelteKit
type ContextChatRequest struct {
	CaseID string `json:"case_id"`
	UserID string `json:"user_id"`
	Query  string `json:"message"`
	TopK   int    `json:"top_k"`
}

// ContextChatResponse to SvelteKit
type ContextChatResponse struct {
	Answer      string                   `json:"answer"`
	DidYouMean  DidYouMeanData           `json:"did_you_mean"`
	Citations   []Citation               `json:"citations"`
	LatencyMs   int64                    `json:"latency_ms"`
	RAGContext  RAGContextData           `json:"rag_context"`
	KAGContext  KAGContextData           `json:"kag_context"`
}

type DidYouMeanData struct {
	QueryEmbeddingSource string        `json:"query_embedding_source"`
	Suggestions          []Suggestion  `json:"suggestions"`
}

type Suggestion struct {
	Query  string  `json:"query"`
	Reason string  `json:"reason"`
	Score  float64 `json:"score"`
}

type Citation struct {
	EvidenceID string `json:"evidence_id"`
	ChunkID    string `json:"chunk_id"`
}

type RAGContextData struct {
	Collection string      `json:"collection"`
	TopK       int         `json:"top_k"`
	Results    []RAGResult `json:"results"`
}

type RAGResult struct {
	EvidenceID string  `json:"evidence_id"`
	ChunkID    string  `json:"chunk_id"`
	Score      float64 `json:"score"`
	Text       string  `json:"text"`
}

type KAGContextData struct {
	Facts []KAGFact `json:"facts"`
}

type KAGFact struct {
	NodeID   string `json:"node_id"`
	Label    string `json:"label"`
	Relation string `json:"relation"`
	TargetID string `json:"target_id"`
}

var (
	ragKagServiceAddr = os.Getenv("RAG_KAG_SERVICE_ADDR")
	gemmaEndpoint     = os.Getenv("GEMMA_ENDPOINT")
	postgresURL       = os.Getenv("DATABASE_URL")
)

func init() {
	if ragKagServiceAddr == "" {
		ragKagServiceAddr = "localhost:50061"
	}
	if gemmaEndpoint == "" {
		gemmaEndpoint = "http://localhost:11434"
	}
}

func main() {
	http.HandleFunc("/v1/context-chat", handleContextChat)
	http.HandleFunc("/health", handleHealth)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8085"
	}

	log.Printf("🚀 YoRHa Context Orchestrator listening on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("❌ Server error: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleContextChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	startTime := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var req ContextChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("📨 Context chat request: %s (case: %s)", req.Query[:min(50, len(req.Query))], req.CaseID)

	// 1. Connect to RAG/KAG service
	conn, err := grpc.Dial(ragKagServiceAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Printf("❌ gRPC connection failed: %v", err)
		http.Error(w, "RAG/KAG service unavailable", http.StatusServiceUnavailable)
		return
	}
	defer conn.Close()

	// 2. Call RAG/KAG service (placeholder - implement actual gRPC call)
	ragContext := RAGContextData{
		Collection: "phase_rag_evidence",
		TopK:       req.TopK,
		Results:    []RAGResult{},
	}

	kagContext := KAGContextData{
		Facts: []KAGFact{},
	}

	// 3. Call Gemma LLM with context
	answer, citations := callGemmaWithContext(ctx, req.Query, ragContext, kagContext)

	// 4. Compute "did you mean" suggestions
	suggestions := computeDidYouMean(ctx, req.Query)

	// 5. Build response
	latency := time.Since(startTime).Milliseconds()
	resp := ContextChatResponse{
		Answer: answer,
		DidYouMean: DidYouMeanData{
			QueryEmbeddingSource: "embeddinggemma:latest",
			Suggestions:          suggestions,
		},
		Citations:  citations,
		LatencyMs:  latency,
		RAGContext: ragContext,
		KAGContext: kagContext,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
	log.Printf("✅ Context chat response: %dms", latency)
}

func callGemmaWithContext(ctx context.Context, query string, rag RAGContextData, kag KAGContextData) (string, []Citation) {
	// Build prompt with context
	prompt := fmt.Sprintf(`You are a legal AI assistant analyzing evidence and case information.

Query: %s

Evidence Context:
%s

Case Facts:
%s

Provide a concise, legally accurate response with citations.`, query, formatRAGContext(rag), formatKAGContext(kag))

	// Call Gemma (via Ollama or TensorRT)
	// This is a placeholder - implement actual LLM call
	answer := "Based on the provided evidence and case facts, " + query

	citations := []Citation{}
	for _, result := range rag.Results {
		citations = append(citations, Citation{
			EvidenceID: result.EvidenceID,
			ChunkID:    result.ChunkID,
		})
	}

	return answer, citations
}

func computeDidYouMean(ctx context.Context, query string) []Suggestion {
	// Placeholder: compute suggestions based on past queries
	// In production, query PostgreSQL for similar past queries
	return []Suggestion{
		{
			Query:  "timeline of events",
			Reason: "similar past successful query",
			Score:  0.91,
		},
	}
}

func formatRAGContext(rag RAGContextData) string {
	if len(rag.Results) == 0 {
		return "No evidence retrieved"
	}
	result := ""
	for i, r := range rag.Results {
		result += fmt.Sprintf("%d. [%s] (score: %.2f) %s\n", i+1, r.EvidenceID, r.Score, r.Text[:min(100, len(r.Text))])
	}
	return result
}

func formatKAGContext(kag KAGContextData) string {
	if len(kag.Facts) == 0 {
		return "No graph facts retrieved"
	}
	result := ""
	for i, f := range kag.Facts {
		result += fmt.Sprintf("%d. %s -%s-> %s\n", i+1, f.NodeID, f.Relation, f.TargetID)
	}
	return result
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
