package main

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/lucas-clemente/quic-go/http3"
	"github.com/valyala/fasthttp"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "github.com/legal-ai-platform/gemma_reranker/proto"
)

type QUICGateway struct {
	tritonClient   *fasthttp.Client
	rerankerClient pb.RerankerServiceClient
	redisClient    *redis.Client
	qdrantClient   *http.Client
}

type InferenceRequest struct {
	Model    string                 `json:"model"`
	Inputs   []TritonInput          `json:"inputs"`
	Outputs  []TritonOutput         `json:"outputs,omitempty"`
	Params   map[string]interface{} `json:"parameters,omitempty"`
}

type TritonInput struct {
	Name     string      `json:"name"`
	Shape    []int       `json:"shape"`
	Datatype string      `json:"datatype"`
	Data     interface{} `json:"data"`
}

type TritonOutput struct {
	Name string `json:"name"`
}

type InferenceResponse struct {
	ModelName    string                 `json:"model_name"`
	ModelVersion string                 `json:"model_version"`
	Outputs      []TritonOutputResponse `json:"outputs"`
}

type TritonOutputResponse struct {
	Name     string      `json:"name"`
	Shape    []int       `json:"shape"`
	Datatype string      `json:"datatype"`
	Data     interface{} `json:"data"`
}

func NewQUICGateway() *QUICGateway {
	// Triton HTTP client
	tritonClient := &fasthttp.Client{
		MaxConnsPerHost: 100,
		ReadTimeout:     30 * time.Second,
		WriteTimeout:    30 * time.Second,
	}

	// gRPC connection to Gemma reranker
	rerankerConn, err := grpc.Dial("gemma-reranker:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Printf("Failed to connect to Gemma reranker: %v", err)
	}
	rerankerClient := pb.NewRerankerServiceClient(rerankerConn)

	// Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     getEnv("REDIS_URL", "redis:6379"),
		Password: "",
		DB:       0,
	})

	// Qdrant HTTP client
	qdrantClient := &http.Client{
		Timeout: 30 * time.Second,
	}

	return &QUICGateway{
		tritonClient:   tritonClient,
		rerankerClient: rerankerClient,
		redisClient:    redisClient,
		qdrantClient:   qdrantClient,
	}
}

func (g *QUICGateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch r.URL.Path {
	case "/v2/models/infer":
		g.handleInference(w, r)
	case "/v2/models/rerank":
		g.handleRerank(w, r)
	case "/v2/search":
		g.handleSearch(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (g *QUICGateway) handleInference(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request", http.StatusBadRequest)
		return
	}

	var req InferenceRequest
	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Forward to Triton
	tritonURL := fmt.Sprintf("http://triton-server:8000/v2/models/%s/infer", req.Model)

	reqBody, _ := json.Marshal(req)
	httpReq := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(httpReq)

	httpReq.SetRequestURI(tritonURL)
	httpReq.Header.SetMethod("POST")
	httpReq.Header.SetContentType("application/json")
	httpReq.SetBody(reqBody)

	resp := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseResponse(resp)

	if err := g.tritonClient.Do(httpReq, resp); err != nil {
		http.Error(w, "Triton request failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(resp.Body())
}

func (g *QUICGateway) handleRerank(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read request", http.StatusBadRequest)
		return
	}

	var req struct {
		Query     string   `json:"query"`
		Documents []string `json:"documents"`
		TopK      int      `json:"top_k,omitempty"`
	}

	if err := json.Unmarshal(body, &req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	if req.TopK == 0 {
		req.TopK = 10
	}

	// Call Gemma reranker
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rerankReq := &pb.RerankRequest{
		Query:     req.Query,
		Documents: req.Documents,
		TopK:      int32(req.TopK),
	}

	resp, err := g.rerankerClient.RerankDocuments(ctx, rerankReq)
	if err != nil {
		http.Error(w, "Reranker failed", http.StatusInternalServerError)
		return
	}

	// Convert to JSON response
	result := map[string]interface{}{
		"query":     req.Query,
		"results":   resp.Results,
		"model":     "gemma-legal-reranker",
		"timestamp": time.Now().Unix(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (g *QUICGateway) handleSearch(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Missing query parameter", http.StatusBadRequest)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 10
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	// Search Qdrant
	searchReq := map[string]interface{}{
		"vector": []float32{}, // Would be populated with actual embeddings
		"limit":  limit,
		"with_payload": true,
		"with_vector": false,
	}

	reqBody, _ := json.Marshal(searchReq)
	httpReq, _ := http.NewRequest("POST", "http://qdrant:6333/collections/legal_docs/points/search", strings.NewReader(string(reqBody)))
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := g.qdrantClient.Do(httpReq)
	if err != nil {
		http.Error(w, "Search failed", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	io.Copy(w, resp.Body)
}

func main() {
	gateway := NewQUICGateway()

	// HTTP/3 (QUIC) server
	quicServer := &http3.Server{
		Server: &http.Server{
			Addr:    ":4242",
			Handler: gateway,
		},
	}

	// TLS config for QUIC
	quicServer.Server.TLSConfig = &tls.Config{
		Certificates: []tls.Certificate{generateSelfSignedCert()},
		NextProtos:   []string{"h3", "h3-29"},
	}

	// HTTP/1.1 fallback server
	httpServer := &http.Server{
		Addr:    ":8080",
		Handler: gateway,
	}

	go func() {
		log.Println("Starting HTTP/1.1 server on :8080")
		if err := httpServer.ListenAndServe(); err != nil {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	log.Println("Starting QUIC gateway on :4242")
	if err := quicServer.ListenAndServeTLS("", ""); err != nil {
		log.Fatalf("QUIC server error: %v", err)
	}
}

func generateSelfSignedCert() tls.Certificate {
	// Generate self-signed certificate for development
	// In production, use proper certificates
	cert, err := tls.X509KeyPair([]byte(`-----BEGIN CERTIFICATE-----
MIIBkTCB+wIJAKHHH4HqUqKzTANBgkqhkiG9w0BAQsFADAUMRIwEAYDVQQDEwls
b2NhbGhvc3QwHhcNMTkwOTE5MTUxNzMzWhcNMjAwOTE4MTUxNzMzWjAUMRIwEAYD
VQQDEwlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARX5v5r8D/
...
-----END CERTIFICATE-----`), []byte(`-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg...
-----END PRIVATE KEY-----`))
	if err != nil {
		log.Fatalf("Failed to generate cert: %v", err)
	}
	return cert
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}