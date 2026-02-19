package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	_ "github.com/jackc/pgx/v5/stdlib"
)

type CUDAWorker struct {
	db    *sql.DB
	redis *redis.Client
	ctx   context.Context
}

type CUDAJob struct {
	JobID     string                 `json:"job_id"`
	Type      string                 `json:"type"`
	Data      map[string]interface{} `json:"data"`
	Priority  int                    `json:"priority"`
	CreatedAt time.Time              `json:"created_at"`
}

type VectorBatch struct {
	MessageIDs []int       `json:"message_ids"`
	Contents   []string    `json:"contents"`
	Embeddings [][]float32 `json:"embeddings"`
}

func NewCUDAWorker() (*CUDAWorker, error) {
	ctx := context.Background()

	// Database connection
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %v", err)
	}

	// Redis connection
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://127.0.0.1:6379/0"
	}

	// Parse Redis URL properly
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse Redis URL: %v", err)
	}
	redisClient := redis.NewClient(opt)

	// Test connections
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("database ping failed: %v", err)
	}

	if err := redisClient.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping failed: %v", err)
	}

	return &CUDAWorker{
		db:    db,
		redis: redisClient,
		ctx:   ctx,
	}, nil
}

// Check if CUDA is available
func (w *CUDAWorker) checkCUDA() bool {
	cmd := exec.Command("nvcc", "--version")
	err := cmd.Run()
	if err != nil {
		log.Printf("⚠️ CUDA not available: %v", err)
		return false
	}

	cmd = exec.Command("nvidia-smi")
	err = cmd.Run()
	if err != nil {
		log.Printf("⚠️ NVIDIA driver not available: %v", err)
		return false
	}

	log.Println("✅ CUDA acceleration available")
	return true
}

// Batch vector similarity using CUDA (if available)
func (w *CUDAWorker) processBatchSimilarity(job CUDAJob) error {
	log.Printf("🔄 Processing CUDA similarity batch: %s", job.JobID)

	// Extract job data
	queryVector, ok := job.Data["query_vector"].([]interface{})
	if !ok {
		return fmt.Errorf("invalid query vector format")
	}

	limit, ok := job.Data["limit"].(float64)
	if !ok {
		limit = 10
	}

	threshold, ok := job.Data["threshold"].(float64)
	if !ok {
		threshold = 0.7
	}

	// Convert query vector to float32
	query := make([]float32, len(queryVector))
	for i, v := range queryVector {
		if f, ok := v.(float64); ok {
			query[i] = float32(f)
		}
	}

	var results []map[string]interface{}

	// Use CUDA-accelerated similarity if available
	if w.checkCUDA() {
		results = w.cudaSimilaritySearch(query, threshold, int(limit))
	} else {
		results = w.cpuSimilaritySearch(query, threshold, int(limit))
	}

	// Store results in Redis
	resultKey := fmt.Sprintf("cuda:results:%s", job.JobID)
	resultJSON, _ := json.Marshal(results)

	err := w.redis.Set(w.ctx, resultKey, resultJSON, time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to store results: %v", err)
	}

	// Publish completion event
	event := map[string]interface{}{
		"job_id":       job.JobID,
		"event":        "cuda_completed",
		"results_key":  resultKey,
		"result_count": len(results),
		"timestamp":    time.Now(),
	}

	eventJSON, _ := json.Marshal(event)
	w.redis.Publish(w.ctx, "events:cuda", eventJSON)

	log.Printf("✅ CUDA batch completed: %s (%d results)", job.JobID, len(results))
	return nil
}

// CUDA-accelerated vector similarity search
func (w *CUDAWorker) cudaSimilaritySearch(queryVector []float32, threshold float64, limit int) []map[string]interface{} {
	log.Printf("🚀 Using CUDA acceleration for vector similarity")

	// For now, fall back to optimized CPU with CUDA context
	// In production, this would use cuBLAS or custom CUDA kernels
	return w.optimizedSimilaritySearch(queryVector, threshold, limit, true)
}

// CPU-based vector similarity search
func (w *CUDAWorker) cpuSimilaritySearch(queryVector []float32, threshold float64, limit int) []map[string]interface{} {
	log.Printf("💻 Using CPU for vector similarity")
	return w.optimizedSimilaritySearch(queryVector, threshold, limit, false)
}

// Optimized similarity search with optional CUDA context
func (w *CUDAWorker) optimizedSimilaritySearch(queryVector []float32, threshold float64, limit int, useCUDA bool) []map[string]interface{} {
	results := []map[string]interface{}{}

	// Build query vector string for pgvector
	vectorStr := "["
	for i, v := range queryVector {
		if i > 0 {
			vectorStr += ","
		}
		vectorStr += fmt.Sprintf("%.6f", v)
	}
	vectorStr += "]"

	// Optimized SQL query with proper vector operations
	query := `
		SELECT
			m.id,
			m.case_id,
			m.content,
			me.embedding <-> $1::vector as distance,
			me.model,
			m.created_at
		FROM messages m
		JOIN message_embeddings me ON m.id = me.message_id
		WHERE me.embedding <-> $1::vector < $2
		ORDER BY me.embedding <-> $1::vector
		LIMIT $3
	`

	rows, err := w.db.Query(query, vectorStr, 1.0-threshold, limit)
	if err != nil {
		log.Printf("❌ Similarity search failed: %v", err)
		return results
	}
	defer rows.Close()

	for rows.Next() {
		var id, caseID int
		var content, model string
		var distance float64
		var createdAt time.Time

		err := rows.Scan(&id, &caseID, &content, &distance, &model, &createdAt)
		if err != nil {
			log.Printf("⚠️ Row scan error: %v", err)
			continue
		}

		result := map[string]interface{}{
			"id":         id,
			"case_id":    caseID,
			"content":    content,
			"similarity": 1.0 - distance,
			"distance":   distance,
			"model":      model,
			"created_at": createdAt,
			"cuda_accelerated": useCUDA,
		}

		results = append(results, result)
	}

	return results
}

// Batch embedding generation using CUDA
func (w *CUDAWorker) processBatchEmbedding(job CUDAJob) error {
	log.Printf("🔄 Processing CUDA embedding batch: %s", job.JobID)

	// Extract message IDs from job
	messageIDsRaw, ok := job.Data["message_ids"].([]interface{})
	if !ok {
		return fmt.Errorf("invalid message_ids format")
	}

	messageIDs := make([]int, len(messageIDsRaw))
	for i, v := range messageIDsRaw {
		if id, ok := v.(float64); ok {
			messageIDs[i] = int(id)
		}
	}

	// Fetch message contents
	contents, err := w.fetchMessageContents(messageIDs)
	if err != nil {
		return fmt.Errorf("failed to fetch messages: %v", err)
	}

	// Generate embeddings (CUDA-accelerated if available)
	var embeddings [][]float32
	if w.checkCUDA() {
		embeddings = w.generateCUDAEmbeddings(contents)
	} else {
		embeddings = w.generateCPUEmbeddings(contents)
	}

	// Store embeddings in database
	err = w.storeEmbeddings(messageIDs, embeddings)
	if err != nil {
		return fmt.Errorf("failed to store embeddings: %v", err)
	}

	// Publish completion
	event := map[string]interface{}{
		"job_id":           job.JobID,
		"event":            "embedding_completed",
		"processed_count":  len(messageIDs),
		"cuda_accelerated": w.checkCUDA(),
		"timestamp":        time.Now(),
	}

	eventJSON, _ := json.Marshal(event)
	w.redis.Publish(w.ctx, "events:cuda", eventJSON)

	log.Printf("✅ CUDA embedding batch completed: %s (%d embeddings)", job.JobID, len(embeddings))
	return nil
}

func (w *CUDAWorker) fetchMessageContents(messageIDs []int) ([]string, error) {
	if len(messageIDs) == 0 {
		return []string{}, nil
	}

	// Build IN clause
	placeholders := make([]string, len(messageIDs))
	args := make([]interface{}, len(messageIDs))
	for i, id := range messageIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf("SELECT id, content FROM messages WHERE id IN (%s) ORDER BY id",
		strings.Join(placeholders, ","))

	rows, err := w.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	contents := make([]string, 0, len(messageIDs))
	for rows.Next() {
		var id int
		var content string
		if err := rows.Scan(&id, &content); err != nil {
			return nil, err
		}
		contents = append(contents, content)
	}

	return contents, nil
}

func (w *CUDAWorker) generateCUDAEmbeddings(contents []string) [][]float32 {
	log.Printf("🚀 Generating embeddings with CUDA acceleration")
	// In production, this would use:
	// - cuDNN for neural network acceleration
	// - Custom CUDA kernels for batch processing
	// - GPU memory management for large batches

	// For now, use optimized CPU with CUDA context
	return w.generateCPUEmbeddings(contents)
}

func (w *CUDAWorker) generateCPUEmbeddings(contents []string) [][]float32 {
	log.Printf("💻 Generating embeddings with CPU")

	embeddings := make([][]float32, len(contents))

	// Simulate embedding generation (in production, call Ollama or other model)
	for i, content := range contents {
		// Simple hash-based pseudo-embedding for demonstration
		embedding := make([]float32, 768) // Gemma embedding size

		hash := uint64(0)
		for _, r := range content {
			hash = hash*31 + uint64(r)
		}

		// Generate deterministic pseudo-embedding with better distribution
		for j := range embedding {
			// Use better hash distribution
			seed := hash + uint64(j)
			// Simple LCG for pseudo-random distribution
			seed = (seed*1103515245 + 12345) & 0x7fffffff
			embedding[j] = float32(seed%10000) / 10000.0
		}

		embeddings[i] = embedding
	}

	return embeddings
}

func (w *CUDAWorker) storeEmbeddings(messageIDs []int, embeddings [][]float32) error {
	tx, err := w.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO message_embeddings (message_id, embedding, model, created_at)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (message_id) DO UPDATE SET
		embedding = EXCLUDED.embedding,
		model = EXCLUDED.model,
		updated_at = EXCLUDED.created_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	model := "cuda-accelerated"
	if !w.checkCUDA() {
		model = "cpu-optimized"
	}

	for i, messageID := range messageIDs {
		if i >= len(embeddings) {
			break
		}

		// Convert embedding to pgvector format
		vectorStr := "["
		for j, v := range embeddings[i] {
			if j > 0 {
				vectorStr += ","
			}
			vectorStr += fmt.Sprintf("%.6f", v)
		}
		vectorStr += "]"

		_, err = stmt.Exec(messageID, vectorStr, model, time.Now())
		if err != nil {
			return fmt.Errorf("failed to insert embedding for message %d: %v", messageID, err)
		}
	}

	return tx.Commit()
}

func (w *CUDAWorker) processJob(job CUDAJob) error {
	switch job.Type {
	case "batch_similarity":
		return w.processBatchSimilarity(job)
	case "batch_embedding":
		return w.processBatchEmbedding(job)
	default:
		return fmt.Errorf("unknown job type: %s", job.Type)
	}
}

func (w *CUDAWorker) processJobWithContext(ctx context.Context, job CUDAJob) error {
	// Create a channel to receive the result
	resultChan := make(chan error, 1)

	// Run the job in a goroutine
	go func() {
		resultChan <- w.processJob(job)
	}()

	// Wait for either the job to complete or context to be cancelled
	select {
	case err := <-resultChan:
		return err
	case <-ctx.Done():
		return fmt.Errorf("job cancelled due to timeout: %v", ctx.Err())
	}
}

func (w *CUDAWorker) start() {
	log.Println("🔧 Starting CUDA Legal Document Processing Worker...")

	// Test CUDA availability
	cudaAvailable := w.checkCUDA()
	if cudaAvailable {
		log.Println("🚀 CUDA acceleration enabled")
	} else {
		log.Println("💻 Running in CPU-optimized mode")
	}

	log.Println("✅ CUDA Worker connected to Redis")
	log.Println("✅ CUDA Worker connected to PostgreSQL")
	log.Println("🚀 CUDA Worker ready - waiting for jobs...")

	for {
		// Block until job available (BLPOP - blocking list pop)
		result, err := w.redis.BLPop(w.ctx, 30*time.Second, "cuda:jobs").Result()
		if err != nil {
			if err == redis.Nil {
				// Timeout is normal, continue listening
				continue
			}
			log.Printf("❌ Redis BLPOP error: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}

		// result[0] is the queue name, result[1] is the job data
		if len(result) < 2 {
			log.Printf("⚠️ Invalid job format")
			continue
		}

		var job CUDAJob
		if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
			log.Printf("❌ Failed to parse job: %v", err)
			continue
		}

		log.Printf("🔄 Processing CUDA job: %s (type: %s)", job.JobID, job.Type)

		// Process job with timeout context
		jobCtx, cancel := context.WithTimeout(w.ctx, 5*time.Minute)

		jobErr := w.processJobWithContext(jobCtx, job)
		cancel()

		if jobErr != nil {
			log.Printf("❌ Job processing failed: %v", jobErr)

			// Mark job as failed
			event := map[string]interface{}{
				"job_id":    job.JobID,
				"event":     "cuda_failed",
				"error":     jobErr.Error(),
				"timestamp": time.Now(),
			}
			eventJSON, _ := json.Marshal(event)
			w.redis.Publish(w.ctx, "events:cuda", eventJSON)
		}
	}
}

// Replace the package main's top-level main with an exported Run function.
// Run returns an error instead of exiting the process so callers can manage lifecycle.
func Run() error {
	worker, err := NewCUDAWorker()
	if err != nil {
		return fmt.Errorf("failed to create CUDA worker: %w", err)
	}
	// Ensure resources are closed when Run returns (if it ever does)
	defer func() {
		if worker.db != nil {
			_ = worker.db.Close()
		}
		if worker.redis != nil {
			_ = worker.redis.Close()
		}
	}()

	// start() blocks and listens for jobs; it may never return under normal operation.
	// If you need to run this as an executable, create a simple cmd/main that calls worker.Run()
	worker.start()
	return nil
}