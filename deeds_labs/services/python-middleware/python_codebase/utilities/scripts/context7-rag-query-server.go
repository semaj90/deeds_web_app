package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	_ "github.com/lib/pq"
	"github.com/pgvector/pgvector-go"
)

const (
	PORT         = ":8090"
	DATABASE_URL = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	OLLAMA_URL   = "http://localhost:11434"
)

type QueryRequest struct {
	Query     string `json:"query"`
	Library   string `json:"library,omitempty"`
	Topic     string `json:"topic,omitempty"`
	Limit     int    `json:"limit,omitempty"`
	Threshold float64 `json:"threshold,omitempty"`
}

type QueryResponse struct {
	Query   string         `json:"query"`
	Results []SearchResult `json:"results"`
	Count   int           `json:"count"`
}

type SearchResult struct {
	DocID       string                 `json:"doc_id"`
	LibraryName string                 `json:"library_name"`
	Topic       string                 `json:"topic"`
	Content     string                 `json:"content"`
	Score       float64                `json:"score"`
	Metadata    map[string]interface{} `json:"metadata"`
}

var db *sql.DB

func main() {
	var err error
	
	// Initialize database connection
	db, err = sql.Open("postgres", DATABASE_URL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Setup HTTP routes
	http.HandleFunc("/api/rag/search", handleSearch)
	http.HandleFunc("/api/rag/libraries", handleListLibraries)
	http.HandleFunc("/api/rag/topics", handleListTopics)
	http.HandleFunc("/health", handleHealth)

	// Enable CORS for development
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		http.NotFound(w, r)
	})

	log.Printf("🚀 Context7 RAG Query Server running on port %s", PORT)
	log.Fatal(http.ListenAndServe(PORT, nil))
}

func handleSearch(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Set defaults
	if req.Limit == 0 {
		req.Limit = 10
	}
	if req.Threshold == 0 {
		req.Threshold = 0.7
	}

	// Generate embedding for query using Gemma
	embedding, err := generateEmbedding(req.Query)
	if err != nil {
		log.Printf("Failed to generate embedding: %v", err)
		http.Error(w, "Failed to process query", http.StatusInternalServerError)
		return
	}

	// Build the query
	query := `
		SELECT 
			doc_id,
			library_name,
			topic,
			content,
			1 - (embedding <=> $1) as score,
			metadata
		FROM context7_documentation
		WHERE 1=1
	`
	
	args := []interface{}{pgvector.NewVector(embedding)}
	argCount := 1

	if req.Library != "" {
		argCount++
		query += fmt.Sprintf(" AND library_id = $%d", argCount)
		args = append(args, req.Library)
	}

	if req.Topic != "" {
		argCount++
		query += fmt.Sprintf(" AND topic = $%d", argCount)
		args = append(args, req.Topic)
	}

	query += fmt.Sprintf(`
		AND 1 - (embedding <=> $1) > $%d
		ORDER BY score DESC
		LIMIT $%d
	`, argCount+1, argCount+2)
	
	args = append(args, req.Threshold, req.Limit)

	// Execute query
	rows, err := db.Query(query, args...)
	if err != nil {
		log.Printf("Database query failed: %v", err)
		http.Error(w, "Search failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var results []SearchResult
	for rows.Next() {
		var result SearchResult
		var metadataJSON string
		var topic sql.NullString
		
		err := rows.Scan(
			&result.DocID,
			&result.LibraryName,
			&topic,
			&result.Content,
			&result.Score,
			&metadataJSON,
		)
		if err != nil {
			log.Printf("Failed to scan row: %v", err)
			continue
		}

		if topic.Valid {
			result.Topic = topic.String
		}

		if metadataJSON != "" {
			json.Unmarshal([]byte(metadataJSON), &result.Metadata)
		}

		results = append(results, result)
	}

	response := QueryResponse{
		Query:   req.Query,
		Results: results,
		Count:   len(results),
	}

	json.NewEncoder(w).Encode(response)
}

func handleListLibraries(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	query := `
		SELECT DISTINCT library_id, library_name, COUNT(*) as doc_count
		FROM context7_documentation
		GROUP BY library_id, library_name
		ORDER BY library_name
	`

	rows, err := db.Query(query)
	if err != nil {
		http.Error(w, "Failed to list libraries", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type LibraryInfo struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		DocCount int    `json:"doc_count"`
	}

	var libraries []LibraryInfo
	for rows.Next() {
		var lib LibraryInfo
		if err := rows.Scan(&lib.ID, &lib.Name, &lib.DocCount); err != nil {
			continue
		}
		libraries = append(libraries, lib)
	}

	json.NewEncoder(w).Encode(libraries)
}

func handleListTopics(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	libraryID := r.URL.Query().Get("library")
	
	query := `
		SELECT DISTINCT topic, COUNT(*) as doc_count
		FROM context7_documentation
		WHERE topic IS NOT NULL
	`
	
	args := []interface{}{}
	if libraryID != "" {
		query += " AND library_id = $1"
		args = append(args, libraryID)
	}
	
	query += " GROUP BY topic ORDER BY topic"

	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, "Failed to list topics", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type TopicInfo struct {
		Topic    string `json:"topic"`
		DocCount int    `json:"doc_count"`
	}

	var topics []TopicInfo
	for rows.Next() {
		var topic TopicInfo
		if err := rows.Scan(&topic.Topic, &topic.DocCount); err != nil {
			continue
		}
		topics = append(topics, topic)
	}

	json.NewEncoder(w).Encode(topics)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	
	// Check database connection
	if err := db.Ping(); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]string{
			"status": "unhealthy",
			"error":  "Database connection failed",
		})
		return
	}

	// Count documents
	var count int
	db.QueryRow("SELECT COUNT(*) FROM context7_documentation").Scan(&count)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "healthy",
		"documents": count,
		"service":   "Context7 RAG Query Server",
	})
}

func generateEmbedding(text string) ([]float32, error) {
	payload := map[string]interface{}{
		"model":  "embeddinggemma:latest",
		"prompt": text,
	}

	jsonData, _ := json.Marshal(payload)
	resp, err := http.Post(OLLAMA_URL+"/api/embeddings", "application/json", strings.NewReader(string(jsonData)))
	if err != nil {
		// Try fallback models
		for _, model := range []string{"embeddinggemma", "nomic-embed-text"} {
			payload["model"] = model
			jsonData, _ = json.Marshal(payload)
			resp, err = http.Post(OLLAMA_URL+"/api/embeddings", "application/json", strings.NewReader(string(jsonData)))
			if err == nil {
				break
			}
		}
		if err != nil {
			return nil, err
		}
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if embedding, ok := result["embedding"].([]interface{}); ok {
		floats := make([]float32, len(embedding))
		for i, v := range embedding {
			if f, ok := v.(float64); ok {
				floats[i] = float32(f)
			}
		}
		return floats, nil
	}

	return nil, fmt.Errorf("invalid embedding response")
}