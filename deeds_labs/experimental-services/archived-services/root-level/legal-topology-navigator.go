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
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
	"github.com/rs/cors"
)

// Legal Topology Navigator
// Port 8105 - Advanced graph traversals for legal document understanding
// Features: Multi-hop queries, precedent chains, jurisdictional patterns, obligation networks

type TopologyNavigator struct {
	driver neo4j.DriverWithContext
	logger *log.Logger
}

type TopologyQuery struct {
	QueryType  string                 `json:"query_type"`
	Parameters map[string]interface{} `json:"parameters"`
	Options    QueryOptions           `json:"options"`
}

type QueryOptions struct {
	MaxDepth      int    `json:"max_depth"`
	Limit         int    `json:"limit"`
	IncludeScores bool   `json:"include_scores"`
	Direction     string `json:"direction"` // "incoming", "outgoing", "both"
	FilterTypes   []string `json:"filter_types"`
	MinWeight     float64  `json:"min_weight"`
}

type TopologyResult struct {
	QueryType     string              `json:"query_type"`
	Nodes         []LegalNode         `json:"nodes"`
	Relationships []LegalRelationship `json:"relationships"`
	Paths         []LegalPath         `json:"paths,omitempty"`
	Insights      TopologyInsights    `json:"insights"`
	QueryTime     string              `json:"query_time"`
	ResultCount   int                 `json:"result_count"`
}

type LegalNode struct {
	ID          string                 `json:"id"`
	Type        string                 `json:"type"`
	Name        string                 `json:"name"`
	Properties  map[string]interface{} `json:"properties"`
	Centrality  float64                `json:"centrality,omitempty"`
	Importance  float64                `json:"importance,omitempty"`
	Labels      []string               `json:"labels"`
}

type LegalRelationship struct {
	ID         string                 `json:"id"`
	Type       string                 `json:"type"`
	FromNode   string                 `json:"from_node"`
	ToNode     string                 `json:"to_node"`
	Weight     float64                `json:"weight"`
	Properties map[string]interface{} `json:"properties"`
	Direction  string                 `json:"direction"`
}

type LegalPath struct {
	ID          string    `json:"id"`
	StartNode   string    `json:"start_node"`
	EndNode     string    `json:"end_node"`
	Length      int       `json:"length"`
	Score       float64   `json:"score"`
	Hops        []string  `json:"hops"`
	Description string    `json:"description"`
}

type TopologyInsights struct {
	KeyFindings       []string               `json:"key_findings"`
	CentralNodes      []LegalNode            `json:"central_nodes"`
	CriticalPaths     []LegalPath            `json:"critical_paths"`
	PatternDetection  []PatternResult        `json:"pattern_detection"`
	Recommendations   []string               `json:"recommendations"`
	Metadata          map[string]interface{} `json:"metadata"`
}

type PatternResult struct {
	Pattern     string                 `json:"pattern"`
	Count       int                    `json:"count"`
	Confidence  float64                `json:"confidence"`
	Examples    []string               `json:"examples"`
	Significance string                `json:"significance"`
}

func NewTopologyNavigator() (*TopologyNavigator, error) {
	uri := getEnv("NEO4J_URI", "bolt://localhost:7687")
	username := getEnv("NEO4J_USERNAME", "neo4j")
	password := getEnv("NEO4J_PASSWORD", "neo4j")

	driver, err := neo4j.NewDriverWithContext(uri, neo4j.BasicAuth(username, password, ""))
	if err != nil {
		return nil, fmt.Errorf("failed to create Neo4j driver: %w", err)
	}

	logger := log.New(os.Stdout, "[TOPOLOGY-NAVIGATOR] ", log.LstdFlags)

	return &TopologyNavigator{
		driver: driver,
		logger: logger,
	}, nil
}

// 1. Obligation Networks - "What obligations does Party_A have?"
func (tn *TopologyNavigator) QueryObligationNetworks(partyID string, options QueryOptions) (*TopologyResult, error) {
	startTime := time.Now()

	query := `
		MATCH (party:Party {id: $party_id})
		MATCH path = (party)-[:HAS_OBLIGATION*1..$max_depth]-(obligation:Obligation)
		OPTIONAL MATCH (obligation)-[:GOVERNED_BY]-(statute:Statute)
		OPTIONAL MATCH (obligation)-[:PART_OF]-(contract:Contract)
		RETURN party, obligation, statute, contract, path,
			   length(path) as path_length,
			   obligation.severity as severity
		ORDER BY severity DESC, path_length ASC
		LIMIT $limit
	`

	result, err := tn.executeTopologyQuery(query, map[string]interface{}{
		"party_id":  partyID,
		"max_depth": options.MaxDepth,
		"limit":     options.Limit,
	})

	if err != nil {
		return nil, err
	}

	insights := tn.generateObligationInsights(result)

	return &TopologyResult{
		QueryType:   "obligation_networks",
		Nodes:       result.Nodes,
		Relationships: result.Relationships,
		Paths:       result.Paths,
		Insights:    insights,
		QueryTime:   time.Since(startTime).String(),
		ResultCount: len(result.Nodes),
	}, nil
}

// 2. Precedent Chains - "Find all judgments citing Statute_X within last 5 years"
func (tn *TopologyNavigator) QueryPrecedentChains(statuteID string, yearsBack int, options QueryOptions) (*TopologyResult, error) {
	startTime := time.Now()

	query := `
		MATCH (statute:Statute {id: $statute_id})
		MATCH path = (statute)<-[:CITES*1..$max_depth]-(judgment:Judgment)
		WHERE judgment.date > date() - duration({years: $years_back})
		OPTIONAL MATCH (judgment)-[:DECIDED_BY]-(court:Court)
		OPTIONAL MATCH (judgment)-[:OVERRULES|AFFIRMS|DISTINGUISHES]-(related_judgment:Judgment)
		WITH statute, judgment, court, related_judgment, path,
			 judgment.precedential_value as precedential_value,
			 court.level as court_level
		RETURN statute, judgment, court, related_judgment, path,
			   precedential_value, court_level,
			   length(path) as citation_depth
		ORDER BY precedential_value DESC, court_level DESC, citation_depth ASC
		LIMIT $limit
	`

	result, err := tn.executeTopologyQuery(query, map[string]interface{}{
		"statute_id":  statuteID,
		"years_back":  yearsBack,
		"max_depth":   options.MaxDepth,
		"limit":       options.Limit,
	})

	if err != nil {
		return nil, err
	}

	insights := tn.generatePrecedentInsights(result)

	return &TopologyResult{
		QueryType:   "precedent_chains",
		Nodes:       result.Nodes,
		Relationships: result.Relationships,
		Paths:       result.Paths,
		Insights:    insights,
		QueryTime:   time.Since(startTime).String(),
		ResultCount: len(result.Nodes),
	}, nil
}

// 3. Jurisdictional Authority Patterns
func (tn *TopologyNavigator) QueryJurisdictionalPatterns(jurisdiction string, options QueryOptions) (*TopologyResult, error) {
	startTime := time.Now()

	query := `
		MATCH (court:Court {jurisdiction: $jurisdiction})
		MATCH (court)-[:DECIDES]-(judgment:Judgment)
		MATCH (judgment)-[:INVOLVES]-(case:Case)
		OPTIONAL MATCH (judgment)-[:CITES]-(statute:Statute)
		OPTIONAL MATCH (case)-[:HAS_PARTY]-(party:Party)
		WITH court, judgment, case, statute, party,
			 count(*) as decision_count,
			 avg(judgment.precedential_value) as avg_precedential_value
		WHERE decision_count >= 5
		RETURN court, judgment, case, statute, party,
			   decision_count, avg_precedential_value
		ORDER BY decision_count DESC, avg_precedential_value DESC
		LIMIT $limit
	`

	result, err := tn.executeTopologyQuery(query, map[string]interface{}{
		"jurisdiction": jurisdiction,
		"limit":        options.Limit,
	})

	if err != nil {
		return nil, err
	}

	insights := tn.generateJurisdictionalInsights(result)

	return &TopologyResult{
		QueryType:   "jurisdictional_patterns",
		Nodes:       result.Nodes,
		Relationships: result.Relationships,
		Insights:    insights,
		QueryTime:   time.Since(startTime).String(),
		ResultCount: len(result.Nodes),
	}, nil
}

// 4. Contract Risk Networks
func (tn *TopologyNavigator) QueryContractRiskNetworks(contractID string, options QueryOptions) (*TopologyResult, error) {
	startTime := time.Now()

	query := `
		MATCH (contract:Contract {id: $contract_id})
		MATCH (contract)-[:CONTAINS]-(clause:Clause)
		WHERE clause.risk_level IN ['HIGH', 'CRITICAL']
		MATCH path = (clause)-[:CREATES_OBLIGATION|CREATES_LIABILITY*1..$max_depth]-(risk_entity)
		OPTIONAL MATCH (risk_entity)-[:GOVERNED_BY]-(regulation:Regulation)
		OPTIONAL MATCH (risk_entity)-[:PRECEDENT_IN]-(case:Case)
		RETURN contract, clause, risk_entity, regulation, case, path,
			   clause.risk_level as risk_level,
			   clause.financial_impact as financial_impact,
			   length(path) as risk_propagation_depth
		ORDER BY
			CASE clause.risk_level
				WHEN 'CRITICAL' THEN 1
				WHEN 'HIGH' THEN 2
				ELSE 3
			END,
			financial_impact DESC,
			risk_propagation_depth ASC
		LIMIT $limit
	`

	result, err := tn.executeTopologyQuery(query, map[string]interface{}{
		"contract_id": contractID,
		"max_depth":   options.MaxDepth,
		"limit":       options.Limit,
	})

	if err != nil {
		return nil, err
	}

	insights := tn.generateRiskInsights(result)

	return &TopologyResult{
		QueryType:   "contract_risk_networks",
		Nodes:       result.Nodes,
		Relationships: result.Relationships,
		Paths:       result.Paths,
		Insights:    insights,
		QueryTime:   time.Since(startTime).String(),
		ResultCount: len(result.Nodes),
	}, nil
}

// 5. Entity Influence Graphs - PageRank-style centrality
func (tn *TopologyNavigator) QueryEntityInfluence(entityType string, options QueryOptions) (*TopologyResult, error) {
	startTime := time.Now()

	query := `
		CALL gds.pageRank.stream({
			nodeProjection: $entity_type,
			relationshipProjection: {
				INFLUENCES: {
					orientation: 'NATURAL'
				},
				CITES: {
					orientation: 'NATURAL'
				},
				REFERENCES: {
					orientation: 'NATURAL'
				}
			}
		})
		YIELD nodeId, score
		WITH gds.util.asNode(nodeId) AS entity, score
		WHERE entity:` + entityType + `
		OPTIONAL MATCH (entity)-[r]-(connected)
		RETURN entity, connected, r, score as influence_score
		ORDER BY influence_score DESC
		LIMIT $limit
	`

	result, err := tn.executeTopologyQuery(query, map[string]interface{}{
		"entity_type": entityType,
		"limit":       options.Limit,
	})

	if err != nil {
		return nil, err
	}

	insights := tn.generateInfluenceInsights(result)

	return &TopologyResult{
		QueryType:   "entity_influence",
		Nodes:       result.Nodes,
		Relationships: result.Relationships,
		Insights:    insights,
		QueryTime:   time.Since(startTime).String(),
		ResultCount: len(result.Nodes),
	}, nil
}

// 6. Legal Timeline Analysis
func (tn *TopologyNavigator) QueryLegalTimeline(startDate, endDate string, options QueryOptions) (*TopologyResult, error) {
	startTime := time.Now()

	query := `
		MATCH (event:LegalEvent)
		WHERE date(event.date) >= date($start_date)
		  AND date(event.date) <= date($end_date)
		OPTIONAL MATCH (event)-[:INVOLVES]-(entity)
		OPTIONAL MATCH (event)-[:CAUSED_BY]-(cause:LegalEvent)
		OPTIONAL MATCH (event)-[:LEADS_TO]-(effect:LegalEvent)
		WITH event, entity, cause, effect,
			 date(event.date) as event_date
		RETURN event, entity, cause, effect, event_date
		ORDER BY event_date ASC
		LIMIT $limit
	`

	result, err := tn.executeTopologyQuery(query, map[string]interface{}{
		"start_date": startDate,
		"end_date":   endDate,
		"limit":      options.Limit,
	})

	if err != nil {
		return nil, err
	}

	insights := tn.generateTimelineInsights(result)

	return &TopologyResult{
		QueryType:   "legal_timeline",
		Nodes:       result.Nodes,
		Relationships: result.Relationships,
		Insights:    insights,
		QueryTime:   time.Since(startTime).String(),
		ResultCount: len(result.Nodes),
	}, nil
}

func (tn *TopologyNavigator) executeTopologyQuery(query string, params map[string]interface{}) (*TopologyResult, error) {
	ctx := context.Background()
	session := tn.driver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		res, err := tx.Run(ctx, query, params)
		if err != nil {
			return nil, err
		}

		records, err := res.Collect(ctx)
		if err != nil {
			return nil, err
		}

		var nodes []LegalNode
		var relationships []LegalRelationship
		var paths []LegalPath

		nodeMap := make(map[string]bool)
		relMap := make(map[string]bool)

		for _, record := range records {
			for _, value := range record.Values {
				switch v := value.(type) {
				case neo4j.Node:
					if !nodeMap[v.Props["id"].(string)] {
						node := LegalNode{
							ID:         v.Props["id"].(string),
							Type:       v.Labels[0],
							Name:       getStringProp(v.Props, "name"),
							Properties: v.Props,
							Labels:     v.Labels,
						}
						nodes = append(nodes, node)
						nodeMap[node.ID] = true
					}

				case neo4j.Relationship:
					relID := fmt.Sprintf("%d", v.Id)
					if !relMap[relID] {
						rel := LegalRelationship{
							ID:         relID,
							Type:       v.Type,
							FromNode:   fmt.Sprintf("%d", v.StartId),
							ToNode:     fmt.Sprintf("%d", v.EndId),
							Weight:     getFloatProp(v.Props, "weight"),
							Properties: v.Props,
						}
						relationships = append(relationships, rel)
						relMap[relID] = true
					}

				case neo4j.Path:
					path := LegalPath{
						ID:        fmt.Sprintf("path_%d", len(paths)),
						StartNode: fmt.Sprintf("%d", v.Start.Id),
						EndNode:   fmt.Sprintf("%d", v.End.Id),
						Length:    len(v.Nodes),
						Hops:      make([]string, len(v.Nodes)),
					}

					for i, node := range v.Nodes {
						path.Hops[i] = getStringProp(node.Props, "name")
					}

					paths = append(paths, path)
				}
			}
		}

		return &TopologyResult{
			Nodes:         nodes,
			Relationships: relationships,
			Paths:         paths,
		}, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to execute topology query: %w", err)
	}

	return result.(*TopologyResult), nil
}

// Insight Generation Functions

func (tn *TopologyNavigator) generateObligationInsights(result *TopologyResult) TopologyInsights {
	var keyFindings []string
	var recommendations []string

	highRiskCount := 0
	totalObligations := 0

	for _, node := range result.Nodes {
		if node.Type == "Obligation" {
			totalObligations++
			if severity := getStringProp(node.Properties, "severity"); severity == "HIGH" || severity == "CRITICAL" {
				highRiskCount++
			}
		}
	}

	if totalObligations > 0 {
		riskRatio := float64(highRiskCount) / float64(totalObligations)
		keyFindings = append(keyFindings, fmt.Sprintf("Found %d obligations, %d (%.1f%%) are high-risk",
			totalObligations, highRiskCount, riskRatio*100))

		if riskRatio > 0.3 {
			recommendations = append(recommendations, "High risk ratio detected - recommend immediate legal review")
		}
	}

	return TopologyInsights{
		KeyFindings:     keyFindings,
		Recommendations: recommendations,
		Metadata: map[string]interface{}{
			"total_obligations": totalObligations,
			"high_risk_count":   highRiskCount,
		},
	}
}

func (tn *TopologyNavigator) generatePrecedentInsights(result *TopologyResult) TopologyInsights {
	var keyFindings []string
	var recommendations []string

	supremeCourtCases := 0
	appellateCourtCases := 0
	districtCourtCases := 0

	for _, node := range result.Nodes {
		if node.Type == "Court" {
			level := getStringProp(node.Properties, "level")
			switch level {
			case "supreme":
				supremeCourtCases++
			case "appellate":
				appellateCourtCases++
			case "district":
				districtCourtCases++
			}
		}
	}

	keyFindings = append(keyFindings, fmt.Sprintf("Precedent chain includes %d Supreme Court, %d Appellate, %d District cases",
		supremeCourtCases, appellateCourtCases, districtCourtCases))

	if supremeCourtCases > 0 {
		recommendations = append(recommendations, "Strong precedential foundation with Supreme Court authority")
	}

	return TopologyInsights{
		KeyFindings:     keyFindings,
		Recommendations: recommendations,
		Metadata: map[string]interface{}{
			"supreme_court_cases":  supremeCourtCases,
			"appellate_court_cases": appellateCourtCases,
			"district_court_cases": districtCourtCases,
		},
	}
}

func (tn *TopologyNavigator) generateJurisdictionalInsights(result *TopologyResult) TopologyInsights {
	return TopologyInsights{
		KeyFindings: []string{"Jurisdictional pattern analysis completed"},
		Metadata:    map[string]interface{}{"pattern_type": "jurisdictional"},
	}
}

func (tn *TopologyNavigator) generateRiskInsights(result *TopologyResult) TopologyInsights {
	return TopologyInsights{
		KeyFindings: []string{"Contract risk network analysis completed"},
		Metadata:    map[string]interface{}{"analysis_type": "risk_network"},
	}
}

func (tn *TopologyNavigator) generateInfluenceInsights(result *TopologyResult) TopologyInsights {
	return TopologyInsights{
		KeyFindings: []string{"Entity influence analysis completed"},
		Metadata:    map[string]interface{}{"analysis_type": "influence_network"},
	}
}

func (tn *TopologyNavigator) generateTimelineInsights(result *TopologyResult) TopologyInsights {
	return TopologyInsights{
		KeyFindings: []string{"Legal timeline analysis completed"},
		Metadata:    map[string]interface{}{"analysis_type": "timeline"},
	}
}

// HTTP Handlers

func (tn *TopologyNavigator) handleObligationNetworks(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	partyID := vars["party_id"]

	options := parseQueryOptions(r)
	result, err := tn.QueryObligationNetworks(partyID, options)

	if err != nil {
		http.Error(w, fmt.Sprintf("Query failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (tn *TopologyNavigator) handlePrecedentChains(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	statuteID := vars["statute_id"]

	yearsBackStr := r.URL.Query().Get("years_back")
	yearsBack := 5
	if yearsBackStr != "" {
		if y, err := strconv.Atoi(yearsBackStr); err == nil {
			yearsBack = y
		}
	}

	options := parseQueryOptions(r)
	result, err := tn.QueryPrecedentChains(statuteID, yearsBack, options)

	if err != nil {
		http.Error(w, fmt.Sprintf("Query failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (tn *TopologyNavigator) handleJurisdictionalPatterns(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	jurisdiction := vars["jurisdiction"]

	options := parseQueryOptions(r)
	result, err := tn.QueryJurisdictionalPatterns(jurisdiction, options)

	if err != nil {
		http.Error(w, fmt.Sprintf("Query failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (tn *TopologyNavigator) handleContractRisks(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	contractID := vars["contract_id"]

	options := parseQueryOptions(r)
	result, err := tn.QueryContractRiskNetworks(contractID, options)

	if err != nil {
		http.Error(w, fmt.Sprintf("Query failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (tn *TopologyNavigator) handleEntityInfluence(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	entityType := vars["entity_type"]

	options := parseQueryOptions(r)
	result, err := tn.QueryEntityInfluence(entityType, options)

	if err != nil {
		http.Error(w, fmt.Sprintf("Query failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (tn *TopologyNavigator) handleLegalTimeline(w http.ResponseWriter, r *http.Request) {
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	if startDate == "" || endDate == "" {
		http.Error(w, "start_date and end_date parameters required", http.StatusBadRequest)
		return
	}

	options := parseQueryOptions(r)
	result, err := tn.QueryLegalTimeline(startDate, endDate, options)

	if err != nil {
		http.Error(w, fmt.Sprintf("Query failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (tn *TopologyNavigator) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"service":   "legal-topology-navigator",
		"status":    "healthy",
		"timestamp": time.Now(),
		"capabilities": map[string]bool{
			"obligation_networks":      true,
			"precedent_chains":        true,
			"jurisdictional_patterns": true,
			"contract_risk_networks":  true,
			"entity_influence_analysis": true,
			"legal_timeline_analysis": true,
		},
	})
}

// Helper Functions

func parseQueryOptions(r *http.Request) QueryOptions {
	options := QueryOptions{
		MaxDepth: 3,
		Limit:    50,
		Direction: "both",
	}

	if maxDepthStr := r.URL.Query().Get("max_depth"); maxDepthStr != "" {
		if md, err := strconv.Atoi(maxDepthStr); err == nil {
			options.MaxDepth = md
		}
	}

	if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			options.Limit = l
		}
	}

	if direction := r.URL.Query().Get("direction"); direction != "" {
		options.Direction = direction
	}

	return options
}

func getStringProp(props map[string]interface{}, key string) string {
	if val, exists := props[key]; exists {
		if str, ok := val.(string); ok {
			return str
		}
	}
	return ""
}

func getFloatProp(props map[string]interface{}, key string) float64 {
	if val, exists := props[key]; exists {
		if f, ok := val.(float64); ok {
			return f
		}
	}
	return 0.0
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func main() {
	navigator, err := NewTopologyNavigator()
	if err != nil {
		log.Fatalf("Failed to initialize topology navigator: %v", err)
	}

	r := mux.NewRouter()

	// Topology query endpoints
	r.HandleFunc("/api/v1/topology/obligations/{party_id}", navigator.handleObligationNetworks).Methods("GET")
	r.HandleFunc("/api/v1/topology/precedents/{statute_id}", navigator.handlePrecedentChains).Methods("GET")
	r.HandleFunc("/api/v1/topology/jurisdiction/{jurisdiction}", navigator.handleJurisdictionalPatterns).Methods("GET")
	r.HandleFunc("/api/v1/topology/contract-risks/{contract_id}", navigator.handleContractRisks).Methods("GET")
	r.HandleFunc("/api/v1/topology/influence/{entity_type}", navigator.handleEntityInfluence).Methods("GET")
	r.HandleFunc("/api/v1/topology/timeline", navigator.handleLegalTimeline).Methods("GET")
	r.HandleFunc("/api/v1/health", navigator.handleHealth).Methods("GET")

	// Enable CORS
	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"*"},
	})

	handler := c.Handler(r)

	port := getEnv("PORT", "8105")
	navigator.logger.Printf("Legal Topology Navigator starting on port %s", port)
	navigator.logger.Printf("Advanced Graph Traversal Endpoints:")
	navigator.logger.Printf("  GET /api/v1/topology/obligations/{party_id} - Obligation networks")
	navigator.logger.Printf("  GET /api/v1/topology/precedents/{statute_id} - Precedent chains")
	navigator.logger.Printf("  GET /api/v1/topology/jurisdiction/{jurisdiction} - Jurisdictional patterns")
	navigator.logger.Printf("  GET /api/v1/topology/contract-risks/{contract_id} - Contract risk networks")
	navigator.logger.Printf("  GET /api/v1/topology/influence/{entity_type} - Entity influence analysis")
	navigator.logger.Printf("  GET /api/v1/topology/timeline - Legal timeline analysis")

	log.Fatal(http.ListenAndServe(":"+port, handler))
}