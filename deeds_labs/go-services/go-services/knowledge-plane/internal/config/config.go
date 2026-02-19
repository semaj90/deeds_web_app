package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

type Config struct {
	Port              int
	DatabaseURL       string
	QdrantURL         string
	QdrantCollection  string
	RedisURL          string
	OllamaURL         string
	OllamaEmbedModel  string
	OllamaChatModel   string
	CouchDBURL        string
	CouchDBAnalysisDB string
	CouchDBEdgeDB     string
	MinIOEndpoint     string
	MinIOAccessKey    string
	MinIOSecretKey    string

	// Performance tuning
	RAGTopK            int
	KAGDepth           int
	KAGLimit           int
	CacheEmbeddingTTL  int
	CacheRetrievalTTL  int
	CacheContextTTL    int
	HybridWeightPG     float64
	HybridWeightQdrant float64
}

func Load() (*Config, error) {
	// Load .env.phase87 first, fallback to .env
	if err := godotenv.Load("../../.env.phase87"); err != nil {
		if err := godotenv.Load("../../.env"); err != nil {
			fmt.Println("⚠️  No .env file found, using environment variables")
		}
	}

	cfg := &Config{
		Port:              getEnvInt("KNOWLEDGE_PLANE_PORT", 8099),
		DatabaseURL:       getEnv("DATABASE_URL", "postgresql://user:pass@127.0.0.1:5434/legal"),
		QdrantURL:         getEnv("QDRANT_URL", "http://127.0.0.1:6333"),
		QdrantCollection:  getEnv("QDRANT_COLLECTION", "phase76_knowledge_base"),
		RedisURL:          getEnv("REDIS_URL", "redis://127.0.0.1:6379"),
		OllamaURL:         getEnv("OLLAMA_URL", "http://127.0.0.1:11434"),
		OllamaEmbedModel:  getEnv("OLLAMA_EMBED_MODEL", "embeddinggemma:latest"),
		OllamaChatModel:   getEnv("OLLAMA_CHAT_MODEL", "gemma3-legal:latest"),
		CouchDBURL:        getEnv("COUCHDB_URL", "http://admin:legal_ai_pass@127.0.0.1:5984"),
		CouchDBAnalysisDB: getEnv("COUCHDB_ANALYSIS_DB", "error_analysis_kb"),
		CouchDBEdgeDB:     getEnv("COUCHDB_EDGE_DB", "knowledge_graph_edges"),
		MinIOEndpoint:     getEnv("MINIO_ENDPOINT", "127.0.0.1:9000"),
		MinIOAccessKey:    getEnv("MINIO_ACCESS_KEY", "minioadmin"),
		MinIOSecretKey:    getEnv("MINIO_SECRET_KEY", "minioadmin"),

		RAGTopK:            getEnvInt("RAG_TOP_K", 8),
		KAGDepth:           getEnvInt("KAG_DEPTH", 2),
		KAGLimit:           getEnvInt("KAG_LIMIT", 50),
		CacheEmbeddingTTL:  getEnvInt("CACHE_EMBEDDING_TTL", 86400),
		CacheRetrievalTTL:  getEnvInt("CACHE_RETRIEVAL_TTL", 3600),
		CacheContextTTL:    getEnvInt("CACHE_CONTEXT_TTL", 1800),
		HybridWeightPG:     getEnvFloat("HYBRID_WEIGHT_PG", 0.4),
		HybridWeightQdrant: getEnvFloat("HYBRID_WEIGHT_QDRANT", 0.6),
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return fallback
}

func getEnvFloat(key string, fallback float64) float64 {
	if value := os.Getenv(key); value != "" {
		if floatVal, err := strconv.ParseFloat(value, 64); err == nil {
			return floatVal
		}
	}
	return fallback
}
