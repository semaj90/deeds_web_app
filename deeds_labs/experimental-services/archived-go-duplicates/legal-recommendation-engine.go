//go:build archived
// +build archived

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Legal Recommendation Engine
type LegalRecommendationEngine struct {
	redisClient    *redis.Client
	caseDatabase   *LegalCaseDatabase
	vectorDatabase *VectorDatabase
	precedentIndex *PrecedentIndex
	riskModel      *RiskAssessmentModel
	mu             sync.RWMutex
}

// Legal Case structures
type LegalCase struct {
	CaseID         string            `json:"case_id"`
	Title          string            `json:"title"`
	Court          string            `json:"court"`
	Year           int32             `json:"year"`
	Jurisdiction   string            `json:"jurisdiction"`
	LegalDomain    string            `json:"legal_domain"`
	Facts          []string          `json:"facts"`
	LegalConcepts  []string          `json:"legal_concepts"`
	Outcome        string            `json:"outcome"`
	OutcomeDetails string            `json:"outcome_details"`
	DamagesAwarded int64             `json:"damages_awarded"`
	CourtLevel     string            `json:"court_level"`
	Precedents     []string          `json:"precedents"`
	Citations      []Citation        `json:"citations"`
	Embedding      []float32         `json:"embedding"`
	RiskFactors    []RiskFactor      `json:"risk_factors"`
	Tags           []string          `json:"tags"`
	Complexity     int32             `json:"complexity"`
	Metadata       map[string]string `json:"metadata"`
}

type Citation struct {
	Title          string  `json:"title"`
	Author         string  `json:"author"`
	Source         string  `json:"source"`
	URL            string  `json:"url"`
	Year           int32   `json:"year"`
	RelevanceScore float32 `json:"relevance_score"`
}

type RiskFactor struct {
	FactorName     string                 `json:"factor_name"`
	ImpactScore    float32                `json:"impact_score"`
	Probability    float32                `json:"probability"`
	Description    string                 `json:"description"`
	RelatedCases   []string               `json:"related_cases"`
	HistoricalData map[string]interface{} `json:"historical_data"`
}

type RiskAssessment struct {
	OverallRiskScore     float32      `json:"overall_risk_score"`
	RiskLevel            string       `json:"risk_level"`
	RiskFactors          []RiskFactor `json:"risk_factors"`
	MitigationStrategies []string     `json:"mitigation_strategies"`
	Confidence           float32      `json:"confidence"`
	PredictedOutcome     string       `json:"predicted_outcome"`
	OutcomeProbability   float32      `json:"outcome_probability"`
}

type LegalRecommendation struct {
	ID                   string            `json:"id"`
	Title                string            `json:"title"`
	Description          string            `json:"description"`
	ConfidenceScore      float32           `json:"confidence_score"`
	LegalDomain          string            `json:"legal_domain"`
	Jurisdiction         string            `json:"jurisdiction"`
	RelevantCases        []LegalCase       `json:"relevant_cases"`
	LegalConcepts        []string          `json:"legal_concepts"`
	RiskAssessment       *RiskAssessment   `json:"risk_assessment"`
	RecommendationType   string            `json:"recommendation_type"`
	Priority             int32             `json:"priority"`
	EstimatedOutcome     string            `json:"estimated_outcome"`
	SupportingPrecedents []LegalPrecedent  `json:"supporting_precedents"`
	Metadata             map[string]string `json:"metadata"`
}

type LegalPrecedent struct {
	PrecedentID     string     `json:"precedent_id"`
	CaseName        string     `json:"case_name"`
	Court           string     `json:"court"`
	Year            int32      `json:"year"`
	Jurisdiction    string     `json:"jurisdiction"`
	LegalPrinciples []string   `json:"legal_principles"`
	Holding         string     `json:"holding"`
	Reasoning       string     `json:"reasoning"`
	RelevanceScore  float32    `json:"relevance_score"`
	Citations       []Citation `json:"citations"`
	CourtLevel      string     `json:"court_level"`
	BindingStatus   string     `json:"binding_status"`
}

// Database implementations
type LegalCaseDatabase struct {
	cases map[string]LegalCase
	mu    sync.RWMutex
}

type VectorDatabase struct {
	vectors map[string][]float32
	mu      sync.RWMutex
}

type PrecedentIndex struct {
	precedents map[string]LegalPrecedent
	conceptMap map[string][]string // concept -> precedent IDs
	mu         sync.RWMutex
}

type RiskAssessmentModel struct {
	historicalOutcomes map[string][]OutcomeData
	riskWeights        map[string]float32
	mu                 sync.RWMutex
}

type OutcomeData struct {
	CaseID         string            `json:"case_id"`
	Outcome        string            `json:"outcome"`
	DamagesAwarded int64             `json:"damages_awarded"`
	CaseFactors    []string          `json:"case_factors"`
	Probability    float32           `json:"probability"`
	Context        map[string]string `json:"context"`
}

// Request/Response structures
type RecommendationRequest struct {
	CaseID                string            `json:"case_id"`
	CaseFacts             []string          `json:"case_facts"`
	LegalDomain           string            `json:"legal_domain"`
	Jurisdiction          string            `json:"jurisdiction"`
	MaxRecommendations    int32             `json:"max_recommendations"`
	SimilarityThreshold   float32           `json:"similarity_threshold"`
	IncludePrecedents     bool              `json:"include_precedents"`
	IncludeSimilarCases   bool              `json:"include_similar_cases"`
	IncludeRiskAssessment bool              `json:"include_risk_assessment"`
	Filters               map[string]string `json:"filters"`
	QueryEmbedding        []float32         `json:"query_embedding"`
}

type RecommendationResponse struct {
	Recommendations  []LegalRecommendation `json:"recommendations"`
	TotalCount       int32                 `json:"total_count"`
	ConfidenceScore  float32               `json:"confidence_score"`
	ProcessingTimeMs int64                 `json:"processing_time_ms"`
	Success          bool                  `json:"success"`
	Error            string                `json:"error,omitempty"`
}

// Initialize databases with mock data
func NewLegalCaseDatabase() *LegalCaseDatabase {
	db := &LegalCaseDatabase{
		cases: make(map[string]LegalCase),
	}

	// Add comprehensive mock legal cases
	mockCases := []LegalCase{
		{
			CaseID:       "case_contract_001",
			Title:        "TechCorp vs. ServiceProvider LLC - Software License Breach",
			Court:        "U.S. District Court for the Northern District of California",
			Year:         2023,
			Jurisdiction: "federal",
			LegalDomain:  "contract_law",
			Facts: []string{
				"Software licensing agreement dispute",
				"Alleged breach of exclusive use terms",
				"Claimed damages of $2.5M",
				"Counter-claim of insufficient payment",
			},
			LegalConcepts:  []string{"breach of contract", "software licensing", "exclusive use", "damages"},
			Outcome:        "plaintiff_victory",
			OutcomeDetails: "Plaintiff awarded $1.8M in damages, partial victory",
			DamagesAwarded: 1800000,
			CourtLevel:     "district",
			Precedents:     []string{"prec_software_001", "prec_contract_002"},
			Citations:      []Citation{},
			Tags:           []string{"software", "technology", "licensing", "breach"},
			Complexity:     8,
			Metadata:       map[string]string{"type": "commercial", "industry": "technology"},
			RiskFactors: []RiskFactor{
				{
					FactorName:   "Contract Ambiguity",
					ImpactScore:  0.7,
					Probability:  0.6,
					Description:  "Unclear licensing terms may favor either party",
					RelatedCases: []string{"case_contract_002", "case_contract_005"},
				},
				{
					FactorName:   "Payment History",
					ImpactScore:  0.5,
					Probability:  0.8,
					Description:  "Defendant's payment history affects credibility",
					RelatedCases: []string{"case_contract_003"},
				},
			},
		},
		{
			CaseID:       "case_employment_001",
			Title:        "Johnson v. MegaCorp Inc. - Wrongful Termination",
			Court:        "Superior Court of California",
			Year:         2022,
			Jurisdiction: "state",
			LegalDomain:  "employment_law",
			Facts: []string{
				"Employee terminated after reporting safety violations",
				"Claims of retaliation and wrongful termination",
				"Alleged violation of whistleblower protections",
				"Employer claims performance issues",
			},
			LegalConcepts:  []string{"wrongful termination", "whistleblower protection", "retaliation", "employment at will"},
			Outcome:        "settlement",
			OutcomeDetails: "Confidential settlement reached, estimated $450K",
			DamagesAwarded: 450000,
			CourtLevel:     "state_superior",
			Precedents:     []string{"prec_employment_001", "prec_whistleblower_001"},
			Tags:           []string{"employment", "whistleblower", "safety", "retaliation"},
			Complexity:     6,
			Citations:      []Citation{},
			Metadata:       map[string]string{"type": "employment", "industry": "manufacturing"},
			RiskFactors: []RiskFactor{
				{
					FactorName:   "Documentation Quality",
					ImpactScore:  0.8,
					Probability:  0.7,
					Description:  "Quality of safety violation documentation affects case strength",
					RelatedCases: []string{"case_employment_002"},
				},
			},
		},
		{
			CaseID:       "case_ip_001",
			Title:        "InnovateTech v. CopyCat Solutions - Patent Infringement",
			Court:        "U.S. District Court for the Eastern District of Texas",
			Year:         2023,
			Jurisdiction: "federal",
			LegalDomain:  "intellectual_property",
			Facts: []string{
				"Patent infringement in AI algorithm implementation",
				"Claims of willful infringement and copying",
				"Defendant argues patent invalidity",
				"Seeking injunctive relief and damages",
			},
			LegalConcepts:  []string{"patent infringement", "willful infringement", "patent validity", "injunctive relief"},
			Outcome:        "pending",
			OutcomeDetails: "Case ongoing, preliminary injunction granted",
			DamagesAwarded: 0,
			CourtLevel:     "district",
			Precedents:     []string{"prec_patent_001", "prec_injunction_001"},
			Tags:           []string{"patent", "AI", "algorithm", "infringement"},
			Complexity:     9,
			Citations:      []Citation{},
			Metadata:       map[string]string{"type": "intellectual_property", "industry": "technology"},
			RiskFactors: []RiskFactor{
				{
					FactorName:   "Patent Validity",
					ImpactScore:  0.9,
					Probability:  0.4,
					Description:  "Patent may be invalid due to prior art",
					RelatedCases: []string{"case_ip_002"},
				},
			},
		},
	}

	for _, case_ := range mockCases {
		// Generate mock embedding
		embedding := generateMockEmbedding(case_.Title + " " + strings.Join(case_.Facts, " "))
		case_.Embedding = embedding
		db.cases[case_.CaseID] = case_
	}

	return db
}

func NewPrecedentIndex() *PrecedentIndex {
	idx := &PrecedentIndex{
		precedents: make(map[string]LegalPrecedent),
		conceptMap: make(map[string][]string),
	}

	precedents := []LegalPrecedent{
		{
			PrecedentID:     "prec_software_001",
			CaseName:        "Oracle America v. Google (2021)",
			Court:           "U.S. Supreme Court",
			Year:            2021,
			Jurisdiction:    "federal",
			LegalPrinciples: []string{"fair use", "copyright", "software interfaces"},
			Holding:         "Use of software interfaces can constitute fair use",
			Reasoning:       "Functional nature of software interfaces supports fair use analysis",
			RelevanceScore:  0.9,
			CourtLevel:      "supreme",
			BindingStatus:   "binding_nationwide",
		},
		{
			PrecedentID:     "prec_contract_002",
			CaseName:        "Hadley v. Baxendale (1854)",
			Court:           "Court of Exchequer",
			Year:            1854,
			Jurisdiction:    "common_law",
			LegalPrinciples: []string{"consequential damages", "foreseeability", "contract damages"},
			Holding:         "Damages must be foreseeable at time of contract formation",
			Reasoning:       "Damages arising naturally or reasonably contemplated by parties",
			RelevanceScore:  0.95,
			CourtLevel:      "appeals",
			BindingStatus:   "foundational_precedent",
		},
	}

	for _, prec := range precedents {
		idx.precedents[prec.PrecedentID] = prec

		// Build concept map
		for _, concept := range prec.LegalPrinciples {
			if idx.conceptMap[concept] == nil {
				idx.conceptMap[concept] = []string{}
			}
			idx.conceptMap[concept] = append(idx.conceptMap[concept], prec.PrecedentID)
		}
	}

	return idx
}

func NewRiskAssessmentModel() *RiskAssessmentModel {
	model := &RiskAssessmentModel{
		historicalOutcomes: make(map[string][]OutcomeData),
		riskWeights: map[string]float32{
			"contract_ambiguity":    0.7,
			"payment_history":       0.5,
			"documentation_quality": 0.8,
			"patent_validity":       0.9,
			"prior_litigation":      0.6,
			"jurisdiction_bias":     0.4,
		},
	}

	// Add historical outcome data
	model.historicalOutcomes["contract_law"] = []OutcomeData{
		{CaseID: "hist_001", Outcome: "plaintiff_victory", Probability: 0.35},
		{CaseID: "hist_002", Outcome: "defendant_victory", Probability: 0.28},
		{CaseID: "hist_003", Outcome: "settlement", Probability: 0.37},
	}

	model.historicalOutcomes["employment_law"] = []OutcomeData{
		{CaseID: "hist_004", Outcome: "settlement", Probability: 0.55},
		{CaseID: "hist_005", Outcome: "plaintiff_victory", Probability: 0.25},
		{CaseID: "hist_006", Outcome: "defendant_victory", Probability: 0.20},
	}

	return model
}

func NewVectorDatabase() *VectorDatabase {
	return &VectorDatabase{
		vectors: make(map[string][]float32),
	}
}

func generateMockEmbedding(text string) []float32 {
	// Simple hash-based embedding generation for demo
	embedding := make([]float32, 384)
	hash := 0
	for _, char := range text {
		hash = hash*31 + int(char)
	}

	for i := range embedding {
		embedding[i] = float32(math.Sin(float64(hash*i))) * 0.5
	}

	return embedding
}

// FIXED: Corrected cosine similarity calculation with proper square root
func cosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}

	var dotProduct, normA, normB float32
	for i := 0; i < len(a); i++ {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	if normA == 0 || normB == 0 {
		return 0
	}

	// FIXED: Added proper square root for vector norms
	return dotProduct / (float32(math.Sqrt(float64(normA))) * float32(math.Sqrt(float64(normB))))
}

func NewLegalRecommendationEngine() *LegalRecommendationEngine {
	rdb := redis.NewClient(&redis.Options{
		Addr:     getEnvOrDefault("REDIS_URL", "localhost:6379"),
		Password: getEnvOrDefault("REDIS_PASSWORD", ""),
		DB:       0,
	})

	// Test Redis connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Printf("⚠️  Redis connection failed: %v (continuing without Redis)", err)
	} else {
		log.Println("✅ Redis connection established")
	}

	engine := &LegalRecommendationEngine{
		redisClient:    rdb,
		caseDatabase:   NewLegalCaseDatabase(),
		vectorDatabase: NewVectorDatabase(),
		precedentIndex: NewPrecedentIndex(),
		riskModel:      NewRiskAssessmentModel(),
	}

	// Populate vector database
	for caseID, case_ := range engine.caseDatabase.cases {
		engine.vectorDatabase.vectors[caseID] = case_.Embedding
	}

	return engine
}

func (engine *LegalRecommendationEngine) GenerateRecommendations(req RecommendationRequest) RecommendationResponse {
	startTime := time.Now()

	recommendations := []LegalRecommendation{}

	// 1. Find similar cases using vector similarity
	if req.IncludeSimilarCases && len(req.QueryEmbedding) > 0 {
		similarCases := engine.findSimilarCases(req.QueryEmbedding, req.SimilarityThreshold, int(req.MaxRecommendations))
		for _, similar := range similarCases {
			recommendations = append(recommendations, LegalRecommendation{
				ID:                 fmt.Sprintf("rec_similar_%s", similar.CaseID),
				Title:              fmt.Sprintf("Similar Case: %s", similar.Case.Title),
				Description:        fmt.Sprintf("Found similar case with %d%% similarity", int(similar.Similarity*100)),
				ConfidenceScore:    similar.Similarity,
				LegalDomain:        similar.LegalDomain,
				Jurisdiction:       similar.Jurisdiction,
				RelevantCases:      []LegalCase{similar.Case},
				RecommendationType: "similar_case",
				Priority:           1,
			})
		}
	}

	// 2. Find relevant precedents
	if req.IncludePrecedents {
		precedents := engine.findRelevantPrecedents(req.CaseFacts, req.LegalDomain)
		for _, prec := range precedents {
			recommendations = append(recommendations, LegalRecommendation{
				ID:                   fmt.Sprintf("rec_precedent_%s", prec.PrecedentID),
				Title:                fmt.Sprintf("Relevant Precedent: %s", prec.CaseName),
				Description:          fmt.Sprintf("Binding precedent: %s", prec.Holding),
				ConfidenceScore:      prec.RelevanceScore,
				LegalDomain:          req.LegalDomain,
				Jurisdiction:         prec.Jurisdiction,
				SupportingPrecedents: []LegalPrecedent{prec},
				RecommendationType:   "precedent",
				Priority:             2,
			})
		}
	}

	// 3. Generate risk assessment
	if req.IncludeRiskAssessment {
		riskAssessment := engine.assessRisk(req.CaseFacts, req.LegalDomain)
		recommendations = append(recommendations, LegalRecommendation{
			ID:                 fmt.Sprintf("rec_risk_%s", req.CaseID),
			Title:              "Risk Assessment & Strategy",
			Description:        fmt.Sprintf("Overall risk level: %s", riskAssessment.RiskLevel),
			ConfidenceScore:    riskAssessment.Confidence,
			LegalDomain:        req.LegalDomain,
			Jurisdiction:       req.Jurisdiction,
			RiskAssessment:     riskAssessment,
			RecommendationType: "risk_assessment",
			Priority:           3,
		})
	}

	// Sort by priority and confidence
	sort.Slice(recommendations, func(i, j int) bool {
		if recommendations[i].Priority != recommendations[j].Priority {
			return recommendations[i].Priority < recommendations[j].Priority
		}
		return recommendations[i].ConfidenceScore > recommendations[j].ConfidenceScore
	})

	// Limit results
	if len(recommendations) > int(req.MaxRecommendations) {
		recommendations = recommendations[:req.MaxRecommendations]
	}

	// Calculate overall confidence
	var totalConfidence float32
	for _, rec := range recommendations {
		totalConfidence += rec.ConfidenceScore
	}
	avgConfidence := float32(0)
	if len(recommendations) > 0 {
		avgConfidence = totalConfidence / float32(len(recommendations))
	}

	return RecommendationResponse{
		Recommendations:  recommendations,
		TotalCount:       int32(len(recommendations)),
		ConfidenceScore:  avgConfidence,
		ProcessingTimeMs: time.Since(startTime).Milliseconds(),
		Success:          true,
	}
}

type SimilarCaseResult struct {
	Case         LegalCase
	CaseID       string
	Similarity   float32
	LegalDomain  string
	Jurisdiction string
}

func (engine *LegalRecommendationEngine) findSimilarCases(queryEmbedding []float32, threshold float32, maxResults int) []SimilarCaseResult {
	if len(queryEmbedding) == 0 {
		return nil
	}

	// Lock the underlying databases instead of the unused engine.mu to avoid potential races
	engine.vectorDatabase.mu.RLock()
	defer engine.vectorDatabase.mu.RUnlock()
	engine.caseDatabase.mu.RLock()
	defer engine.caseDatabase.mu.RUnlock()

	var results []SimilarCaseResult

	for caseID, vector := range engine.vectorDatabase.vectors {
		similarity := cosineSimilarity(queryEmbedding, vector)
		if similarity >= threshold {
			if case_, exists := engine.caseDatabase.cases[caseID]; exists {
				results = append(results, SimilarCaseResult{
					Case:         case_,
					CaseID:       caseID,
					Similarity:   similarity,
					LegalDomain:  case_.LegalDomain,
					Jurisdiction: case_.Jurisdiction,
				})
			}
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Similarity > results[j].Similarity
	})

	if len(results) > maxResults {
		results = results[:maxResults]
	}

	return results
}

func (engine *LegalRecommendationEngine) findRelevantPrecedents(caseFacts []string, legalDomain string) []LegalPrecedent {
	engine.precedentIndex.mu.RLock()
	defer engine.precedentIndex.mu.RUnlock()

	var relevantPrecedents []LegalPrecedent
	conceptCount := make(map[string]int)

	// Extract concepts from case facts
	for _, fact := range caseFacts {
		words := strings.Fields(strings.ToLower(fact))
		for _, word := range words {
			if precedentIDs, exists := engine.precedentIndex.conceptMap[word]; exists {
				conceptCount[word] = len(precedentIDs)
				for _, precID := range precedentIDs {
					if prec, exists := engine.precedentIndex.precedents[precID]; exists {
						relevantPrecedents = append(relevantPrecedents, prec)
					}
				}
			}
		}
	}

	// Remove duplicates and sort by relevance
	uniquePrecedents := make(map[string]LegalPrecedent)
	for _, prec := range relevantPrecedents {
		if _, exists := uniquePrecedents[prec.PrecedentID]; !exists {
			uniquePrecedents[prec.PrecedentID] = prec
		}
	}

	var result []LegalPrecedent
	for _, prec := range uniquePrecedents {
		result = append(result, prec)
	}

	// Sort by relevance score
	sort.Slice(result, func(i, j int) bool {
		return result[i].RelevanceScore > result[j].RelevanceScore
	})

	return result
}

func (engine *LegalRecommendationEngine) assessRisk(caseFacts []string, legalDomain string) *RiskAssessment {
	engine.riskModel.mu.RLock()
	defer engine.riskModel.mu.RUnlock()

	var riskFactors []RiskFactor
	var overallRisk float32

	// Analyze risk factors based on case facts
	factText := strings.ToLower(strings.Join(caseFacts, " "))

	if strings.Contains(factText, "contract") && strings.Contains(factText, "ambig") {
		factor := RiskFactor{
			FactorName:  "Contract Ambiguity",
			ImpactScore: 0.7,
			Probability: 0.6,
			Description: "Ambiguous contract terms increase litigation risk",
		}
		riskFactors = append(riskFactors, factor)
		overallRisk += factor.ImpactScore * factor.Probability
	}

	if strings.Contains(factText, "payment") || strings.Contains(factText, "money") {
		factor := RiskFactor{
			FactorName:  "Financial Dispute",
			ImpactScore: 0.6,
			Probability: 0.8,
			Description: "Financial disputes often lead to complex litigation",
		}
		riskFactors = append(riskFactors, factor)
		overallRisk += factor.ImpactScore * factor.Probability
	}

	// Normalize risk score
	if len(riskFactors) > 0 {
		overallRisk = overallRisk / float32(len(riskFactors))
	}

	// Determine risk level
	riskLevel := "low"
	if overallRisk > 0.7 {
		riskLevel = "high"
	} else if overallRisk > 0.4 {
		riskLevel = "medium"
	}

	// Generate mitigation strategies
	strategies := []string{
		"Gather comprehensive documentation",
		"Consult domain expert witnesses",
		"Consider alternative dispute resolution",
		"Review similar case outcomes",
	}

	// Predict outcome based on historical data
	predictedOutcome := "settlement"
	outcomeProbability := float32(0.5)

	if historicalData, exists := engine.riskModel.historicalOutcomes[legalDomain]; exists {
		maxProb := float32(0)
		for _, outcome := range historicalData {
			if outcome.Probability > maxProb {
				maxProb = outcome.Probability
				predictedOutcome = outcome.Outcome
				outcomeProbability = outcome.Probability
			}
		}
	}

	return &RiskAssessment{
		OverallRiskScore:     overallRisk,
		RiskLevel:            riskLevel,
		RiskFactors:          riskFactors,
		MitigationStrategies: strategies,
		Confidence:           0.75,
		PredictedOutcome:     predictedOutcome,
		OutcomeProbability:   outcomeProbability,
	}
}

// HTTP handlers
func (engine *LegalRecommendationEngine) handleRecommendations(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RecommendationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Generate embedding if not provided
	if len(req.QueryEmbedding) == 0 && len(req.CaseFacts) > 0 {
		req.QueryEmbedding = generateMockEmbedding(strings.Join(req.CaseFacts, " "))
	}

	response := engine.GenerateRecommendations(req)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func (engine *LegalRecommendationEngine) handleHealth(w http.ResponseWriter, r *http.Request) {
	// Check Redis connection status
	redisStatus := "disconnected"
	if engine.redisClient != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := engine.redisClient.Ping(ctx).Err(); err == nil {
			redisStatus = "connected"
		}
	}

	status := map[string]interface{}{
		"status":       "healthy",
		"timestamp":    time.Now(),
		"service":      "Legal Recommendation Engine",
		"redis_status": redisStatus,
		"databases": map[string]interface{}{
			"cases":      len(engine.caseDatabase.cases),
			"precedents": len(engine.precedentIndex.precedents),
			"vectors":    len(engine.vectorDatabase.vectors),
		},
		"capabilities": []string{
			"similar_case_analysis",
			"precedent_matching",
			"risk_assessment",
			"outcome_prediction",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func (engine *LegalRecommendationEngine) handleCaseDetails(w http.ResponseWriter, r *http.Request) {
	caseID := r.URL.Query().Get("case_id")
	if caseID == "" {
		http.Error(w, "Missing case_id parameter", http.StatusBadRequest)
		return
	}

	engine.caseDatabase.mu.RLock()
	case_, exists := engine.caseDatabase.cases[caseID]
	engine.caseDatabase.mu.RUnlock()

	if !exists {
		http.Error(w, "Case not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(case_)
}

func getEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// findAvailablePort tries to find an available port starting from the preferred port
func findAvailablePort(preferredPort string) string {
	startPort, _ := strconv.Atoi(preferredPort)
	if startPort == 0 {
		startPort = 8080
	}

	for port := startPort; port < startPort+100; port++ {
		addr := fmt.Sprintf(":%d", port)
		ln, err := net.Listen("tcp", addr)
		if err == nil {
			ln.Close()
			return fmt.Sprintf("%d", port)
		}
	}
	return preferredPort // fallback
}

func main() {
	engine := NewLegalRecommendationEngine()

	// Setup HTTP routes
	mux := http.NewServeMux()
	mux.HandleFunc("/recommend", engine.handleRecommendations)
	mux.HandleFunc("/health", engine.handleHealth)
	mux.HandleFunc("/case", engine.handleCaseDetails)

	preferredPort := getEnvOrDefault("PORT", "8080")
	port := findAvailablePort(preferredPort)

	log.Println("🎯 Legal Recommendation Engine starting on :" + port)
	log.Printf("📚 Loaded %d legal cases", len(engine.caseDatabase.cases))
	log.Printf("⚖️  Loaded %d precedents", len(engine.precedentIndex.precedents))
	log.Printf("🔍 Vector database ready with %d embeddings", len(engine.vectorDatabase.vectors))
	log.Println("🌐 API Endpoints:")
	log.Printf("   - POST /recommend     (Generate Legal Recommendations)")
	log.Printf("   - GET  /health        (Service Health)")
	log.Printf("   - GET  /case?case_id  (Case Details)")

	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal("❌ Failed to start recommendation engine:", err)
	}
}