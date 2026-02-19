package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/jackc/pgx/v5/pgxpool"
	qdrant "github.com/qdrant/go-client/qdrant"
)

// Phase 87: Knowledge Plane Service
// Unified RAG+KAG retrieval, graph expansion, and prompt assembly
// Port: 8765

type Config struct {
	Port           string
	DatabaseURL    string
	QdrantURL      string
	RedisURL       string
	OllamaURL      string
	EmbeddingModel string
	LLMModel       string
}

type KnowledgePlane struct {
	config      Config
	db          *pgxpool.Pool
	qdrant      *qdrant.Client
	redis       *redis.Client
	datasetFile *os.File
}

// RetrieveRequest - RAG+KAG retrieval input
type RetrieveRequest struct {
	Query   string   `json:"query"`
	K       int      `json:"k"`
	Filters []string `json:"filters"`
	Mode    string   `json:"mode"` // "rag", "kag", "hybrid"
}

// RetrieveResponse - contexts with provenance
type RetrieveResponse struct {
	Contexts []Context `json:"contexts"`
	Latency  int64     `json:"latency_ms"`
}

type Context struct {
	Text       string            `json:"text"`
	Source     string            `json:"source"`
	Score      float64           `json:"score"`
	Collection string            `json:"collection"`
	Metadata   map[string]string `json:"metadata"`
}

// ExpandRequest - KAG graph expansion
type ExpandRequest struct {
	SeedIDs   []string `json:"seed_ids"`
	Depth     int      `json:"depth"`
	EdgeTypes []string `json:"edge_types"`
	K         int      `json:"k"`
}

// ExpandResponse - nodes + edges
type ExpandResponse struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
	Paths []Path `json:"paths"`
}

type Node struct {
	ID   string            `json:"id"`
	Type string            `json:"type"`
	Data map[string]string `json:"data"`
}

type Edge struct {
	From   string  `json:"from"`
	To     string  `json:"to"`
	Type   string  `json:"type"`
	Weight float64 `json:"weight"`
}

type Path struct {
	Nodes       []string `json:"nodes"`
	Edges       []string `json:"edges"`
	Explanation string   `json:"explanation"`
}

// ComposePromptRequest - assemble ACE prompt pack
type ComposePromptRequest struct {
	ErrorID      int      `json:"error_id"`
	FileSnippet  string   `json:"file_snippet"`
	RetrievedIDs []string `json:"retrieved_ids"`
	GraphNodes   []string `json:"graph_nodes"`
}

// ComposePromptResponse - ready prompt pack
type ComposePromptResponse struct {
	SystemPrompt   string            `json:"system_prompt"`
	ToolHints      []string          `json:"tool_hints"`
	Constraints    map[string]string `json:"constraints"`
	TargetSnippet  string            `json:"target_snippet"`
	SuggestedDiff  string            `json:"suggested_diff_shape"`
	PromptPackHash string            `json:"prompt_pack_hash"`
}

// RunLogRequest - store fix attempt
type RunLogRequest struct {
	PromptPackHash string   `json:"prompt_pack_hash"`
	RetrievedIDs   []string `json:"retrieved_ids"`
	Diff           string   `json:"diff"`
	ValidationDiff int      `json:"validation_diff"` // tsc error delta
	Outcome        string   `json:"outcome"`          // "success", "failed", "degraded"
}

func main() {
	config := Config{
		Port:           getEnv("KNOWLEDGE_PLANE_PORT", "8765"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:5434/legal"),
		QdrantURL:      getEnv("QDRANT_URL", "http://127.0.0.1:6333"),
		RedisURL:       getEnv("REDIS_URL", "redis://127.0.0.1:6379"),
		OllamaURL:      getEnv("OLLAMA_URL", "http://127.0.0.1:11434"),
		EmbeddingModel: getEnv("EMBEDDING_MODEL", "embeddinggemma:latest"),
		LLMModel:       getEnv("LLM_MODEL", "gemma3-legal:latest"),
	}

	kp, err := NewKnowledgePlane(config)
	if err != nil {
		log.Fatal("Failed to initialize Knowledge Plane:", err)
	}
	defer kp.Close()

	http.HandleFunc("/retrieve", kp.HandleRetrieve)
	http.HandleFunc("/expand", kp.HandleExpand)
	http.HandleFunc("/compose_prompt", kp.HandleComposePrompt)
	http.HandleFunc("/runs", kp.HandleRuns)
	http.HandleFunc("/health", kp.HandleHealth)

	log.Printf("🚀 Knowledge Plane Service Running on port %s\n", config.Port)
	log.Printf("📊 DATABASE_URL: %s\n", config.DatabaseURL)
	log.Printf("🔍 Qdrant: %s\n", config.QdrantURL)
	log.Printf("💾 Redis: %s\n", config.RedisURL)
	log.Fatal(http.ListenAndServe(":"+config.Port, nil))
}

func NewKnowledgePlane(config Config) (*KnowledgePlane, error) {
	ctx := context.Background()

	// PostgreSQL
	dbPool, err := pgxpool.New(ctx, config.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("postgres connection failed: %w", err)
	}

	// Verify DB
	var serverIP, currentUser, currentDB string
	err = dbPool.QueryRow(ctx, "SELECT inet_server_addr()::text, current_user, current_database()").Scan(&serverIP, &currentUser, &currentDB)
	if err != nil {
		return nil, fmt.Errorf("DB verification failed: %w", err)
	}
	log.Printf("✅ Postgres: %s@%s (%s)\n", currentUser, currentDB, serverIP)

	// Qdrant (placeholder - add qdrant-go-client)
	// qdrantClient, err := qdrant.NewClient(config.QdrantURL)

	// Redis
	opt, err := redis.ParseURL(config.RedisURL)
	if err != nil {
		return nil, fmt.Errorf("redis URL parse failed: %w", err)
	}
	redisClient := redis.NewClient(opt)
	if err := redisClient.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis connection failed: %w", err)
	}
	log.Printf("✅ Redis connected\n")

	// Open JSONL dataset file for ACE training data
	datasetFile, err := os.OpenFile("reports/phase87-ace-dataset.jsonl", os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open dataset file: %w", err)
	}
	log.Printf("📝 Dataset logging: reports/phase87-ace-dataset.jsonl\n")

	return &KnowledgePlane{
		config:      config,
		db:          dbPool,
		redis:       redisClient,
		datasetFile: datasetFile,
	}, nil
}

func (kp *KnowledgePlane) Close() {
	kp.db.Close()
	kp.redis.Close()
	kp.datasetFile.Close()
}

// HandleRetrieve - RAG+KAG retrieval
func (kp *KnowledgePlane) HandleRetrieve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RetrieveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	start := time.Now()

	// TODO: Implement retrieval pipeline:
	// 1. Get embedding via Ollama
	// 2. Query pgvector HNSW
	// 3. Query Qdrant collections
	// 4. RRF fusion + rerank
	// 5. Cache in Redis

	contexts := []Context{
		{
			Text:       "Placeholder context from pgvector",
			Source:     "postgresql://error_embeddings",
			Score:      0.92,
			Collection: "error_embeddings",
			Metadata:   map[string]string{"error_code": "TS1005"},
		},
	}

	latency := time.Since(start).Milliseconds()

	// Log to dataset
	kp.LogDataset(map[string]interface{}{
		"timestamp":  time.Now().Unix(),
		"endpoint":   "/retrieve",
		"request":    req,
		"response":   contexts,
		"latency_ms": latency,
	})

	json.NewEncoder(w).Encode(RetrieveResponse{
		Contexts: contexts,
		Latency:  latency,
	})
}

// HandleExpand - KAG graph expansion
func (kp *KnowledgePlane) HandleExpand(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ExpandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// TODO: Query CouchDB edges view or Neo4j
	// For now, stub response

	nodes := []Node{
		{ID: "error_408", Type: "error", Data: map[string]string{"code": "TS1005"}},
	}
	edges := []Edge{
		{From: "error_408", To: "pattern_spread_colon", Type: "matches", Weight: 0.89},
	}

	json.NewEncoder(w).Encode(ExpandResponse{
		Nodes: nodes,
		Edges: edges,
		Paths: []Path{},
	})
}

// HandleComposePrompt - assemble ACE prompt pack
func (kp *KnowledgePlane) HandleComposePrompt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ComposePromptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// TODO: Assemble prompt from retrieved contexts + graph + file snippet

	response := ComposePromptResponse{
		SystemPrompt:   "You are a TypeScript error fixing expert.",
		ToolHints:      []string{"use spread operator fix pattern"},
		Constraints:    map[string]string{"max_lines_changed": "30"},
		TargetSnippet:  req.FileSnippet,
		SuggestedDiff:  "Replace { ...obj: val } with { ...obj, key: val }",
		PromptPackHash: "sha256:abc123",
	}

	// Log to dataset
	kp.LogDataset(map[string]interface{}{
		"timestamp": time.Now().Unix(),
		"endpoint":  "/compose_prompt",
		"request":   req,
		"response":  response,
	})

	json.NewEncoder(w).Encode(response)
}

// HandleRuns - log fix attempt
func (kp *KnowledgePlane) HandleRuns(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RunLogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// TODO: Store in CouchDB runs database

	// Log to JSONL dataset
	kp.LogDataset(map[string]interface{}{
		"timestamp":        time.Now().Unix(),
		"endpoint":         "/runs",
		"prompt_pack_hash": req.PromptPackHash,
		"retrieved_ids":    req.RetrievedIDs,
		"diff":             req.Diff,
		"validation_diff":  req.ValidationDiff,
		"outcome":          req.Outcome,
	})

	json.NewEncoder(w).Encode(map[string]string{
		"status": "logged",
		"run_id": fmt.Sprintf("run_%d", time.Now().Unix()),
	})
}

// HandleHealth - health check with DB identity
func (kp *KnowledgePlane) HandleHealth(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	var serverIP, currentUser, currentDB string
	err := kp.db.QueryRow(ctx, "SELECT inet_server_addr()::text, current_user, current_database()").Scan(&serverIP, &currentUser, &currentDB)

	health := map[string]interface{}{
		"status":    "ok",
		"timestamp": time.Now().Unix(),
	}

	if err != nil {
		health["status"] = "degraded"
		health["db_error"] = err.Error()
	} else {
		health["database"] = map[string]string{
			"server_ip":        serverIP,
			"current_user":     currentUser,
			"current_database": currentDB,
		}
	}

	json.NewEncoder(w).Encode(health)
}

// LogDataset - append to JSONL for ACE training
func (kp *KnowledgePlane) LogDataset(data map[string]interface{}) {
	line, err := json.Marshal(data)
	if err != nil {
		log.Printf("❌ Failed to marshal dataset entry: %v\n", err)
		return
	}
	fmt.Fprintln(kp.datasetFile, string(line))
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
