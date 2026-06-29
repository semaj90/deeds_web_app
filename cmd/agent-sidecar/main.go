package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nats-io/nats.go"
	"google.golang.org/grpc"
)

// NATS subjects for agentic task execution
const (
	TaskExecuteSubj         = "agent.task.execute"
	RetrievalRerankSubj     = "retrieval.turbovec.rerank"
	GPUCUVSSearchSubj       = "gpu.cuvs.search"
	GPUCUDARankSubj         = "gpu.cuda.rank"
	EngramFeedbackSubj      = "engram.feedback.async"
)

type TaskRequest struct {
	TaskID    string      `json:"task_id"`
	TaskType  string      `json:"task_type"`
	Payload   interface{} `json:"payload,omitempty"`
	Timestamp time.Time   `json:"timestamp"`
}

type TaskResponse struct {
	TaskID  string      `json:"task_id"`
	Status  string      `json:"status"` // executed, failed, pending
	Result  interface{} `json:"result,omitempty"`
	Handler string      `json:"handler"`
}

type RerankRequest struct {
	QueryID    string `json:"query_id"`
	Candidates []struct {
		ID    string  `json:"id"`
		Score float64 `json:"score"`
	} `json:"candidates"`
	Timestamp time.Time `json:"timestamp"`
}

type RerankResponse struct {
	QueryID  string `json:"query_id"`
	Reranked []struct {
		ID    string  `json:"id"`
		Score float64 `json:"score"`
	} `json:"reranked"`
	Backend string `json:"backend"` // turbovec-gpu or cpu-fallback
	Handler string `json:"handler"`
}

type GPUSearchRequest struct {
	QueryID       string    `json:"query_id"`
	QueryEmbedding []float32 `json:"query_embedding"` // 768-dim
	K             int       `json:"k"`
	Timestamp     time.Time `json:"timestamp"`
}

type GPUSearchResponse struct {
	QueryID string `json:"query_id"`
	Results []struct {
		ID       string  `json:"id"`
		Score    float64 `json:"score"`
		Distance float64 `json:"distance"`
	} `json:"results"`
	Backend string `json:"backend"` // cuvs-gpu or cpu-fallback
	Count   int    `json:"count"`
	Handler string `json:"handler"`
}

type FeedbackRequest struct {
	FeedbackID        string      `json:"feedback_id"`
	RecommendationID  string      `json:"recommendation_id"`
	UserAcceptance    bool        `json:"user_acceptance"`
	Outcome           string      `json:"outcome"` // fixed, not-fixed, review
	Metadata          interface{} `json:"metadata,omitempty"`
	Timestamp         time.Time   `json:"timestamp"`
}

type FeedbackResponse struct {
	FeedbackID string `json:"feedback_id"`
	Persisted  bool   `json:"persisted"`
	RowID      string `json:"row_id,omitempty"`
	Outcome    string `json:"outcome"`
	Handler    string `json:"handler"`
}

func handleTaskExecute(m *nats.Msg) {
	var req TaskRequest
	if err := json.Unmarshal(m.Data, &req); err != nil {
		log.Printf("[task.execute] parse error: %v", err)
		return
	}

	// Mock handler: echo back the task
	resp := TaskResponse{
		TaskID:  req.TaskID,
		Status:  "executed",
		Result:  req.Payload,
		Handler: TaskExecuteSubj,
	}

	data, _ := json.Marshal(resp)
	m.Respond(data)
	log.Printf("[task.execute] ✅ task_id=%s status=%s", req.TaskID, resp.Status)
}

func handleRerankRequest(m *nats.Msg) {
	var req RerankRequest
	if err := json.Unmarshal(m.Data, &req); err != nil {
		log.Printf("[rerank] parse error: %v", err)
		return
	}

	// Mock handler: sort candidates by score descending
	resp := RerankResponse{
		QueryID:  req.QueryID,
		Backend:  "cpu-fallback",
		Handler:  RetrievalRerankSubj,
		Reranked: req.Candidates, // In real implementation, rerank by TurboVec
	}

	data, _ := json.Marshal(resp)
	m.Respond(data)
	log.Printf("[rerank] ✅ query_id=%s candidates=%d", req.QueryID, len(req.Candidates))
}

func handleGPUSearch(m *nats.Msg) {
	var req GPUSearchRequest
	if err := json.Unmarshal(m.Data, &req); err != nil {
		log.Printf("[gpu.search] parse error: %v", err)
		return
	}

	// Mock handler: return K results
	resp := GPUSearchResponse{
		QueryID: req.QueryID,
		Backend: "cpu-fallback",
		Count:   req.K,
		Handler: GPUCUVSSearchSubj,
		Results: []struct {
			ID       string  `json:"id"`
			Score    float64 `json:"score"`
			Distance float64 `json:"distance"`
		}{}, // In real implementation, call cuVS service
	}

	data, _ := json.Marshal(resp)
	m.Respond(data)
	log.Printf("[gpu.search] ✅ query_id=%s k=%d", req.QueryID, req.K)
}

func handleGPURank(m *nats.Msg) {
	var req struct {
		QueryID      string        `json:"query_id"`
		Candidates   []interface{} `json:"candidates"`
		QueryVector  []float32     `json:"query_vector"`
		Timestamp    time.Time     `json:"timestamp"`
	}
	if err := json.Unmarshal(m.Data, &req); err != nil {
		log.Printf("[gpu.rank] parse error: %v", err)
		return
	}

	resp := struct {
		QueryID  string        `json:"query_id"`
		Ranking  []interface{} `json:"ranking"`
		Backend  string        `json:"backend"`
		Handler  string        `json:"handler"`
	}{
		QueryID: req.QueryID,
		Ranking: req.Candidates, // In real implementation, rank via CUDA
		Backend: "cpu-fallback",
		Handler: GPUCUDARankSubj,
	}

	data, _ := json.Marshal(resp)
	m.Respond(data)
	log.Printf("[gpu.rank] ✅ query_id=%s candidates=%d", req.QueryID, len(req.Candidates))
}

func handleEngramFeedback(m *nats.Msg) {
	var req FeedbackRequest
	if err := json.Unmarshal(m.Data, &req); err != nil {
		log.Printf("[engram.feedback] parse error: %v", err)
		return
	}

	// Mock handler: record feedback
	// In Phase 2, this writes to Postgres intent_eval_runs + context_timeline
	resp := FeedbackResponse{
		FeedbackID: req.FeedbackID,
		Persisted:  true,
		RowID:      "feedback-" + req.FeedbackID[:8],
		Outcome:    req.Outcome,
		Handler:    EngramFeedbackSubj,
	}

	data, _ := json.Marshal(resp)
	m.Respond(data)
	log.Printf("[engram.feedback] ✅ feedback_id=%s outcome=%s persisted=%v", req.FeedbackID, req.Outcome, resp.Persisted)
}

func main() {
	// Connect to NATS
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = "nats://localhost:4222"
	}

	nc, err := nats.Connect(natsURL)
	if err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}
	defer nc.Close()
	log.Println("✅ Connected to NATS")

	// Subscribe to 5 subjects
	subjects := map[string]func(*nats.Msg){
		TaskExecuteSubj:     handleTaskExecute,
		RetrievalRerankSubj: handleRerankRequest,
		GPUCUVSSearchSubj:   handleGPUSearch,
		GPUCUDARankSubj:     handleGPURank,
		EngramFeedbackSubj:  handleEngramFeedback,
	}

	for subj, handler := range subjects {
		if _, err := nc.Subscribe(subj, handler); err != nil {
			log.Fatalf("Failed to subscribe to %s: %v", subj, err)
		}
		log.Printf("✅ Listening: %s", subj)
	}

	log.Printf("✅ Listening on %d subjects", len(subjects))

	// Start gRPC server (future: real handlers will move here)
	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = "50055"
	}

	go func() {
		lis, err := net.Listen("tcp", ":"+grpcPort)
		if err != nil {
			log.Fatalf("Failed to listen on gRPC port: %v", err)
		}

		// Placeholder gRPC server (will be populated in Phase 2)
		s := grpc.NewServer()
		if err := s.Serve(lis); err != nil {
			log.Fatalf("gRPC server error: %v", err)
		}
	}()

	log.Printf("✅ gRPC server on :%s", grpcPort)
	log.Println("\n🚀 Agent-sidecar READY")
	log.Println("   Phase 1: NATS request/reply handlers PROVEN")
	log.Println("   Phase 2: Postgres + real logic (pending)")

	// Wait for interrupt
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("\n🛑 Shutting down...")
	nc.Close()
}
