//go:build archived
// +build archived

package main

import (
	"context"
	crand "crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"math/big"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/quic-go/quic-go/http3"
	"github.com/redis/go-redis/v9"
)

// Legal AI Request/Response structures based on our protobuf schema
type LegalDocumentRequest struct {
	DocumentID   string            `json:"document_id"`
	DocumentData []byte            `json:"document_data"`
	DocumentType string            `json:"document_type"`
	Filename     string            `json:"filename"`
	Metadata     map[string]string `json:"metadata"`
	Options      ProcessingOptions `json:"options"`
}

type ProcessingOptions struct {
	ExtractEntities  bool `json:"extract_entities"`
	AnalyzeSentiment bool `json:"analyze_sentiment"`
	ClassifyDomain   bool `json:"classify_domain"`
	GenerateEmbedding bool `json:"generate_embedding"`
	FindSimilar      bool `json:"find_similar"`
	RiskAssessment   bool `json:"risk_assessment"`
}

type LegalDocumentResponse struct {
	DocumentID       string             `json:"document_id"`
	Summary          string             `json:"summary"`
	KeyEntities      []string           `json:"key_entities"`
	LegalConcepts    []string           `json:"legal_concepts"`
	Confidence       float32            `json:"confidence"`
	LegalDomain      string             `json:"legal_domain"`
	SentimentScore   float32            `json:"sentiment_score"`
	ComplexityScore  int32              `json:"complexity_score"`
	Embedding        []float32          `json:"embedding,omitempty"`
	SimilarCases     []SimilarCase      `json:"similar_cases,omitempty"`
	RiskAssessment   *SimpleRiskAssessment `json:"risk_assessment,omitempty"`
	ProcessingTimeMs int64              `json:"processing_time_ms"`
	Success          bool               `json:"success"`
	Error            string             `json:"error,omitempty"`
}

type SimpleRecommendationRequest struct {
	CaseID              string            `json:"case_id"`
	CaseFacts           []string          `json:"case_facts"`
	LegalDomain         string            `json:"legal_domain"`
	Jurisdiction        string            `json:"jurisdiction"`
	MaxRecommendations  int32             `json:"max_recommendations"`
	SimilarityThreshold float32           `json:"similarity_threshold"`
	IncludePrecedents   bool              `json:"include_precedents"`
	IncludeSimilarCases bool              `json:"include_similar_cases"`
	IncludeRiskAssessment bool            `json:"include_risk_assessment"`
	Filters             map[string]string `json:"filters"`
}

type SimpleRecommendationResponse struct {
	Recommendations   []SimpleLegalRecommendation `json:"recommendations"`
	TotalCount        int32                 `json:"total_count"`
	ConfidenceScore   float32               `json:"confidence_score"`
	ProcessingTimeMs  int64                 `json:"processing_time_ms"`
	Success           bool                  `json:"success"`
	Error             string                `json:"error,omitempty"`
}

type SimilarCase struct {
	CaseID         string  `json:"case_id"`
	Title          string  `json:"title"`
	Similarity     float32 `json:"similarity"`
	LegalDomain    string  `json:"legal_domain"`
	Jurisdiction   string  `json:"jurisdiction"`
	Year           int32   `json:"year"`
	KeyFactors     []string `json:"key_factors"`
	RelevanceScore float32  `json:"relevance_score"`
}

type SimpleLegalRecommendation struct {
	ID                   string          `json:"id"`
	Title                string          `json:"title"`
	Description          string          `json:"description"`
	ConfidenceScore      float32         `json:"confidence_score"`
	LegalDomain          string          `json:"legal_domain"`
	Jurisdiction         string          `json:"jurisdiction"`
	RelevantCases        []string        `json:"relevant_cases"`
	LegalConcepts        []string        `json:"legal_concepts"`
	RiskAssessment       *SimpleRiskAssessment `json:"risk_assessment"`
	RecommendationType   string          `json:"recommendation_type"`
	Metadata             map[string]string `json:"metadata"`
}

type SimpleRiskAssessment struct {
	OverallRiskScore     float32      `json:"overall_risk_score"`
	RiskLevel            string       `json:"risk_level"`
	RiskFactors          []SimpleRiskFactor `json:"risk_factors"`
	MitigationStrategies []string     `json:"mitigation_strategies"`
	Confidence           float32      `json:"confidence"`
}

type SimpleRiskFactor struct {
	FactorName    string   `json:"factor_name"`
	ImpactScore   float32  `json:"impact_score"`
	Probability   float32  `json:"probability"`
	Description   string   `json:"description"`
	RelatedCases  []string `json:"related_cases"`
}

// QUIC Legal AI Server
type LegalAIQuicServer struct {
	redisClient    *redis.Client
	workerPool     chan LegalJob
	results        chan LegalResult
	recommendations chan RecommendationJob
	mu             sync.RWMutex
	vectorDB       *SimpleVectorDatabase
	caseDB         *SimpleLegalCaseDatabase
}

type LegalJob struct {
	JobID     string                `json:"job_id"`
	Request   LegalDocumentRequest  `json:"request"`
	Operation string                `json:"operation"`
	Timestamp time.Time             `json:"timestamp"`
}

type LegalResult struct {
	JobID      string                 `json:"job_id"`
	Response   LegalDocumentResponse  `json:"response"`
	Status     string                 `json:"status"`
	Metrics    map[string]float64     `json:"metrics"`
	Metadata   map[string]interface{} `json:"metadata"`
}

type RecommendationJob struct {
	JobID     string                `json:"job_id"`
	Request   SimpleRecommendationRequest `json:"request"`
	Timestamp time.Time             `json:"timestamp"`
}

// Mock vector database for legal documents
type SimpleVectorDatabase struct {
	vectors map[string][]float32
	mu      sync.RWMutex
}

func NewSimpleVectorDatabase() *SimpleVectorDatabase {
	return &SimpleVectorDatabase{
		vectors: make(map[string][]float32),
	}
}

func (vdb *SimpleVectorDatabase) Store(id string, vector []float32) {
	vdb.mu.Lock()
	defer vdb.mu.Unlock()
	vdb.vectors[id] = vector
}

func (vdb *SimpleVectorDatabase) Search(queryVector []float32, topK int) []SimilarCase {
	vdb.mu.RLock()
	defer vdb.mu.RUnlock()

	type similarity struct {
		id    string
		score float32
	}

	var similarities []similarity
	for id, vector := range vdb.vectors {
		score := cosineSimilarity(queryVector, vector)
		similarities = append(similarities, similarity{id: id, score: score})
	}

	// Sort by similarity (simplified)
	// In production, use proper sorting
	results := make([]SimilarCase, 0, topK)
	for i, sim := range similarities {
		if i >= topK {
			break
		}
		results = append(results, SimilarCase{
			CaseID:         sim.id,
			Title:          fmt.Sprintf("Case %s", sim.id),
			Similarity:     sim.score,
			LegalDomain:    "general",
			Jurisdiction:   "federal",
			RelevanceScore: sim.score,
		})
	}

	return results
}

// Mock legal case database
type SimpleLegalCaseDatabase struct {
	cases map[string]SimpleLegalCase
	mu    sync.RWMutex
}

type SimpleLegalCase struct {
	CaseID       string   `json:"case_id"`
	Title        string   `json:"title"`
	Court        string   `json:"court"`
	Year         int32    `json:"year"`
	Jurisdiction string   `json:"jurisdiction"`
	Domain       string   `json:"domain"`
	Facts        []string `json:"facts"`
	Outcome      string   `json:"outcome"`
}

func NewSimpleLegalCaseDatabase() *SimpleLegalCaseDatabase {
	db := &SimpleLegalCaseDatabase{
		cases: make(map[string]SimpleLegalCase),
	}

	// Add some mock cases
	mockCases := []SimpleLegalCase{
		{
			CaseID: "case_001",
			Title: "Contract Dispute - Software Licensing",
			Court: "District Court",
			Year: 2023,
			Jurisdiction: "federal",
			Domain: "contract_law",
			Facts: []string{"software licensing dispute", "breach of contract", "damages claimed"},
			Outcome: "plaintiff_victory",
		},
		{
			CaseID: "case_002",
			Title: "Employment Discrimination Case",
			Court: "Appeals Court",
			Year: 2022,
			Jurisdiction: "state",
			Domain: "employment_law",
			Facts: []string{"workplace discrimination", "hostile environment", "wrongful termination"},
			Outcome: "settlement",
		},
	}

	for _, case_ := range mockCases {
		db.cases[case_.CaseID] = case_
	}

	return db
}

// FIXED: Corrected cosine similarity calculation with proper square root
func cosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) {
		return 0
	}

	var dotProduct, normA, normB float32
	for i := 0; i < len(a); i++ {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	// FIXED: Added proper square root for vector norms
	return dotProduct / (float32(math.Sqrt(float64(normA))) * float32(math.Sqrt(float64(normB))))
}

func NewLegalAIQuicServer() *LegalAIQuicServer {
	// Initialize Redis client with better error handling
	rdb := redis.NewClient(&redis.Options{
		Addr:     getEnvOrDefault("REDIS_URL", "localhost:6379"),
		Password: getEnvOrDefault("REDIS_PASSWORD", ""),
		DB:       0,
	})

	// Test Redis connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("⚠️  Redis connection failed: %v (continuing without Redis)", err)
	} else {
		log.Println("✅ Redis connection established")
	}

	server := &LegalAIQuicServer{
		redisClient:     rdb,
		workerPool:      make(chan LegalJob, 1000),
		results:         make(chan LegalResult, 1000),
		recommendations: make(chan RecommendationJob, 500),
		vectorDB:        NewSimpleVectorDatabase(),
		caseDB:          NewSimpleLegalCaseDatabase(),
	}

	// Start worker goroutines
	for i := 0; i < 10; i++ {
		go server.legalWorker(i)
	}

	// Start recommendation workers
	for i := 0; i < 5; i++ {
		go server.recommendationWorker(i)
	}

	return server
}

func (s *LegalAIQuicServer) legalWorker(workerID int) {
	for job := range s.workerPool {
		startTime := time.Now()
		log.Printf("🔄 Legal Worker %d processing job %s", workerID, job.JobID)

		result := LegalResult{
			JobID:  job.JobID,
			Status: "processing",
			Metrics: make(map[string]float64),
			Metadata: map[string]interface{}{
				"worker_id":  workerID,
				"started_at": startTime,
			},
		}

		// Process legal document
		response := s.processLegalDocument(job.Request)
		result.Response = response

		if response.Success {
			result.Status = "completed"
		} else {
			result.Status = "error"
		}

		result.Metadata["completed_at"] = time.Now()
		result.Metrics["processing_time"] = time.Since(startTime).Seconds()

		s.results <- result

		// Store result in Redis with error handling
		if s.redisClient != nil {
			resultJSON, err := json.Marshal(result)
			if err == nil {
				err = s.redisClient.Set(context.Background(),
					fmt.Sprintf("legal_result:%s", job.JobID),
					resultJSON,
					time.Hour*24).Err()
				if err != nil {
					log.Printf("⚠️  Redis store failed for job %s: %v", job.JobID, err)
				}
			}
		}

		log.Printf("✅ Legal Worker %d completed job %s in %.2fs",
			workerID, job.JobID, time.Since(startTime).Seconds())
	}
}

func (s *LegalAIQuicServer) recommendationWorker(workerID int) {
	for job := range s.recommendations {
		startTime := time.Now()
		log.Printf("🎯 Recommendation Worker %d processing job %s", workerID, job.JobID)

		response := s.processRecommendations(job.Request)

		// Store result in Redis with error handling
		if s.redisClient != nil {
			resultJSON, err := json.Marshal(response)
			if err == nil {
				err = s.redisClient.Set(context.Background(),
					fmt.Sprintf("recommendation_result:%s", job.JobID),
					resultJSON,
					time.Hour*24).Err()
				if err != nil {
					log.Printf("⚠️  Redis store failed for recommendation job %s: %v", job.JobID, err)
				}
			}
		}

		log.Printf("✅ Recommendation Worker %d completed job %s in %.2fs",
			workerID, job.JobID, time.Since(startTime).Seconds())
	}
}

func (s *LegalAIQuicServer) processLegalDocument(req LegalDocumentRequest) LegalDocumentResponse {
	startTime := time.Now()
	response := LegalDocumentResponse{
		DocumentID: req.DocumentID,
		Success:    true,
	}

	// Mock legal document processing
	if req.Options.ExtractEntities {
		response.KeyEntities = []string{"plaintiff", "defendant", "contract", "damages"}
	}

	if req.Options.ClassifyDomain {
		response.LegalDomain = "contract_law"
		response.Confidence = 0.85
	}

	if req.Options.AnalyzeSentiment {
		response.SentimentScore = 0.2 // Slightly negative (legal disputes tend to be)
	}

	response.ComplexityScore = 7
	response.Summary = fmt.Sprintf("Legal document analysis for %s completed", req.Filename)
	response.LegalConcepts = []string{"breach of contract", "damages", "legal remedy"}

	if req.Options.GenerateEmbedding {
		// Generate mock embedding
		embedding := make([]float32, 384)
		for i := range embedding {
			embedding[i] = float32(i) * 0.001
		}
		response.Embedding = embedding

		// Store in vector DB
		s.vectorDB.Store(req.DocumentID, embedding)
	}

	if req.Options.FindSimilar && len(response.Embedding) > 0 {
		response.SimilarCases = s.vectorDB.Search(response.Embedding, 5)
	}

	if req.Options.RiskAssessment {
		response.RiskAssessment = &SimpleRiskAssessment{
			OverallRiskScore: 0.6,
			RiskLevel:       "medium",
			RiskFactors: []SimpleRiskFactor{
				{
					FactorName:  "Contract Complexity",
					ImpactScore: 0.7,
					Probability: 0.8,
					Description: "Complex contractual terms may lead to disputes",
				},
			},
			MitigationStrategies: []string{"Legal review", "Clear documentation"},
			Confidence:          0.75,
		}
	}

	response.ProcessingTimeMs = time.Since(startTime).Milliseconds()
	return response
}

func (s *LegalAIQuicServer) processRecommendations(req SimpleRecommendationRequest) SimpleRecommendationResponse {
	startTime := time.Now()

	// Mock recommendation generation
	recommendations := []SimpleLegalRecommendation{
		{
			ID:              "rec_001",
			Title:           "Similar Contract Dispute Precedent",
			Description:     "Review similar case with favorable outcome",
			ConfidenceScore: 0.85,
			LegalDomain:     req.LegalDomain,
			Jurisdiction:    req.Jurisdiction,
			RelevantCases:   []string{"case_001"},
			LegalConcepts:   []string{"contract interpretation", "damages calculation"},
			RecommendationType: "precedent",
		},
		{
			ID:              "rec_002",
			Title:           "Risk Mitigation Strategy",
			Description:     "Proactive measures to reduce litigation risk",
			ConfidenceScore: 0.72,
			LegalDomain:     req.LegalDomain,
			Jurisdiction:    req.Jurisdiction,
			RecommendationType: "strategy",
		},
	}

	return SimpleRecommendationResponse{
		Recommendations:  recommendations,
		TotalCount:      int32(len(recommendations)),
		ConfidenceScore: 0.785,
		ProcessingTimeMs: time.Since(startTime).Milliseconds(),
		Success:         true,
	}
}

// HTTP/3 handlers
func (s *LegalAIQuicServer) handleDocumentAnalysis(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req LegalDocumentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Generate job ID
	jobID := fmt.Sprintf("legal_%d", time.Now().UnixNano())
	job := LegalJob{
		JobID:     jobID,
		Request:   req,
		Operation: "document_analysis",
		Timestamp: time.Now(),
	}

	// Add to worker pool
	select {
	case s.workerPool <- job:
		response := map[string]interface{}{
			"job_id": jobID,
			"status": "queued",
			"message": "Legal document analysis queued",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	default:
		http.Error(w, "Worker pool full", http.StatusServiceUnavailable)
	}
}

func (s *LegalAIQuicServer) handleRecommendations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req SimpleRecommendationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Generate job ID
	jobID := fmt.Sprintf("rec_%d", time.Now().UnixNano())
	job := RecommendationJob{
		JobID:     jobID,
		Request:   req,
		Timestamp: time.Now(),
	}

	// Add to recommendation worker pool
	select {
	case s.recommendations <- job:
		response := map[string]interface{}{
			"job_id": jobID,
			"status": "queued",
			"message": "Legal recommendations queued",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	default:
		http.Error(w, "Recommendation pool full", http.StatusServiceUnavailable)
	}
}

func (s *LegalAIQuicServer) handleResult(w http.ResponseWriter, r *http.Request) {
	jobID := r.URL.Query().Get("job_id")
	if jobID == "" {
		http.Error(w, "Missing job_id parameter", http.StatusBadRequest)
		return
	}

	// Check both legal and recommendation results
	var resultKey string
	if strings.HasPrefix(jobID, "legal_") {
		resultKey = fmt.Sprintf("legal_result:%s", jobID)
	} else if strings.HasPrefix(jobID, "rec_") {
		resultKey = fmt.Sprintf("recommendation_result:%s", jobID)
	} else {
		http.Error(w, "Invalid job_id format", http.StatusBadRequest)
		return
	}

	// Get result from Redis with error handling
	if s.redisClient == nil {
		http.Error(w, "Redis unavailable", http.StatusServiceUnavailable)
		return
	}

	resultJSON, err := s.redisClient.Get(context.Background(), resultKey).Result()
	if err != nil {
		if err == redis.Nil {
			http.Error(w, "Job not found or still processing", http.StatusNotFound)
		} else {
			log.Printf("⚠️  Redis get error for job %s: %v", jobID, err)
			http.Error(w, "Redis error", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(resultJSON))
}

func (s *LegalAIQuicServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	redisStatus := "disconnected"
	if s.redisClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := s.redisClient.Ping(ctx).Err(); err == nil {
			redisStatus = "connected"
		}
	}

	status := map[string]interface{}{
		"status":           "healthy",
		"timestamp":        time.Now(),
		"service":          "Legal AI QUIC Server",
		"redis_status":     redisStatus,
		"worker_pools": map[string]interface{}{
			"legal_workers": map[string]interface{}{
				"capacity":     cap(s.workerPool),
				"queued_jobs":  len(s.workerPool),
			},
			"recommendation_workers": map[string]interface{}{
				"capacity":     cap(s.recommendations),
				"queued_jobs":  len(s.recommendations),
			},
		},
		"vector_db_documents": len(s.vectorDB.vectors),
		"case_db_entries":    len(s.caseDB.cases),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func generateTLSConfig() *tls.Config {
	key, err := rsa.GenerateKey(crand.Reader, 2048)
	if err != nil {
		log.Fatal(err)
	}

	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			CommonName: "localhost",
		},
		NotBefore:   time.Now(),
		NotAfter:    time.Now().Add(365 * 24 * time.Hour),
		KeyUsage:    x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses: []net.IP{net.IPv4(127, 0, 0, 1)},
	}

	certDER, err := x509.CreateCertificate(crand.Reader, &template, &template, &key.PublicKey, key)
	if err != nil {
		log.Fatal(err)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{
			{
				Certificate: [][]byte{certDER},
				PrivateKey:  key,
			},
		},
		NextProtos: []string{http3.NextProtoH3},
	}
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// findAvailablePort tries to find an available port starting from the preferred port
func findAvailablePort(preferredPort string) string {
	for port := parsePortOrDefault(preferredPort, 4433); port < 5000; port++ {
		addr := fmt.Sprintf(":%d", port)
		ln, err := net.Listen("tcp", addr)
		if err == nil {
			ln.Close()
			return fmt.Sprintf("%d", port)
		}
	}
	return preferredPort // fallback
}

func parsePortOrDefault(portStr string, defaultPort int) int {
	if portStr == "" {
		return defaultPort
	}
	// Simple port parsing (could use strconv.Atoi for production)
	switch portStr {
	case "4433":
		return 4433
	case "4434":
		return 4434
	case "4435":
		return 4435
	default:
		return defaultPort
	}
}

func main() {
	server := NewLegalAIQuicServer()

	// Setup HTTP/3 routes
	mux := http.NewServeMux()
	mux.HandleFunc("/legal/analyze", server.handleDocumentAnalysis)
	mux.HandleFunc("/legal/recommend", server.handleRecommendations)
	mux.HandleFunc("/legal/result", server.handleResult)
	mux.HandleFunc("/health", server.handleHealth)

	// IMPROVED: Better port handling
	preferredPort := getEnvOrDefault("QUIC_PORT", "4433")
	port := findAvailablePort(preferredPort)

	// Start QUIC/HTTP3 server
	quicServer := &http3.Server{
		Handler:   mux,
		Addr:      ":" + port,
		TLSConfig: generateTLSConfig(),
	}

	log.Println("🚀 Legal AI QUIC Server starting on :" + port)
	log.Println("📚 Vector database initialized")
	log.Println("⚖️  Legal case database loaded")
	log.Println("⚡ Worker pools ready:")
	log.Printf("   - Legal analysis workers: %d", cap(server.workerPool))
	log.Printf("   - Recommendation workers: %d", cap(server.recommendations))
	log.Println("🌐 API Endpoints:")
	log.Printf("   - POST /legal/analyze    (Document Analysis)")
	log.Printf("   - POST /legal/recommend  (Legal Recommendations)")
	log.Printf("   - GET  /legal/result     (Job Results)")
	log.Printf("   - GET  /health           (Server Health)")

	if err := quicServer.ListenAndServe(); err != nil {
		log.Fatal("❌ Failed to start Legal AI QUIC server:", err)
	}
}