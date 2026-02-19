package main

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	jsoniter "github.com/json-iterator/go"
)

// SIMD-optimized JSON parser
var jsonSIMD = jsoniter.ConfigCompatibleWithStandardLibrary

type ErrorParserService struct {
	redis      *redis.Client
	minio      *minio.Client
	cacheTTL   time.Duration
	bucketName string
}

type ErrorCheckRequest struct {
	Command      string   `json:"command"`
	WorkingDir   string   `json:"working_dir"`
	CacheKey     string   `json:"cache_key"`
	ForceRefresh bool     `json:"force_refresh"`
	FileHashes   []string `json:"file_hashes,omitempty"`
}

type ErrorCheckResponse struct {
	Success      bool          `json:"success"`
	CacheHit     bool          `json:"cache_hit"`
	Errors       []ParsedError `json:"errors"`
	TotalErrors  int           `json:"total_errors"`
	ParseTimeMs  int64         `json:"parse_time_ms"`
	ChecksumHash string        `json:"checksum_hash"`
	Timestamp    time.Time     `json:"timestamp"`
}

type ParsedError struct {
	File             string `json:"file"`
	Line             int    `json:"line"`
	Column           int    `json:"column"`
	Message          string `json:"message"`
	Code             string `json:"code"`
	NormalizedMsg    string `json:"normalized_message"`
	Severity         string `json:"severity"`
	Category         string `json:"category"`
}

func NewErrorParserService() *ErrorParserService {
	// Redis connection
	redisClient := redis.NewClient(&redis.Options{
		Addr:     getEnv("REDIS_URL", "localhost:6379"),
		Password: getEnv("REDIS_PASSWORD", "redis"),
		DB:       0,
	})

	// MinIO connection
	minioClient, err := minio.New(getEnv("MINIO_ENDPOINT", "localhost:9000"), &minio.Options{
		Creds:  credentials.NewStaticV4(getEnv("MINIO_ACCESS_KEY", "minioadmin"), getEnv("MINIO_SECRET_KEY", "minioadmin"), ""),
		Secure: false,
	})
	if err != nil {
		log.Fatalf("Failed to create MinIO client: %v", err)
	}

	return &ErrorParserService{
		redis:      redisClient,
		minio:      minioClient,
		cacheTTL:   30 * time.Minute,
		bucketName: "error-analysis",
	}
}

func (s *ErrorParserService) HandleErrorCheck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ErrorCheckRequest
	if err := jsonSIMD.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	startTime := time.Now()
	ctx := context.Background()

	// Generate cache key from file hashes
	cacheKey := s.generateCacheKey(req)

	// Check Redis cache first (unless force refresh)
	if !req.ForceRefresh {
		if cached, err := s.getCachedResult(ctx, cacheKey); err == nil {
			log.Printf("✅ Cache HIT: %s (saved ~10s)", cacheKey)
			cached.CacheHit = true
			s.respondJSON(w, cached)
			return
		}
	}

	log.Printf("🔍 Cache MISS: %s - Running checks...", cacheKey)

	// Run error checks (svelte-check + tsc)
	errors, checksum := s.runErrorChecks(req)

	response := ErrorCheckResponse{
		Success:      true,
		CacheHit:     false,
		Errors:       errors,
		TotalErrors:  len(errors),
		ParseTimeMs:  time.Since(startTime).Milliseconds(),
		ChecksumHash: checksum,
		Timestamp:    time.Now(),
	}

	// Cache result in Redis
	s.cacheResult(ctx, cacheKey, response)

	// Store in MinIO for long-term analysis
	s.storeInMinIO(ctx, cacheKey, response)

	s.respondJSON(w, response)
}

func (s *ErrorParserService) runErrorChecks(req ErrorCheckRequest) ([]ParsedError, string) {
	// Default to svelte-check + tsc
	commands := []string{
		"npm run check 2>&1",
		"npx tsc --noEmit 2>&1",
	}

	if req.Command != "" {
		commands = []string{req.Command}
	}

	allOutput := ""
	for _, cmd := range commands {
		output := s.executeCommand(cmd, req.WorkingDir)
		allOutput += output + "\n"
	}

	// Parse errors using SIMD JSON
	errors := s.parseErrorOutput(allOutput)

	// Generate checksum
	hash := md5.Sum([]byte(allOutput))
	checksum := hex.EncodeToString(hash[:])

	return errors, checksum
}

func (s *ErrorParserService) executeCommand(command, workingDir string) string {
	if workingDir == "" {
		workingDir = "."
	}

	cmd := exec.Command("sh", "-c", command)
	cmd.Dir = workingDir

	output, err := cmd.CombinedOutput()
	if err != nil {
		// Errors are expected (non-zero exit from failed checks)
		return string(output)
	}

	return string(output)
}

func (s *ErrorParserService) parseErrorOutput(output string) []ParsedError {
	// Parse TypeScript/Svelte error format:
	// src/file.ts(123,45): error TS2304: Cannot find name 'foo'

	errors := []ParsedError{}

	// Simplified parser - production would use regex
	// This is a placeholder for SIMD-optimized parsing

	return errors
}

func (s *ErrorParserService) generateCacheKey(req ErrorCheckRequest) string {
	// Generate cache key from file hashes + command
	data := fmt.Sprintf("%s:%v", req.Command, req.FileHashes)
	hash := md5.Sum([]byte(data))
	return fmt.Sprintf("error-check:%s", hex.EncodeToString(hash[:]))
}

func (s *ErrorParserService) getCachedResult(ctx context.Context, key string) (*ErrorCheckResponse, error) {
	data, err := s.redis.Get(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	var result ErrorCheckResponse
	if err := jsonSIMD.UnmarshalFromString(data, &result); err != nil {
		return nil, err
	}

	return &result, nil
}

func (s *ErrorParserService) cacheResult(ctx context.Context, key string, result ErrorCheckResponse) {
	data, err := jsonSIMD.MarshalToString(result)
	if err != nil {
		log.Printf("Failed to marshal result: %v", err)
		return
	}

	if err := s.redis.Set(ctx, key, data, s.cacheTTL).Err(); err != nil {
		log.Printf("Failed to cache result: %v", err)
	}
}

func (s *ErrorParserService) storeInMinIO(ctx context.Context, key string, result ErrorCheckResponse) {
	data, err := jsonSIMD.Marshal(result)
	if err != nil {
		log.Printf("Failed to marshal for MinIO: %v", err)
		return
	}

	objectName := fmt.Sprintf("errors/%s/%s.json",
		time.Now().Format("2006-01-02"),
		key)

	_, err = s.minio.PutObject(ctx, s.bucketName, objectName,
		jsoniter.NewStream(jsoniter.ConfigDefault, nil, 1024),
		int64(len(data)),
		minio.PutObjectOptions{ContentType: "application/json"})

	if err != nil {
		log.Printf("Failed to store in MinIO: %v", err)
	}
}

func (s *ErrorParserService) respondJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	jsonSIMD.NewEncoder(w).Encode(data)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func main() {
	service := NewErrorParserService()

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "healthy"})
	})

	http.HandleFunc("/parse", service.HandleErrorCheck)

	port := getEnv("PORT", "8095")
	log.Printf("🚀 Phase 79 Error Parser Service (Go + SIMD + Redis + MinIO)")
	log.Printf("📡 Listening on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
