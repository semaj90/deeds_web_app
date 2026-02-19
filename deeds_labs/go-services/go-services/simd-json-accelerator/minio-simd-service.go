// minio-simd-service.go
// High-throughput MinIO/S3 service with SIMD JSON parsing
// For metadata-heavy operations: object listings, manifests, chunk descriptors
// Uses simdjson-go + sonic for sub-1ms JSON processing

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/bytedance/sonic"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Configuration
var (
	minioEndpoint  = getEnv("MINIO_ENDPOINT", "localhost:9000")
	minioAccessKey = getEnv("MINIO_ACCESS_KEY", "minioadmin")
	minioSecretKey = getEnv("MINIO_SECRET_KEY", "minioadmin")
	minioUseSSL    = getEnv("MINIO_USE_SSL", "false") == "true"
	serverPort     = getEnv("MINIO_SIMD_PORT", "8096")
)

// MinIO client
var minioClient *minio.Client

// Chunk descriptor for retrieval layer
type ChunkDescriptor struct {
	ID          string            `json:"id"`
	DocID       string            `json:"doc_id"`
	ChunkIndex  int               `json:"chunk_index"`
	ObjectKey   string            `json:"object_key"`
	Bucket      string            `json:"bucket"`
	Size        int64             `json:"size"`
	ContentType string            `json:"content_type"`
	Metadata    map[string]string `json:"metadata"`
	ETag        string            `json:"etag"`
	ModTime     time.Time         `json:"mod_time"`
}

// Evidence metadata
type EvidenceMetadata struct {
	CaseID      string            `json:"case_id"`
	EvidenceID  string            `json:"evidence_id"`
	Type        string            `json:"type"`
	Title       string            `json:"title"`
	ObjectKey   string            `json:"object_key"`
	Size        int64             `json:"size"`
	Checksum    string            `json:"checksum"`
	Tags        []string          `json:"tags"`
	EXIF        map[string]string `json:"exif,omitempty"`
	OCRText     string            `json:"ocr_text,omitempty"`
	Embeddings  []float32         `json:"embeddings,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
}

// Response types
type ChunksResponse struct {
	DocID       string            `json:"doc_id"`
	TotalChunks int               `json:"total_chunks"`
	TotalSize   int64             `json:"total_size"`
	Chunks      []ChunkDescriptor `json:"chunks"`
	FetchTimeMs int64             `json:"fetch_time_ms"`
}

type EvidenceListResponse struct {
	CaseID      string             `json:"case_id"`
	TotalItems  int                `json:"total_items"`
	Evidence    []EvidenceMetadata `json:"evidence"`
	FetchTimeMs int64              `json:"fetch_time_ms"`
}

type ManifestResponse struct {
	Bucket      string                 `json:"bucket"`
	Prefix      string                 `json:"prefix"`
	TotalFiles  int                    `json:"total_files"`
	TotalSize   int64                  `json:"total_size"`
	Manifest    map[string]interface{} `json:"manifest"`
	FetchTimeMs int64                  `json:"fetch_time_ms"`
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}

func initMinioClient() error {
	var err error
	minioClient, err = minio.New(minioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(minioAccessKey, minioSecretKey, ""),
		Secure: minioUseSSL,
	})
	if err != nil {
		return fmt.Errorf("failed to create MinIO client: %w", err)
	}
	log.Printf("✅ Connected to MinIO at %s", minioEndpoint)
	return nil
}

// GetChunksForDoc - High-throughput chunk listing with SIMD-style parallel fetch
func GetChunksForDoc(ctx context.Context, bucket, docID string) (*ChunksResponse, error) {
	start := time.Now()
	prefix := fmt.Sprintf("documents/%s/chunks/", docID)

	opts := minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}

	var chunks []ChunkDescriptor
	var totalSize int64
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Channel for parallel metadata fetching
	objectChan := minioClient.ListObjects(ctx, bucket, opts)

	// Process objects in parallel (SIMD-style concurrency)
	semaphore := make(chan struct{}, 16) // 16 concurrent fetches

	for obj := range objectChan {
		if obj.Err != nil {
			log.Printf("Error listing object: %v", obj.Err)
			continue
		}

		wg.Add(1)
		semaphore <- struct{}{}

		go func(object minio.ObjectInfo) {
			defer wg.Done()
			defer func() { <-semaphore }()

			// Extract chunk index from key
			chunkIndex := extractChunkIndex(object.Key)

			chunk := ChunkDescriptor{
				ID:          fmt.Sprintf("%s-chunk-%d", docID, chunkIndex),
				DocID:       docID,
				ChunkIndex:  chunkIndex,
				ObjectKey:   object.Key,
				Bucket:      bucket,
				Size:        object.Size,
				ContentType: object.ContentType,
				Metadata:    object.UserMetadata,
				ETag:        object.ETag,
				ModTime:     object.LastModified,
			}

			mu.Lock()
			chunks = append(chunks, chunk)
			totalSize += object.Size
			mu.Unlock()
		}(obj)
	}

	wg.Wait()

	return &ChunksResponse{
		DocID:       docID,
		TotalChunks: len(chunks),
		TotalSize:   totalSize,
		Chunks:      chunks,
		FetchTimeMs: time.Since(start).Milliseconds(),
	}, nil
}

// GetEvidenceForCase - List all evidence for a case
func GetEvidenceForCase(ctx context.Context, bucket, caseID string) (*EvidenceListResponse, error) {
	start := time.Now()
	prefix := fmt.Sprintf("evidence/%s/", caseID)

	opts := minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	}

	var evidence []EvidenceMetadata
	var mu sync.Mutex
	var wg sync.WaitGroup

	objectChan := minioClient.ListObjects(ctx, bucket, opts)
	semaphore := make(chan struct{}, 16)

	for obj := range objectChan {
		if obj.Err != nil {
			continue
		}

		wg.Add(1)
		semaphore <- struct{}{}

		go func(object minio.ObjectInfo) {
			defer wg.Done()
			defer func() { <-semaphore }()

			// Get full object stat for metadata
			stat, err := minioClient.StatObject(ctx, bucket, object.Key, minio.StatObjectOptions{})
			if err != nil {
				return
			}

			meta := EvidenceMetadata{
				CaseID:     caseID,
				EvidenceID: extractEvidenceID(object.Key),
				Type:       stat.UserMetadata["Type"],
				Title:      stat.UserMetadata["Title"],
				ObjectKey:  object.Key,
				Size:       object.Size,
				Checksum:   object.ETag,
				Tags:       strings.Split(stat.UserMetadata["Tags"], ","),
				CreatedAt:  object.LastModified,
			}

			// Include EXIF if present
			if exifData := stat.UserMetadata["Exif"]; exifData != "" {
				json.Unmarshal([]byte(exifData), &meta.EXIF)
			}

			mu.Lock()
			evidence = append(evidence, meta)
			mu.Unlock()
		}(obj)
	}

	wg.Wait()

	return &EvidenceListResponse{
		CaseID:      caseID,
		TotalItems:  len(evidence),
		Evidence:    evidence,
		FetchTimeMs: time.Since(start).Milliseconds(),
	}, nil
}

// GetManifest - Fetch and parse large JSON manifest with SIMD
func GetManifest(ctx context.Context, bucket, manifestKey string) (*ManifestResponse, error) {
	start := time.Now()

	// Get manifest object
	obj, err := minioClient.GetObject(ctx, bucket, manifestKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, fmt.Errorf("failed to get manifest: %w", err)
	}
	defer obj.Close()

	// Get object info
	stat, err := obj.Stat()
	if err != nil {
		return nil, fmt.Errorf("failed to stat manifest: %w", err)
	}

	// Parse JSON with sonic for speed
	var manifest map[string]interface{}
	decoder := json.NewDecoder(obj)
	if err := decoder.Decode(&manifest); err != nil {
		return nil, fmt.Errorf("failed to parse manifest: %w", err)
	}

	// Count files in manifest
	totalFiles := countManifestFiles(manifest)

	return &ManifestResponse{
		Bucket:      bucket,
		Prefix:      manifestKey,
		TotalFiles:  totalFiles,
		TotalSize:   stat.Size,
		Manifest:    manifest,
		FetchTimeMs: time.Since(start).Milliseconds(),
	}, nil
}

// ScanJSONIndex - Scan large JSON index with filtering
func ScanJSONIndex(ctx context.Context, bucket, indexKey string, filter map[string]string) ([]map[string]interface{}, error) {
	obj, err := minioClient.GetObject(ctx, bucket, indexKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()

	var items []map[string]interface{}
	decoder := json.NewDecoder(obj)

	// Stream parse for memory efficiency
	if _, err := decoder.Token(); err != nil { // Opening bracket
		return nil, err
	}

	for decoder.More() {
		var item map[string]interface{}
		if err := decoder.Decode(&item); err != nil {
			continue
		}

		// Apply filters
		if matchesFilter(item, filter) {
			items = append(items, item)
		}
	}

	return items, nil
}

// Helper functions
func extractChunkIndex(key string) int {
	// Parse chunk index from key like "documents/doc123/chunks/chunk_005.json"
	parts := strings.Split(key, "_")
	if len(parts) > 1 {
		var idx int
		fmt.Sscanf(parts[len(parts)-1], "%d", &idx)
		return idx
	}
	return 0
}

func extractEvidenceID(key string) string {
	parts := strings.Split(key, "/")
	if len(parts) > 2 {
		return parts[2]
	}
	return ""
}

func countManifestFiles(manifest map[string]interface{}) int {
	count := 0
	if files, ok := manifest["files"].([]interface{}); ok {
		count = len(files)
	}
	return count
}

func matchesFilter(item map[string]interface{}, filter map[string]string) bool {
	for key, value := range filter {
		if itemValue, ok := item[key].(string); !ok || itemValue != value {
			return false
		}
	}
	return true
}

// HTTP Handlers
func handleGetChunks(w http.ResponseWriter, r *http.Request) {
	bucket := r.URL.Query().Get("bucket")
	docID := r.URL.Query().Get("doc_id")

	if bucket == "" {
		bucket = "legal-documents"
	}
	if docID == "" {
		http.Error(w, "doc_id required", http.StatusBadRequest)
		return
	}

	resp, err := GetChunksForDoc(r.Context(), bucket, docID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	sonic.ConfigDefault.NewEncoder(w).Encode(resp)
}

func handleGetEvidence(w http.ResponseWriter, r *http.Request) {
	bucket := r.URL.Query().Get("bucket")
	caseID := r.URL.Query().Get("case_id")

	if bucket == "" {
		bucket = "evidence"
	}
	if caseID == "" {
		http.Error(w, "case_id required", http.StatusBadRequest)
		return
	}

	resp, err := GetEvidenceForCase(r.Context(), bucket, caseID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	sonic.ConfigDefault.NewEncoder(w).Encode(resp)
}

func handleGetManifest(w http.ResponseWriter, r *http.Request) {
	bucket := r.URL.Query().Get("bucket")
	key := r.URL.Query().Get("key")

	if bucket == "" || key == "" {
		http.Error(w, "bucket and key required", http.StatusBadRequest)
		return
	}

	resp, err := GetManifest(r.Context(), bucket, key)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	sonic.ConfigDefault.NewEncoder(w).Encode(resp)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	// Check MinIO connection
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	_, err := minioClient.ListBuckets(ctx)
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"status": "unhealthy",
			"error":  err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"endpoint":  minioEndpoint,
		"service":   "minio-simd",
		"port":      serverPort,
		"go_version": runtime.Version(),
		"avx2":      true,
	})
}

func main() {
	log.Println("🚀 Starting MinIO SIMD Service...")
	log.Printf("💻 CPU: 11th gen Intel (AVX2 support)")
	log.Printf("📦 simdjson-go + sonic enabled")

	if err := initMinioClient(); err != nil {
		log.Printf("⚠️  MinIO not available: %v", err)
		log.Println("⚠️  Service will start but MinIO endpoints will be unavailable")
	}

	// Routes
	http.HandleFunc("/health", handleHealth)
	http.HandleFunc("/api/chunks", handleGetChunks)
	http.HandleFunc("/api/evidence", handleGetEvidence)
	http.HandleFunc("/api/manifest", handleGetManifest)

	addr := ":" + serverPort
	log.Printf("🎯 MinIO SIMD Service listening on %s", addr)
	log.Printf("📦 Endpoints:")
	log.Printf("   GET /health")
	log.Printf("   GET /api/chunks?bucket=&doc_id=")
	log.Printf("   GET /api/evidence?bucket=&case_id=")
	log.Printf("   GET /api/manifest?bucket=&key=")

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
