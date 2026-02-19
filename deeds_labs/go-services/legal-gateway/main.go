package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/mux"
	jsoniter "github.com/json-iterator/go"
	jsonv2 "github.com/go-json-experiment/json"
	"github.com/rs/cors"
	"github.com/sirupsen/logrus"
)

var (
	// Performance JSON parsers: JSON v2 (experimental) + jsoniter fallback
	fastjson = jsoniter.ConfigCompatibleWithStandardLibrary
)

var (
	rdb    *redis.Client
	ctx    = context.Background()
	logger *logrus.Logger
)

func init() {
	// Initialize structured logging
	logger = logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{
		TimestampFormat: time.RFC3339,
		FieldMap: logrus.FieldMap{
			logrus.FieldKeyTime:  "timestamp",
			logrus.FieldKeyLevel: "level",
			logrus.FieldKeyMsg:   "message",
		},
	})
	logger.SetLevel(logrus.InfoLevel)
	
	// Add service context
	logger = logger.WithFields(logrus.Fields{
		"service":     "legal-gateway",
		"version":     "1.0.0",
		"environment": getEnv("ENVIRONMENT", "development"),
	}).Logger
}

// IngestJob represents a document processing job
type IngestJob struct {
	ID        string          `json:"id"`
	CaseID    int             `json:"case_id"`
	Sender    string          `json:"sender"`
	Payload   json.RawMessage `json:"payload"`
	Created   time.Time       `json:"created"`
	Source    string          `json:"source"`
	ChunkSize int             `json:"chunk_size,omitempty"`
}

// SSEEvent represents a server-sent event
type SSEEvent struct {
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
	ID    string      `json:"id,omitempty"`
}

// HealthStatus represents the API health status
type HealthStatus struct {
	Status    string            `json:"status"`
	Timestamp time.Time         `json:"timestamp"`
	Services  map[string]string `json:"services"`
	Version   string            `json:"version"`
}

func main() {
	// Initialize Redis client
	redisURL := getEnv("REDIS_URL", "redis://127.0.0.1:6379/0")
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		logger.WithField("error", err).Fatal("Failed to parse Redis URL")
	}
	rdb = redis.NewClient(opt)

	// Test Redis connection
	_, err = rdb.Ping(ctx).Result()
	if err != nil {
		logger.WithField("error", err).Fatal("Failed to connect to Redis")
	}
	logger.WithField("redis_url", redisURL).Info("Connected to Redis successfully")

	// Setup router
	r := mux.NewRouter()

	// API routes
	api := r.PathPrefix("/api").Subrouter()
	api.HandleFunc("/health", healthHandler).Methods("GET")
	api.HandleFunc("/doc/ingest", ingestHandler).Methods("POST")
	api.HandleFunc("/events/subscribe", sseHandler).Methods("GET")
	api.HandleFunc("/status/{jobId}", statusHandler).Methods("GET")

	// CORS setup for SvelteKit integration
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:5174", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})

	// Start server
	port := getEnv("PORT", "8080")
	handler := c.Handler(r)
	
	logger.WithFields(logrus.Fields{
		"port":        port,
		"redis_url":   redisURL,
		"sse_endpoint": "/api/events/subscribe",
		"ingest_endpoint": "/api/doc/ingest",
	}).Info("Legal Gateway API server starting")
	
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		logger.WithField("error", err).Fatal("Server failed to start")
	}
}

// Health check endpoint
func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	// Check Redis connection
	redisStatus := "healthy"
	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		redisStatus = "unhealthy: " + err.Error()
	}

	health := HealthStatus{
		Status:    "healthy",
		Timestamp: time.Now().UTC(),
		Version:   "1.0.0",
		Services: map[string]string{
			"redis":    redisStatus,
			"api":      "healthy",
			"pipeline": "ready",
		},
	}

	if data, err := fastjson.Marshal(health); err != nil {
		logger.WithField("error", err).Error("Failed to marshal health response")
		http.Error(w, `{"error":"marshal failed"}`, http.StatusInternalServerError)
	} else {
		w.Write(data)
	}
}

// Document ingestion endpoint
func ingestHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Parse request body with SIMD JSON for maximum speed
	bodyBytes, err := io.ReadAll(r.Body)
	if err != nil {
		logger.WithField("error", err).Error("Failed to read request body")
		http.Error(w, `{"error":"read body failed"}`, http.StatusBadRequest)
		return
	}
	
	// Validate JSON with fast parser
	var testPayload interface{}
	if err := fastjson.Unmarshal(bodyBytes, &testPayload); err != nil {
		logger.WithField("error", err).Error("JSON validation failed - invalid JSON")
		http.Error(w, `{"error":"invalid json payload"}`, http.StatusBadRequest)
		return
	}
	
	var payload json.RawMessage
	payload = json.RawMessage(bodyBytes)

	// Extract case ID from query params or headers
	caseIDStr := r.URL.Query().Get("case_id")
	caseID := 1 // default
	if caseIDStr != "" {
		if id, err := strconv.Atoi(caseIDStr); err == nil {
			caseID = id
		}
	}

	// Create job
	job := IngestJob{
		ID:      fmt.Sprintf("job-%d-%d", time.Now().UnixNano(), caseID),
		CaseID:  caseID,
		Sender:  getClientID(r),
		Payload: payload,
		Created: time.Now().UTC(),
		Source:  "wasm-parser",
	}

	// Serialize and enqueue job with JSON v2 (experimental, fastest)
	jobBytes, err := jsonv2.Marshal(job)
	if err != nil {
		logger.WithField("error", err).Error("Failed to serialize job")
		http.Error(w, `{"error":"failed to serialize job"}`, http.StatusInternalServerError)
		return
	}

	// Push to Redis list for worker processing
	if err := rdb.RPush(ctx, "ingest:jobs", jobBytes).Err(); err != nil {
		logger.WithFields(logrus.Fields{
			"error":  err,
			"job_id": job.ID,
		}).Error("Redis enqueue failed")
		http.Error(w, `{"error":"queue error"}`, http.StatusInternalServerError)
		return
	}

	// Publish job created event
	publishEvent("job_created", map[string]interface{}{
		"job_id":    job.ID,
		"case_id":   job.CaseID,
		"timestamp": job.Created,
		"status":    "queued",
	})

	// Return job info
	w.WriteHeader(http.StatusAccepted)
	response := map[string]interface{}{
		"job_id":    job.ID,
		"case_id":   job.CaseID,
		"status":    "queued",
		"timestamp": job.Created,
		"message":   "Document queued for processing",
	}
	
	if responseData, err := jsonv2.Marshal(response); err != nil {
		logger.WithField("error", err).Error("Failed to marshal response")
		http.Error(w, `{"error":"marshal failed"}`, http.StatusInternalServerError)
	} else {
		w.Write(responseData)
	}
	
	logger.WithFields(logrus.Fields{
		"job_id":  job.ID,
		"case_id": job.CaseID,
		"source":  job.Source,
	}).Info("Document ingest job queued successfully")
}

// Server-Sent Events endpoint for real-time updates
func sseHandler(w http.ResponseWriter, r *http.Request) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Cache-Control")

	// Check if client supports streaming
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Subscribe to Redis Pub/Sub
	pubsub := rdb.Subscribe(ctx, "events:ingest", "events:processing", "events:completed")
	defer pubsub.Close()

	ch := pubsub.Channel()

	// Client disconnect detection
	clientGone := r.Context().Done()
	
	// Send initial connection event
	fmt.Fprintf(w, "event: connected\n")
	fmt.Fprintf(w, "data: {\"message\":\"SSE connection established\",\"timestamp\":\"%s\"}\n\n", time.Now().Format(time.RFC3339))
	flusher.Flush()

	logger.WithField("client_addr", r.RemoteAddr).Info("SSE client connected")

	// Event loop
	for {
		select {
		case msg := <-ch:
			// Forward Redis messages as SSE events
			fmt.Fprintf(w, "event: %s\n", msg.Channel)
			fmt.Fprintf(w, "data: %s\n\n", msg.Payload)
			flusher.Flush()
			
		case <-clientGone:
			logger.WithField("client_addr", r.RemoteAddr).Info("SSE client disconnected")
			return
			
		case <-time.After(30 * time.Second):
			// Send keepalive ping
			fmt.Fprintf(w, "event: ping\n")
			fmt.Fprintf(w, "data: {\"timestamp\":\"%s\"}\n\n", time.Now().Format(time.RFC3339))
			flusher.Flush()
		}
	}
}

// Job status endpoint
func statusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	
	vars := mux.Vars(r)
	jobID := vars["jobId"]
	
	if jobID == "" {
		http.Error(w, `{"error":"job_id required"}`, http.StatusBadRequest)
		return
	}
	
	// Check job status in Redis
	statusKey := "job:status:" + jobID
	status, err := rdb.Get(ctx, statusKey).Result()
	if err == redis.Nil {
		http.Error(w, `{"error":"job not found"}`, http.StatusNotFound)
		return
	} else if err != nil {
		http.Error(w, `{"error":"status check failed"}`, http.StatusInternalServerError)
		return
	}
	
	// Try fast JSON parse, fallback to simple status
	var statusData interface{}
	statusBytes := []byte(status)
	
	if err := fastjson.Unmarshal(statusBytes, &statusData); err != nil {
		statusData = map[string]interface{}{
			"job_id": jobID,
			"status": status,
		}
	}
	
	if responseData, err := fastjson.Marshal(statusData); err != nil {
		logger.WithField("error", err).Error("Failed to marshal status response")
		http.Error(w, `{"error":"marshal failed"}`, http.StatusInternalServerError)
	} else {
		w.Write(responseData)
	}
}

// Utility functions

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getClientID(r *http.Request) string {
	// Try to get client ID from header or generate from IP
	if clientID := r.Header.Get("X-Client-ID"); clientID != "" {
		return clientID
	}
	return fmt.Sprintf("client-%s", r.RemoteAddr)
}

func publishEvent(eventType string, data interface{}) {
	event := SSEEvent{
		Event: eventType,
		Data:  data,
		ID:    fmt.Sprintf("%d", time.Now().UnixNano()),
	}
	
	eventBytes, _ := jsonv2.Marshal(event)
	rdb.Publish(ctx, "events:ingest", eventBytes)
}