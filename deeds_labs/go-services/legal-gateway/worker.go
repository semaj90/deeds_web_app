package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	_ "github.com/jackc/pgx/v5/stdlib"
)

var (
	workerRdb *redis.Client
	workerDB  *sql.DB
	workerCtx = context.Background()
)

// IngestJob represents the job structure from the API gateway
type IngestJob struct {
	ID      string          `json:"id"`
	CaseID  int             `json:"case_id"`
	Sender  string          `json:"sender"`
	Payload json.RawMessage `json:"payload"`
	Created time.Time       `json:"created"`
	Source  string          `json:"source"`
}

// ProcessedDocument represents a document after WASM parsing
type ProcessedDocument struct {
	ID           string   `json:"id"`
	Title        string   `json:"title"`
	Content      string   `json:"content"`
	DocumentType string   `json:"documentType"`
	CaseNumber   string   `json:"caseNumber"`
	Court        string   `json:"court"`
	Date         string   `json:"date"`
	Summary      string   `json:"summary"`
	Citations    []string `json:"citations"`
	Entities     []string `json:"entities"`
	Keywords     []string `json:"keywords"`
	Parties      []string `json:"parties"`
}

// OllamaEmbedRequest represents the request to Ollama embedding API
type OllamaEmbedRequest struct {
	Model string `json:"model"`
	Input string `json:"input"`
}

// OllamaEmbedResponse represents the response from Ollama
type OllamaEmbedResponse struct {
	Model      string      `json:"model"`
	Embeddings [][]float32 `json:"embeddings"`
}

func main() {
	log.Println("🔧 Starting Legal Document Processing Worker...")

	// Initialize Redis
	redisURL := getEnv("REDIS_URL", "redis://127.0.0.1:6379/0")
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatal("Failed to parse Redis URL:", err)
	}
	workerRdb = redis.NewClient(opt)

	// Test Redis connection
	_, err = workerRdb.Ping(workerCtx).Result()
	if err != nil {
		log.Fatal("Failed to connect to Redis:", err)
	}
	log.Println("✅ Worker connected to Redis")

	// Initialize PostgreSQL
	dsn := getEnv("DATABASE_URL", "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable")
	workerDB, err = sql.Open("pgx", dsn)
	if err != nil {
		log.Fatal("Failed to connect to PostgreSQL:", err)
	}
	defer workerDB.Close()

	// Configure connection pool
	workerDB.SetMaxOpenConns(8)
	workerDB.SetMaxIdleConns(2)
	workerDB.SetConnMaxLifetime(1 * time.Hour)

	// Test database connection
	if err := workerDB.Ping(); err != nil {
		log.Fatal("Failed to ping PostgreSQL:", err)
	}
	log.Println("✅ Worker connected to PostgreSQL")

	// Verify pgvector extension
	if err := verifyPgVector(); err != nil {
		log.Printf("⚠️ pgvector verification failed: %v", err)
	} else {
		log.Println("✅ pgvector extension verified")
	}

	log.Println("🚀 Worker ready - waiting for jobs...")

	// Main processing loop
	for {
		// BLPOP waits for jobs with blocking pop
		result, err := workerRdb.BLPop(workerCtx, 0*time.Second, "ingest:jobs").Result()
		if err != nil {
			log.Printf("❌ BLPOP error: %v", err)
			time.Sleep(1 * time.Second)
			continue
		}

		if len(result) < 2 {
			continue
		}

		// Parse job
		var job IngestJob
		if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
			log.Printf("❌ Job unmarshal error: %v", err)
			continue
		}

		// Process job
		processJob(job)
	}
}

func processJob(job IngestJob) {
	log.Printf("🔄 Processing job: %s (case %d)", job.ID, job.CaseID)
	
	// Update job status
	updateJobStatus(job.ID, "processing", map[string]interface{}{
		"stage":      "parsing",
		"started_at": time.Now(),
	})

	// Parse the document payload (assuming it's already processed by WASM)
	var documents []ProcessedDocument
	if err := json.Unmarshal(job.Payload, &documents); err != nil {
		// Try parsing as single document
		var singleDoc ProcessedDocument
		if err := json.Unmarshal(job.Payload, &singleDoc); err != nil {
			log.Printf("❌ Failed to parse job payload: %v", err)
			updateJobStatus(job.ID, "failed", map[string]interface{}{
				"error":      "invalid document format",
				"failed_at": time.Now(),
			})
			return
		}
		documents = []ProcessedDocument{singleDoc}
	}

	log.Printf("📄 Processing %d document(s)", len(documents))

	// Process each document
	for i, doc := range documents {
		if err := processDocument(job, doc, i+1, len(documents)); err != nil {
			log.Printf("❌ Failed to process document %d: %v", i+1, err)
			updateJobStatus(job.ID, "partial_failure", map[string]interface{}{
				"error":           fmt.Sprintf("document %d failed: %v", i+1, err),
				"processed_count": i,
				"total_count":     len(documents),
				"failed_at":      time.Now(),
			})
			continue
		}
		
		// Update progress
		updateJobStatus(job.ID, "processing", map[string]interface{}{
			"stage":           "embedding",
			"processed_count": i + 1,
			"total_count":     len(documents),
			"progress":        float64(i+1) / float64(len(documents)) * 100,
		})
	}

	// Mark job as completed
	updateJobStatus(job.ID, "completed", map[string]interface{}{
		"processed_count": len(documents),
		"total_count":     len(documents),
		"completed_at":   time.Now(),
	})

	publishEvent("events:completed", map[string]interface{}{
		"job_id":         job.ID,
		"case_id":        job.CaseID,
		"document_count": len(documents),
		"completed_at":   time.Now(),
	})

	log.Printf("✅ Job completed: %s", job.ID)
}

func processDocument(job IngestJob, doc ProcessedDocument, docIndex, totalDocs int) error {
	// Store message/document in database
	var messageID int64
	content := doc.Content
	if content == "" {
		content = doc.Summary
	}

	err := workerDB.QueryRow(
		`INSERT INTO messages (case_id, sender, content, created_at) 
		 VALUES ($1, $2, $3, $4) 
		 RETURNING id`,
		job.CaseID, job.Sender, content, job.Created,
	).Scan(&messageID)

	if err != nil {
		return fmt.Errorf("failed to insert message: %w", err)
	}

	log.Printf("💾 Stored document in messages table: ID %d", messageID)

	// Generate embeddings for the content
	embedding, model, err := generateEmbedding(content)
	if err != nil {
		return fmt.Errorf("failed to generate embedding: %w", err)
	}

	log.Printf("🧠 Generated %dD embedding using model: %s", len(embedding), model)

	// Store embedding in pgvector table
	_, err = workerDB.Exec(
		`INSERT INTO message_embeddings (message_id, model, embedding, created_at)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (message_id, model) 
		 DO UPDATE SET embedding = EXCLUDED.embedding, created_at = EXCLUDED.created_at`,
		messageID, model, pgVector(embedding), time.Now(),
	)

	if err != nil {
		return fmt.Errorf("failed to store embedding: %w", err)
	}

	// Cache document in Redis for quick access
	docCache := map[string]interface{}{
		"id":            messageID,
		"content":       content,
		"document_type": doc.DocumentType,
		"title":         doc.Title,
		"keywords":      doc.Keywords,
		"entities":      doc.Entities,
		"cached_at":     time.Now(),
	}

	cacheKey := fmt.Sprintf("message:%d", messageID)
	cacheBytes, _ := json.Marshal(docCache)
	workerRdb.Set(workerCtx, cacheKey, cacheBytes, 24*time.Hour)

	// Publish processing event
	publishEvent("events:processing", map[string]interface{}{
		"job_id":        job.ID,
		"message_id":    messageID,
		"document_type": doc.DocumentType,
		"title":         doc.Title,
		"progress":      fmt.Sprintf("%d/%d", docIndex, totalDocs),
		"embedding_dim": len(embedding),
		"model":         model,
	})

	return nil
}

func generateEmbedding(text string) ([]float32, string, error) {
	// Use Ollama embedding service (adjust URL as needed)
	ollamaURL := getEnv("OLLAMA_URL", "http://localhost:11434")
	embeddingURL := ollamaURL + "/api/embed"

	// Try Gemma embedding first, fallback to nomic-embed-text
	models := []string{"embeddinggemma:latest", "nomic-embed-text:latest"}
	
	for _, model := range models {
		request := OllamaEmbedRequest{
			Model: model,
			Input: text,
		}

		reqBytes, err := json.Marshal(request)
		if err != nil {
			continue
		}

		resp, err := http.Post(embeddingURL, "application/json", bytes.NewReader(reqBytes))
		if err != nil {
			log.Printf("⚠️ Failed to call %s: %v", model, err)
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()

		if err != nil {
			continue
		}

		if resp.StatusCode != 200 {
			log.Printf("⚠️ Embedding API error for %s: %d", model, resp.StatusCode)
			continue
		}

		var embedResponse OllamaEmbedResponse
		if err := json.Unmarshal(body, &embedResponse); err != nil {
			continue
		}

		if len(embedResponse.Embeddings) > 0 && len(embedResponse.Embeddings[0]) > 0 {
			return embedResponse.Embeddings[0], model, nil
		}
	}

	return nil, "", fmt.Errorf("all embedding models failed")
}

func verifyPgVector() error {
	var version string
	err := workerDB.QueryRow("SELECT extversion FROM pg_extension WHERE extname = 'vector'").Scan(&version)
	if err != nil {
		return fmt.Errorf("pgvector extension not found: %w", err)
	}
	log.Printf("📊 pgvector version: %s", version)
	return nil
}

func updateJobStatus(jobID string, status string, data map[string]interface{}) {
	statusData := map[string]interface{}{
		"job_id":     jobID,
		"status":     status,
		"updated_at": time.Now(),
	}
	
	// Merge additional data
	for k, v := range data {
		statusData[k] = v
	}
	
	statusBytes, _ := json.Marshal(statusData)
	statusKey := "job:status:" + jobID
	
	// Store with 24 hour expiry
	workerRdb.Set(workerCtx, statusKey, statusBytes, 24*time.Hour)
}

func publishEvent(channel string, data interface{}) {
	eventBytes, _ := json.Marshal(data)
	workerRdb.Publish(workerCtx, channel, eventBytes)
}

func pgVector(embedding []float32) string {
	// Convert float32 slice to PostgreSQL vector format
	var builder strings.Builder
	builder.WriteString("[")
	for i, val := range embedding {
		if i > 0 {
			builder.WriteString(",")
		}
		builder.WriteString(fmt.Sprintf("%g", val))
	}
	builder.WriteString("]")
	return builder.String()
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}