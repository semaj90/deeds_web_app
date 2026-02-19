package types

import (
	"os"
	"time"
)

// ServiceEndpoint represents a network service endpoint configuration
type ServiceEndpoint struct {
	Host     string            `json:"host"`
	Port     int               `json:"port"`
	Protocol string            `json:"protocol"`
	Path     string            `json:"path,omitempty"`
	Headers  map[string]string `json:"headers,omitempty"`
	Timeout  time.Duration     `json:"timeout,omitempty"`
}

// VectorDatabase represents a vector database configuration and operations
type VectorDatabase struct {
	Host       string            `json:"host"`
	Port       int               `json:"port"`
	Database   string            `json:"database"`
	Collection string            `json:"collection"`
	Dimension  int               `json:"dimension"`
	IndexType  string            `json:"index_type"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

// ProcessingJob represents a background processing job
type ProcessingJob struct {
	ID          string                 `json:"id"`
	Type        string                 `json:"type"`
	Status      string                 `json:"status"`
	Priority    int                    `json:"priority"`
	Payload     map[string]interface{} `json:"payload"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	CompletedAt *time.Time             `json:"completed_at,omitempty"`
	ErrorMsg    string                 `json:"error_msg,omitempty"`
}

// KnowledgeGraphStats represents statistics for knowledge graph operations
type KnowledgeGraphStats struct {
	NodeCount        int64             `json:"node_count"`
	EdgeCount        int64             `json:"edge_count"`
	QueryCount       int64             `json:"query_count"`
	AvgQueryTime     time.Duration     `json:"avg_query_time"`
	LastUpdated      time.Time         `json:"last_updated"`
	IndexStats       map[string]int64  `json:"index_stats"`
	PerformanceStats map[string]string `json:"performance_stats"`
}

// Common utility functions

// GetEnv returns environment variable value or default
func GetEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}