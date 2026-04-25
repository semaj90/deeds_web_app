package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"github.com/pgvector/pgvector-go"
)

// Configuration
const (
	MCP_CONTEXT7_ENDPOINT = "http://localhost:4000"
	OLLAMA_URL           = "http://localhost:11434"
	DATABASE_URL         = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	GEMMA_EMBED_MODEL    = "embeddinggemma:latest"
	DOCS_OUTPUT_DIR      = "./docs/context7-library-docs"
)

// Library represents a documentation library to fetch
type Library struct {
	ID     string   `json:"id"`
	Name   string   `json:"name"`
	Topics []string `json:"topics"`
}

// DocResponse represents the response from Context7 MCP server
type DocResponse struct {
	Content  string                 `json:"content"`
	Metadata map[string]interface{} `json:"metadata"`
	Snippets []CodeSnippet         `json:"snippets"`
}

// CodeSnippet represents a code example from documentation
type CodeSnippet struct {
	Title       string `json:"title"`
	Code        string `json:"code"`
	Description string `json:"description"`
}

// DocumentChunk represents a chunk of documentation for embedding
type DocumentChunk struct {
	ID          string    `json:"id"`
	LibraryID   string    `json:"library_id"`
	LibraryName string    `json:"library_name"`
	Topic       string    `json:"topic"`
	Content     string    `json:"content"`
	ChunkIndex  int       `json:"chunk_index"`
	Embedding   []float32 `json:"embedding"`
	Metadata    string    `json:"metadata"`
	CreatedAt   time.Time `json:"created_at"`
}

// OllamaEmbedResponse represents the response from Ollama embedding API
type OllamaEmbedResponse struct {
	Embedding []float32 `json:"embedding"`
}

var libraries = []Library{
	{
		ID:     "typescript",
		Name:   "TypeScript",
		Topics: []string{"types", "interfaces", "generics", "decorators", "modules", "namespaces", "tsconfig"},
	},
	{
		ID:     "webgpu",
		Name:   "WebGPU",
		Topics: []string{"shaders", "buffers", "compute", "rendering", "pipelines", "textures", "wgsl"},
	},
	{
		ID:     "postgresql",
		Name:   "PostgreSQL 17",
		Topics: []string{"jsonb", "indexes", "performance", "replication", "partitioning", "pgvector", "full-text-search"},
	},
	{
		ID:     "drizzle-orm",
		Name:   "Drizzle ORM",
		Topics: []string{"schema", "queries", "migrations", "relations", "transactions", "typescript-integration"},
	},
}

func main() {
	log.Println("🚀 Starting Context7 RAG Pipeline with Gemma Embeddings...")

	// Initialize database
	db, err := initDatabase()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Check services
	if err := checkServices(); err != nil {
		log.Fatalf("Service check failed: %v", err)
	}

	// Create output directory
	if err := os.MkdirAll(DOCS_OUTPUT_DIR, 0755); err != nil {
		log.Fatalf("Failed to create output directory: %v", err)
	}

	// Process each library
	for _, library := range libraries {
		log.Printf("\n📖 Processing %s documentation...\n", library.Name)
		
		// Fetch main documentation
		mainDoc, err := fetchLibraryDocs(library.ID, "")
		if err != nil {
			log.Printf("❌ Failed to fetch main docs for %s: %v", library.Name, err)
			continue
		}

		if mainDoc != nil {
			// Process and store main documentation
			if err := processAndStoreDocument(db, library, "", mainDoc); err != nil {
				log.Printf("❌ Failed to process main docs for %s: %v", library.Name, err)
			}
		}

		// Fetch topic-specific documentation
		for _, topic := range library.Topics {
			topicDoc, err := fetchLibraryDocs(library.ID, topic)
			if err != nil {
				log.Printf("❌ Failed to fetch %s docs for topic %s: %v", library.Name, topic, err)
				continue
			}

			if topicDoc != nil {
				// Process and store topic documentation
				if err := processAndStoreDocument(db, library, topic, topicDoc); err != nil {
					log.Printf("❌ Failed to process %s docs for topic %s: %v", library.Name, topic, err)
				}
			}

			// Add delay to avoid overwhelming the server
			time.Sleep(500 * time.Millisecond)
		}
	}

	log.Println("\n✨ Context7 RAG Pipeline complete!")
	log.Printf("📁 Documentation saved to: %s\n", DOCS_OUTPUT_DIR)
	log.Println("🔍 Embeddings stored in PostgreSQL with pgvector")
}

func initDatabase() (*sql.DB, error) {
	db, err := sql.Open("postgres", DATABASE_URL)
	if err != nil {
		return nil, err
	}

	// Create table for documentation embeddings if not exists
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS context7_documentation (
		id SERIAL PRIMARY KEY,
		doc_id TEXT UNIQUE NOT NULL,
		library_id TEXT NOT NULL,
		library_name TEXT NOT NULL,
		topic TEXT,
		content TEXT NOT NULL,
		chunk_index INTEGER DEFAULT 0,
		embedding vector(768),
		metadata JSONB,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_context7_docs_library ON context7_documentation(library_id);
	CREATE INDEX IF NOT EXISTS idx_context7_docs_topic ON context7_documentation(topic);
	CREATE INDEX IF NOT EXISTS idx_context7_docs_embedding ON context7_documentation 
		USING hnsw (embedding vector_cosine_ops);
	`

	if _, err := db.Exec(createTableSQL); err != nil {
		return nil, fmt.Errorf("failed to create table: %v", err)
	}

	return db, nil
}

func checkServices() error {
	// Check Context7 MCP server
	resp, err := http.Get(MCP_CONTEXT7_ENDPOINT + "/health")
	if err != nil {
		return fmt.Errorf("Context7 MCP server not accessible: %v", err)
	}
	resp.Body.Close()

	// Check Ollama
	resp, err = http.Get(OLLAMA_URL + "/api/tags")
	if err != nil {
		return fmt.Errorf("Ollama not accessible: %v", err)
	}
	resp.Body.Close()

	log.Println("✅ All services are running")
	return nil
}

func fetchLibraryDocs(libraryID, topic string) (*DocResponse, error) {
	log.Printf("📚 Fetching %s documentation%s...", libraryID, func() string {
		if topic != "" {
			return fmt.Sprintf(" for topic: %s", topic)
		}
		return ""
	}())

	payload := map[string]interface{}{
		"name": "get_library_docs",
		"arguments": map[string]interface{}{
			"context7CompatibleLibraryID": libraryID,
			"topic":                        topic,
			"tokens":                       15000,
			"format":                       "markdown",
		},
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", MCP_CONTEXT7_ENDPOINT+"/tools/call", bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Context7-RAG-Pipeline/1.0")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("failed to fetch docs: %s - %s", resp.Status, string(body))
	}

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if success, ok := result["success"].(bool); ok && success {
		if docResult, ok := result["result"].(map[string]interface{}); ok {
			docResponse := &DocResponse{
				Content:  getString(docResult, "content"),
				Metadata: getMap(docResult, "metadata"),
			}
			
			if snippets, ok := docResult["snippets"].([]interface{}); ok {
				for _, s := range snippets {
					if snippet, ok := s.(map[string]interface{}); ok {
						docResponse.Snippets = append(docResponse.Snippets, CodeSnippet{
							Title:       getString(snippet, "title"),
							Code:        getString(snippet, "code"),
							Description: getString(snippet, "description"),
						})
					}
				}
			}
			
			return docResponse, nil
		}
	}

	return nil, fmt.Errorf("no content returned")
}

func generateGemmaEmbedding(text string) ([]float32, error) {
	payload := map[string]interface{}{
		"model":  GEMMA_EMBED_MODEL,
		"prompt": text,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	resp, err := http.Post(OLLAMA_URL+"/api/embeddings", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		// Try fallback models
		for _, fallbackModel := range []string{"embeddinggemma", "nomic-embed-text"} {
			payload["model"] = fallbackModel
			jsonData, _ = json.Marshal(payload)
			resp, err = http.Post(OLLAMA_URL+"/api/embeddings", "application/json", bytes.NewBuffer(jsonData))
			if err == nil {
				break
			}
		}
		if err != nil {
			return nil, fmt.Errorf("failed to generate embedding: %v", err)
		}
	}
	defer resp.Body.Close()

	var embedResponse OllamaEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&embedResponse); err != nil {
		return nil, err
	}

	return embedResponse.Embedding, nil
}

func chunkText(text string, maxChunkSize int) []string {
	if len(text) <= maxChunkSize {
		return []string{text}
	}

	var chunks []string
	lines := strings.Split(text, "\n")
	currentChunk := ""

	for _, line := range lines {
		if len(currentChunk)+len(line)+1 > maxChunkSize && currentChunk != "" {
			chunks = append(chunks, currentChunk)
			currentChunk = line
		} else {
			if currentChunk != "" {
				currentChunk += "\n"
			}
			currentChunk += line
		}
	}

	if currentChunk != "" {
		chunks = append(chunks, currentChunk)
	}

	return chunks
}

func processAndStoreDocument(db *sql.DB, library Library, topic string, doc *DocResponse) error {
	// Save to file
	filename := fmt.Sprintf("%s%s.md", 
		strings.ToLower(strings.ReplaceAll(library.Name, " ", "-")),
		func() string {
			if topic != "" {
				return fmt.Sprintf("-%s", topic)
			}
			return ""
		}())
	
	filepath := filepath.Join(DOCS_OUTPUT_DIR, filename)
	
	content := fmt.Sprintf(`# %s Documentation%s

Generated by Context7 RAG Pipeline on %s

---

%s
`,
		library.Name,
		func() string {
			if topic != "" {
				return fmt.Sprintf(" - %s", topic)
			}
			return ""
		}(),
		time.Now().Format(time.RFC3339),
		doc.Content)

	// Add code snippets if available
	if len(doc.Snippets) > 0 {
		content += "\n## Code Examples\n\n"
		for _, snippet := range doc.Snippets {
			content += fmt.Sprintf("### %s\n\n%s\n\n```typescript\n%s\n```\n\n",
				snippet.Title, snippet.Description, snippet.Code)
		}
	}

	if err := os.WriteFile(filepath, []byte(content), 0644); err != nil {
		return fmt.Errorf("failed to save file: %v", err)
	}

	log.Printf("✅ Saved %s%s documentation to %s", 
		library.Name,
		func() string {
			if topic != "" {
				return fmt.Sprintf(" (%s)", topic)
			}
			return ""
		}(),
		filename)

	// Chunk the content
	chunks := chunkText(doc.Content, 2000)

	// Process each chunk
	for i, chunk := range chunks {
		// Generate embedding using Gemma
		embedding, err := generateGemmaEmbedding(chunk)
		if err != nil {
			log.Printf("⚠️  Failed to generate embedding for chunk %d: %v", i, err)
			continue
		}

		// Create document ID
		docID := fmt.Sprintf("%s_%s_%d", library.ID, topic, i)

		// Prepare metadata
		metadata := map[string]interface{}{
			"library_id":   library.ID,
			"library_name": library.Name,
			"topic":        topic,
			"chunk_index":  i,
			"total_chunks": len(chunks),
			"doc_metadata": doc.Metadata,
		}

		metadataJSON, _ := json.Marshal(metadata)

		// Store in database with pgvector
		query := `
			INSERT INTO context7_documentation 
			(doc_id, library_id, library_name, topic, content, chunk_index, embedding, metadata)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (doc_id) 
			DO UPDATE SET 
				content = EXCLUDED.content,
				embedding = EXCLUDED.embedding,
				metadata = EXCLUDED.metadata,
				updated_at = CURRENT_TIMESTAMP
		`

		_, err = db.Exec(query, 
			docID,
			library.ID,
			library.Name,
			topic,
			chunk,
			i,
			pgvector.NewVector(embedding),
			string(metadataJSON))

		if err != nil {
			log.Printf("❌ Failed to store chunk %d in database: %v", i, err)
			continue
		}

		log.Printf("🔍 Stored chunk %d/%d with Gemma embedding (dimension: %d)", 
			i+1, len(chunks), len(embedding))
	}

	return nil
}

// Helper functions
func getString(m map[string]interface{}, key string) string {
	if val, ok := m[key].(string); ok {
		return val
	}
	return ""
}

func getMap(m map[string]interface{}, key string) map[string]interface{} {
	if val, ok := m[key].(map[string]interface{}); ok {
		return val
	}
	return make(map[string]interface{})
}