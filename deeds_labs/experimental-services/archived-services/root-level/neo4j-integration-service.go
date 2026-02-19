//go:build archived
// +build archived

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/rs/cors"
)

// Neo4j Knowledge Graph Service
// Complements PostgreSQL+pgvector with graph relationships
// Port 8102 - Neo4j Graph Database Integration

type Neo4jService struct {
	driver neo4j.DriverWithContext
	logger *log.Logger
}

type LegalEntity struct {
	ID         string                 `json:"id"`
	Type       string                 `json:"type"`       // COURT, STATUTE, CASE, PARTY, CONCEPT
	Name       string                 `json:"name"`
	Attributes map[string]interface{} `json:"attributes"`
	CreatedAt  time.Time              `json:"created_at"`
}

type LegalRelationship struct {
	ID         string                 `json:"id"`
	FromEntity string                 `json:"from_entity"`
	ToEntity   string                 `json:"to_entity"`
	Type       string                 `json:"type"`       // CITES, OVERRULES, REFERENCES, GOVERNS
	Weight     float64                `json:"weight"`
	Attributes map[string]interface{} `json:"attributes"`
	CreatedAt  time.Time              `json:"created_at"`
}

type GraphQuery struct {
	Query      string                 `json:"query"`
	Parameters map[string]interface{} `json:"parameters,omitempty"`
}

type GraphResult struct {
	Nodes         []LegalEntity       `json:"nodes"`
	Relationships []LegalRelationship `json:"relationships"`
	QueryTime     string              `json:"query_time"`
	ResultCount   int                 `json:"result_count"`
}

type KnowledgeGraphRequest struct {
	DocumentID string        `json:"document_id"`
	Entities   []LegalEntity `json:"entities"`
	Relations  []LegalRelationship `json:"relationships"`
}

func NewNeo4jService() (*Neo4jService, error) {
	uri := getEnv("NEO4J_URI", "bolt://localhost:7687")
	username := getEnv("NEO4J_USERNAME", "neo4j")
	password := getEnv("NEO4J_PASSWORD", "neo4j123")

	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(username, password, ""))
	if err != nil {
		return nil, fmt.Errorf("failed to create Neo4j driver: %w", err)
	}

	logger := log.New(os.Stdout, "[NEO4J-SERVICE] ", log.LstdFlags)

	service := &Neo4jService{
		driver: driver,
		logger: logger,
	}

	// Initialize Neo4j constraints and indexes
	if err := service.initializeDatabase(); err != nil {
		return nil, fmt.Errorf("failed to initialize Neo4j database: %w", err)
	}

	return service, nil
}

func (s *Neo4jService) initializeDatabase() error {
	ctx := context.Background()
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	// Create constraints and indexes for optimal performance
	constraints := []string{
		"CREATE CONSTRAINT legal_entity_id IF NOT EXISTS FOR (e:LegalEntity) REQUIRE e.id IS UNIQUE",
		"CREATE CONSTRAINT court_name IF NOT EXISTS FOR (c:Court) REQUIRE c.name IS UNIQUE",
		"CREATE CONSTRAINT statute_citation IF NOT EXISTS FOR (s:Statute) REQUIRE s.citation IS UNIQUE",
		"CREATE CONSTRAINT case_citation IF NOT EXISTS FOR (c:Case) REQUIRE c.citation IS UNIQUE",
		"CREATE INDEX legal_entity_type IF NOT EXISTS FOR (e:LegalEntity) ON (e.type)",
		"CREATE INDEX legal_entity_name IF NOT EXISTS FOR (e:LegalEntity) ON (e.name)",
		"CREATE INDEX relationship_type IF NOT EXISTS FOR ()-[r:LEGAL_RELATIONSHIP]-() ON (r.type)",
		"CREATE INDEX created_at_index IF NOT EXISTS FOR (e:LegalEntity) ON (e.created_at)",
	}

	for _, constraint := range constraints {
		_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
			return tx.Run(ctx, constraint, nil)
		})
		if err != nil {
			s.logger.Printf("Warning: Failed to create constraint/index: %v", err)
			// Continue with other constraints even if one fails
		}
	}

	s.logger.Println("Neo4j database initialized with constraints and indexes")
	return nil
}

func (s *Neo4jService) CreateKnowledgeGraph(req *KnowledgeGraphRequest) error {
	ctx := context.Background()
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	// Create entities and relationships in a single transaction
	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		// Create entities
		for _, entity := range req.Entities {
			query := `
				MERGE (e:LegalEntity {id: $id})
				SET e.type = $type,
					e.name = $name,
					e.attributes = $attributes,
					e.created_at = $created_at,
					e.document_id = $document_id
				WITH e
				CALL apoc.create.addLabels(e, [$type]) YIELD node
				RETURN node
			`

			params := map[string]interface{}{
				"id":          entity.ID,
				"type":        entity.Type,
				"name":        entity.Name,
				"attributes":  entity.Attributes,
				"created_at":  entity.CreatedAt,
				"document_id": req.DocumentID,
			}

			_, err := tx.Run(ctx, query, params)
			if err != nil {
				return nil, fmt.Errorf("failed to create entity %s: %w", entity.ID, err)
			}
		}

		// Create relationships
		for _, rel := range req.Relations {
			query := `
				MATCH (from:LegalEntity {id: $from_entity})
				MATCH (to:LegalEntity {id: $to_entity})
				MERGE (from)-[r:LEGAL_RELATIONSHIP {id: $id}]->(to)
				SET r.type = $type,
					r.weight = $weight,
					r.attributes = $attributes,
					r.created_at = $created_at,
					r.document_id = $document_id
				RETURN r
			`

			params := map[string]interface{}{
				"id":          rel.ID,
				"from_entity": rel.FromEntity,
				"to_entity":   rel.ToEntity,
				"type":        rel.Type,
				"weight":      rel.Weight,
				"attributes":  rel.Attributes,
				"created_at":  rel.CreatedAt,
				"document_id": req.DocumentID,
			}

			_, err := tx.Run(ctx, query, params)
			if err != nil {
				return nil, fmt.Errorf("failed to create relationship %s: %w", rel.ID, err)
			}
		}

		return nil, nil
	})

	if err != nil {
		return fmt.Errorf("failed to create knowledge graph: %w", err)
	}

	s.logger.Printf("Created knowledge graph for document %s with %d entities and %d relationships",
		req.DocumentID, len(req.Entities), len(req.Relations))
	return nil
}

func (s *Neo4jService) QueryGraph(query *GraphQuery) (*GraphResult, error) {
	ctx := context.Background()
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	startTime := time.Now()

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		res, err := tx.Run(ctx, query.Query, query.Parameters)
		if err != nil {
			return nil, err
		}

		records, err := res.Collect(ctx)
		if err != nil {
			return nil, err
		}

		var nodes []LegalEntity
		var relationships []LegalRelationship
		nodeMap := make(map[string]bool)
		relMap := make(map[string]bool)

		for _, record := range records {
			for _, value := range record.Values {
				switch v := value.(type) {
				case neo4j.Node:
					if !nodeMap[v.Props["id"].(string)] {
						entity := LegalEntity{
							ID:         v.Props["id"].(string),
							Type:       v.Props["type"].(string),
							Name:       v.Props["name"].(string),
							Attributes: v.Props["attributes"].(map[string]interface{}),
							CreatedAt:  v.Props["created_at"].(time.Time),
						}
						nodes = append(nodes, entity)
						nodeMap[entity.ID] = true
					}

				case neo4j.Relationship:
					if !relMap[v.Props["id"].(string)] {
						rel := LegalRelationship{
							ID:         v.Props["id"].(string),
							FromEntity: fmt.Sprintf("%d", v.StartId),
							ToEntity:   fmt.Sprintf("%d", v.EndId),
							Type:       v.Props["type"].(string),
							Weight:     v.Props["weight"].(float64),
							Attributes: v.Props["attributes"].(map[string]interface{}),
							CreatedAt:  v.Props["created_at"].(time.Time),
						}
						relationships = append(relationships, rel)
						relMap[rel.ID] = true
					}
				}
			}
		}

		return &GraphResult{
			Nodes:         nodes,
			Relationships: relationships,
			QueryTime:     time.Since(startTime).String(),
			ResultCount:   len(nodes) + len(relationships),
		}, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to execute graph query: %w", err)
	}

	return result.(*GraphResult), nil
}

func (s *Neo4jService) FindSimilarCases(caseID string, limit int) (*GraphResult, error) {
	query := &GraphQuery{
		Query: `
			MATCH (case:Case {id: $case_id})
			MATCH (case)-[:LEGAL_RELATIONSHIP*1..3]-(related)
			WHERE related:Case OR related:Statute OR related:Court
			WITH related, COUNT(*) as connection_strength
			ORDER BY connection_strength DESC
			LIMIT $limit
			MATCH path = (case)-[:LEGAL_RELATIONSHIP*1..3]-(related)
			RETURN nodes(path) as nodes, relationships(path) as relationships
		`,
		Parameters: map[string]interface{}{
			"case_id": caseID,
			"limit":   limit,
		},
	}

	return s.QueryGraph(query)
}

func (s *Neo4jService) GetCitationNetwork(statuteID string, depth int) (*GraphResult, error) {
	query := &GraphQuery{
		Query: `
			MATCH (statute:Statute {id: $statute_id})
			MATCH path = (statute)-[:LEGAL_RELATIONSHIP*1..$depth]-(connected)
			WHERE connected:Case OR connected:Court
			RETURN nodes(path) as nodes, relationships(path) as relationships
		`,
		Parameters: map[string]interface{}{
			"statute_id": statuteID,
			"depth":      depth,
		},
	}

	return s.QueryGraph(query)
}

func (s *Neo4jService) AnalyzeJurisdictionalPatterns() (*GraphResult, error) {
	query := &GraphQuery{
		Query: `
			MATCH (court:Court)-[r:LEGAL_RELATIONSHIP]-(case:Case)
			WHERE r.type = 'DECIDES'
			WITH court, COUNT(case) as case_count
			ORDER BY case_count DESC
			LIMIT 20
			MATCH (court)-[r:LEGAL_RELATIONSHIP]-(connected)
			RETURN court, r, connected
		`,
		Parameters: map[string]interface{}{},
	}

	return s.QueryGraph(query)
}

// HTTP Handlers

func (s *Neo4jService) handleCreateKnowledgeGraph(w http.ResponseWriter, r *http.Request) {
	var req KnowledgeGraphRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	if err := s.CreateKnowledgeGraph(&req); err != nil {
		s.logger.Printf("Error creating knowledge graph: %v", err)
		http.Error(w, fmt.Sprintf("Failed to create knowledge graph: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"document_id": req.DocumentID,
		"entities":    len(req.Entities),
		"relations":   len(req.Relations),
		"created_at":  time.Now(),
	})
}

func (s *Neo4jService) handleQueryGraph(w http.ResponseWriter, r *http.Request) {
	var req GraphQuery
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	result, err := s.QueryGraph(&req)
	if err != nil {
		s.logger.Printf("Error executing graph query: %v", err)
		http.Error(w, fmt.Sprintf("Query failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *Neo4jService) handleSimilarCases(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	caseID := vars["case_id"]

	limitStr := r.URL.Query().Get("limit")
	limit := 10
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	result, err := s.FindSimilarCases(caseID, limit)
	if err != nil {
		s.logger.Printf("Error finding similar cases: %v", err)
		http.Error(w, fmt.Sprintf("Failed to find similar cases: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *Neo4jService) handleCitationNetwork(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	statuteID := vars["statute_id"]

	depthStr := r.URL.Query().Get("depth")
	depth := 2
	if depthStr != "" {
		if d, err := strconv.Atoi(depthStr); err == nil {
			depth = d
		}
	}

	result, err := s.GetCitationNetwork(statuteID, depth)
	if err != nil {
		s.logger.Printf("Error getting citation network: %v", err)
		http.Error(w, fmt.Sprintf("Failed to get citation network: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *Neo4jService) handleJurisdictionalPatterns(w http.ResponseWriter, r *http.Request) {
	result, err := s.AnalyzeJurisdictionalPatterns()
	if err != nil {
		s.logger.Printf("Error analyzing jurisdictional patterns: %v", err)
		http.Error(w, fmt.Sprintf("Failed to analyze patterns: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *Neo4jService) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx := context.Background()

	// Test Neo4j connection
	session := s.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	_, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		return tx.Run(ctx, "RETURN 1", nil)
	})

	status := "healthy"
	dbStatus := "connected"
	if err != nil {
		status = "degraded"
		dbStatus = "disconnected"
		s.logger.Printf("Neo4j health check failed: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"service":    "neo4j-knowledge-graph",
		"status":     status,
		"timestamp":  time.Now(),
		"connections": map[string]string{
			"neo4j": dbStatus,
		},
		"capabilities": map[string]bool{
			"knowledge_graph_storage":    true,
			"relationship_analysis":      true,
			"citation_network_analysis":  true,
			"jurisdictional_patterns":    true,
			"similar_case_discovery":     true,
		},
	})
}

func (s *Neo4jService) Close() error {
	return s.driver.Close(context.Background())
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func main() {
	service, err := NewNeo4jService()
	if err != nil {
		log.Fatalf("Failed to initialize Neo4j service: %v", err)
	}
	defer service.Close()

	r := mux.NewRouter()

	// Knowledge graph endpoints
	r.HandleFunc("/api/v1/graph/create", service.handleCreateKnowledgeGraph).Methods("POST")
	r.HandleFunc("/api/v1/graph/query", service.handleQueryGraph).Methods("POST")
	r.HandleFunc("/api/v1/graph/similar-cases/{case_id}", service.handleSimilarCases).Methods("GET")
	r.HandleFunc("/api/v1/graph/citation-network/{statute_id}", service.handleCitationNetwork).Methods("GET")
	r.HandleFunc("/api/v1/graph/jurisdictional-patterns", service.handleJurisdictionalPatterns).Methods("GET")
	r.HandleFunc("/api/v1/health", service.handleHealth).Methods("GET")

	// Enable CORS
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	})

	handler := c.Handler(r)

	port := getEnv("PORT", "8102")
	service.logger.Printf("Neo4j Knowledge Graph Service starting on port %s", port)
	service.logger.Printf("Endpoints:")
	service.logger.Printf("  POST /api/v1/graph/create - Create knowledge graph from entities and relationships")
	service.logger.Printf("  POST /api/v1/graph/query - Execute custom Cypher queries")
	service.logger.Printf("  GET  /api/v1/graph/similar-cases/{case_id} - Find similar cases")
	service.logger.Printf("  GET  /api/v1/graph/citation-network/{statute_id} - Get citation network")
	service.logger.Printf("  GET  /api/v1/graph/jurisdictional-patterns - Analyze court patterns")
	service.logger.Printf("  GET  /api/v1/health - Service health check")

	log.Fatal(http.ListenAndServe(":"+port, handler))
}