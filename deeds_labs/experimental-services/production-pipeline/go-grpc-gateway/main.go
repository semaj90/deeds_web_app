// Go gRPC Gateway Service for Legal AI Production Pipeline
// Provides high-performance API gateway with PostgreSQL+pgvector integration

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"

	// Database drivers
	"database/sql"
	_ "github.com/lib/pq"
	
	// Redis client
	"github.com/go-redis/redis/v8"
	
	// Vector operations
	"github.com/pgvector/pgvector-go"
)

// Configuration
type Config struct {
	PostgresURL     string
	RedisAddr       string
	RedisPassword   string
	GRPCPort        string
	HTTPPort        string
	Environment     string
}

// Services
type Services struct {
	DB          *sql.DB
	Redis       *redis.Client
	Config      *Config
}

// Document represents a legal document
type Document struct {
	ID             string                 `json:"id"`
	Title          string                 `json:"title"`
	Content        string                 `json:"content"`
	DocumentType   string                 `json:"document_type"`
	Metadata       map[string]interface{} `json:"metadata"`
	Embedding      []float32              `json:"embedding,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`
}

// SearchRequest for vector similarity search
type SearchRequest struct {
	Query           string                 `json:"query"`
	Embedding       []float32              `json:"embedding,omitempty"`
	Threshold       float32                `json:"threshold"`
	Limit           int                    `json:"limit"`
	Filters         map[string]interface{} `json:"filters,omitempty"`
	DocumentTypes   []string               `json:"document_types,omitempty"`
}

// SearchResponse with results and metadata
type SearchResponse struct {
	Results       []SearchResult `json:"results"`
	Total         int            `json:"total"`
	ProcessingTime time.Duration  `json:"processing_time_ms"`
	CacheHit      bool           `json:"cache_hit"`
}

// SearchResult individual result
type SearchResult struct {
	Document   Document `json:"document"`
	Score      float32  `json:"score"`
	Highlights []string `json:"highlights,omitempty"`
}

// HealthResponse for health checks
type HealthResponse struct {
	Status    string            `json:"status"`
	Timestamp time.Time         `json:"timestamp"`
	Services  map[string]string `json:"services"`
	Version   string            `json:"version"`
}

func loadConfig() *Config {
	return &Config{
		PostgresURL:   getEnv("POSTGRES_URL", "postgresql://postgres:123456@localhost:5432/legal_ai_db"),
		RedisAddr:     getEnv("REDIS_ADDR", "localhost:4005"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		GRPCPort:      getEnv("GRPC_PORT", "8095"),
		HTTPPort:      getEnv("HTTP_PORT", "8096"),
		Environment:   getEnv("ENVIRONMENT", "development"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func initServices(config *Config) (*Services, error) {
	// Initialize PostgreSQL connection
	db, err := sql.Open("postgres", config.PostgresURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to PostgreSQL: %w", err)
	}
	
	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	
	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	
	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping PostgreSQL: %w", err)
	}
	
	// Initialize Redis client
	redisClient := redis.NewClient(&redis.Options{
		Addr:     config.RedisAddr,
		Password: config.RedisPassword,
		DB:       0,
		PoolSize: 10,
	})
	
	// Test Redis connection
	if err := redisClient.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}
	
	log.Println("✅ Connected to PostgreSQL and Redis")
	
	return &Services{
		DB:     db,
		Redis:  redisClient,
		Config: config,
	}, nil
}

// HTTP Handlers

func (s *Services) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	
	services := map[string]string{
		"postgresql": "unknown",
		"redis":      "unknown",
	}
	
	// Check PostgreSQL
	if err := s.DB.PingContext(ctx); err == nil {
		services["postgresql"] = "healthy"
	} else {
		services["postgresql"] = "unhealthy"
	}
	
	// Check Redis
	if err := s.Redis.Ping(ctx).Err(); err == nil {
		services["redis"] = "healthy"
	} else {
		services["redis"] = "unhealthy"
	}
	
	status := "healthy"
	for _, serviceStatus := range services {
		if serviceStatus != "healthy" {
			status = "unhealthy"
			break
		}
	}
	
	response := HealthResponse{
		Status:    status,
		Timestamp: time.Now(),
		Services:  services,
		Version:   "1.0.0",
	}
	
	w.Header().Set("Content-Type", "application/json")
	if status != "healthy" {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	
	json.NewEncoder(w).Encode(response)
}

func (s *Services) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}
	
	// Set defaults
	if req.Threshold == 0 {
		req.Threshold = 0.7
	}
	if req.Limit == 0 || req.Limit > 100 {
		req.Limit = 20
	}
	
	start := time.Now()
	
	// Try cache first
	cacheKey := fmt.Sprintf("search:%s:%.2f:%d", hashQuery(req), req.Threshold, req.Limit)
	ctx := r.Context()
	
	if cached := s.Redis.Get(ctx, cacheKey).Val(); cached != "" {
		var response SearchResponse
		if err := json.Unmarshal([]byte(cached), &response); err == nil {
			response.CacheHit = true
			response.ProcessingTime = time.Since(start)
			
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Cache", "HIT")
			json.NewEncoder(w).Encode(response)
			return
		}
	}
	
	// Execute vector search query
	results, err := s.performVectorSearch(ctx, req)
	if err != nil {
		log.Printf("❌ Vector search error: %v", err)
		http.Error(w, "Search failed", http.StatusInternalServerError)
		return
	}
	
	response := SearchResponse{
		Results:        results,
		Total:          len(results),
		ProcessingTime: time.Since(start),
		CacheHit:       false,
	}
	
	// Cache the result
	if responseData, err := json.Marshal(response); err == nil {
		s.Redis.SetEX(ctx, cacheKey, responseData, 10*time.Minute)
	}
	
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	json.NewEncoder(w).Encode(response)
}

func (s *Services) handleDocuments(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.getDocuments(w, r)
	case http.MethodPost:
		s.createDocument(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Services) getDocuments(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	documentID := vars["id"]
	
	if documentID == "" {
		s.listDocuments(w, r)
		return
	}
	
	// Get specific document
	ctx := r.Context()
	
	// Try cache first
	cacheKey := fmt.Sprintf("doc:%s", documentID)
	if cached := s.Redis.Get(ctx, cacheKey).Val(); cached != "" {
		var doc Document
		if err := json.Unmarshal([]byte(cached), &doc); err == nil {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Cache", "HIT")
			json.NewEncoder(w).Encode(doc)
			return
		}
	}
	
	// Query database
	query := `
		SELECT id, title, content, document_type, legal_metadata, created_at, updated_at
		FROM documents 
		WHERE id = $1
	`
	
	var doc Document
	var metadataJSON []byte
	
	err := s.DB.QueryRowContext(ctx, query, documentID).Scan(
		&doc.ID, &doc.Title, &doc.Content, &doc.DocumentType,
		&metadataJSON, &doc.CreatedAt, &doc.UpdatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Document not found", http.StatusNotFound)
		} else {
			log.Printf("❌ Database error: %v", err)
			http.Error(w, "Database error", http.StatusInternalServerError)
		}
		return
	}
	
	// Parse metadata
	if len(metadataJSON) > 0 {
		json.Unmarshal(metadataJSON, &doc.Metadata)
	}
	
	// Cache the result
	if docData, err := json.Marshal(doc); err == nil {
		s.Redis.SetEX(ctx, cacheKey, docData, 1*time.Hour)
	}
	
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Cache", "MISS")
	json.NewEncoder(w).Encode(doc)
}

func (s *Services) listDocuments(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	
	// Parse query parameters
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	docType := r.URL.Query().Get("type")
	
	limit := 20
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
		limit = l
	}
	
	offset := 0
	if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
		offset = o
	}
	
	query := `
		SELECT id, title, document_type, created_at, updated_at
		FROM documents
	`
	args := []interface{}{}
	argIndex := 1
	
	if docType != "" {
		query += fmt.Sprintf(" WHERE document_type = $%d", argIndex)
		args = append(args, docType)
		argIndex++
	}
	
	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argIndex, argIndex+1)
	args = append(args, limit, offset)
	
	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		log.Printf("❌ Database error: %v", err)
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	
	var documents []Document
	for rows.Next() {
		var doc Document
		err := rows.Scan(&doc.ID, &doc.Title, &doc.DocumentType, &doc.CreatedAt, &doc.UpdatedAt)
		if err != nil {
			log.Printf("❌ Row scan error: %v", err)
			continue
		}
		documents = append(documents, doc)
	}
	
	response := map[string]interface{}{
		"documents": documents,
		"total":     len(documents),
		"limit":     limit,
		"offset":    offset,
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (s *Services) createDocument(w http.ResponseWriter, r *http.Request) {
	var doc Document
	if err := json.NewDecoder(r.Body).Decode(&doc); err != nil {
		http.Error(w, "Invalid JSON request", http.StatusBadRequest)
		return
	}
	
	if doc.Title == "" || doc.Content == "" {
		http.Error(w, "Title and content are required", http.StatusBadRequest)
		return
	}
	
	ctx := r.Context()
	
	// Insert document
	query := `
		INSERT INTO documents (title, content, document_type, legal_metadata, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`
	
	metadataJSON, _ := json.Marshal(doc.Metadata)
	now := time.Now()
	
	err := s.DB.QueryRowContext(ctx, query,
		doc.Title, doc.Content, doc.DocumentType,
		metadataJSON, now, now,
	).Scan(&doc.ID)
	
	if err != nil {
		log.Printf("❌ Insert error: %v", err)
		http.Error(w, "Failed to create document", http.StatusInternalServerError)
		return
	}
	
	doc.CreatedAt = now
	doc.UpdatedAt = now
	
	// Invalidate cache
	cachePattern := "doc:*"
	s.Redis.Del(ctx, cachePattern)
	
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(doc)
}

func (s *Services) performVectorSearch(ctx context.Context, req SearchRequest) ([]SearchResult, error) {
	if len(req.Embedding) == 0 {
		return []SearchResult{}, nil
	}
	
	// Convert embedding to pgvector format
	embedding := pgvector.NewVector(req.Embedding)
	
	query := `
		SELECT 
			d.id, d.title, d.content, d.document_type, 
			d.legal_metadata, d.created_at, d.updated_at,
			(dc.embedding <=> $1) as similarity_score
		FROM documents d
		JOIN document_chunks dc ON d.id = dc.document_id
		WHERE (dc.embedding <=> $1) < $2
	`
	args := []interface{}{embedding, req.Threshold}
	argIndex := 3
	
	// Add document type filter
	if len(req.DocumentTypes) > 0 {
		query += fmt.Sprintf(" AND d.document_type = ANY($%d)", argIndex)
		args = append(args, req.DocumentTypes)
		argIndex++
	}
	
	// Add metadata filters
	for key, value := range req.Filters {
		query += fmt.Sprintf(" AND d.legal_metadata ->> '%s' = $%d", key, argIndex)
		args = append(args, value)
		argIndex++
	}
	
	query += " ORDER BY similarity_score LIMIT $" + strconv.Itoa(argIndex)
	args = append(args, req.Limit)
	
	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var results []SearchResult
	for rows.Next() {
		var result SearchResult
		var metadataJSON []byte
		var score float64
		
		err := rows.Scan(
			&result.Document.ID, &result.Document.Title, &result.Document.Content,
			&result.Document.DocumentType, &metadataJSON, 
			&result.Document.CreatedAt, &result.Document.UpdatedAt, &score,
		)
		if err != nil {
			log.Printf("❌ Row scan error: %v", err)
			continue
		}
		
		result.Score = float32(score)
		
		if len(metadataJSON) > 0 {
			json.Unmarshal(metadataJSON, &result.Document.Metadata)
		}
		
		results = append(results, result)
	}
	
	return results, nil
}

func hashQuery(req SearchRequest) string {
	data := fmt.Sprintf("%s_%v_%f_%d", req.Query, req.DocumentTypes, req.Threshold, req.Limit)
	// Simple hash - replace with proper hash function in production
	return fmt.Sprintf("%x", data)
}

func setupRoutes(services *Services) http.Handler {
	r := mux.NewRouter()
	
	// Health check
	r.HandleFunc("/health", services.handleHealth).Methods("GET")
	r.HandleFunc("/api/health", services.handleHealth).Methods("GET")
	
	// Document operations
	r.HandleFunc("/api/documents", services.handleDocuments).Methods("GET", "POST")
	r.HandleFunc("/api/documents/{id}", services.getDocuments).Methods("GET")
	
	// Vector search
	r.HandleFunc("/api/search", services.handleSearch).Methods("POST")
	r.HandleFunc("/api/search/vector", services.handleSearch).Methods("POST")
	
	// Metrics endpoint
	r.HandleFunc("/metrics", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("# Legal AI Gateway Metrics\n# TODO: Implement Prometheus metrics\n"))
	}).Methods("GET")
	
	// CORS middleware
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"}, // Configure properly for production
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	})
	
	return c.Handler(r)
}

func main() {
	config := loadConfig()
	log.Printf("🚀 Starting Legal AI gRPC Gateway (env: %s)", config.Environment)
	
	// Initialize services
	services, err := initServices(config)
	if err != nil {
		log.Fatal("❌ Failed to initialize services:", err)
	}
	defer services.DB.Close()
	defer services.Redis.Close()
	
	// Setup HTTP server
	httpHandler := setupRoutes(services)
	httpServer := &http.Server{
		Addr:         ":" + config.HTTPPort,
		Handler:      httpHandler,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	
	// Setup gRPC server (basic setup - extend as needed)
	grpcServer := grpc.NewServer()
	reflection.Register(grpcServer)
	
	// Start gRPC server
	go func() {
		lis, err := net.Listen("tcp", ":"+config.GRPCPort)
		if err != nil {
			log.Fatal("❌ Failed to listen on gRPC port:", err)
		}
		
		log.Printf("🔌 gRPC server listening on :%s", config.GRPCPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatal("❌ Failed to serve gRPC:", err)
		}
	}()
	
	// Start HTTP server
	go func() {
		log.Printf("🌐 HTTP server listening on :%s", config.HTTPPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("❌ Failed to serve HTTP:", err)
		}
	}()
	
	// Wait for interrupt signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan
	
	log.Println("🛑 Shutting down servers...")
	
	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	grpcServer.GracefulStop()
	
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("❌ HTTP server shutdown error: %v", err)
	}
	
	log.Println("✅ Servers shut down successfully")
}