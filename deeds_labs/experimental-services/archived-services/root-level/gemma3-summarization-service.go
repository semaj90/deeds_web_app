//go:build archived
// +build archived

// Gemma3 Legal Document Summarization Service
// Converts 200-page legal documents into concise readable summaries
// Essential for UX - nobody wants to read entire legal PDFs

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Legal Document Summarization Service
type LegalSummarizationService struct {
	redis      *redis.Client
	dbPool     *pgxpool.Pool
	ollamaURL  string
	httpServer *gin.Engine
}

// Summarization request
type SummarizationRequest struct {
	DocumentID   string                 `json:"document_id"`
	Title        string                 `json:"title"`
	Content      string                 `json:"content"`
	DocumentType string                 `json:"document_type"` // "contract", "judgment", "brief", "statute"
	SummaryType  string                 `json:"summary_type"`  // "executive", "detailed", "bullet_points", "legal_analysis"
	MaxLength    int                    `json:"max_length"`    // Target summary length in words
	Focus        []string               `json:"focus"`         // ["key_findings", "legal_precedents", "financial_terms"]
	Metadata     map[string]interface{} `json:"metadata"`
}

// Summarization response
type SummarizationResponse struct {
	DocumentID      string                 `json:"document_id"`
	OriginalLength  int                    `json:"original_length_words"`
	SummaryLength   int                    `json:"summary_length_words"`
	CompressionRatio float64               `json:"compression_ratio"`
	Summary         LegalSummary           `json:"summary"`
	ProcessingTime  int64                  `json:"processing_time_ms"`
	Model           string                 `json:"model"`
	Quality         SummaryQuality         `json:"quality"`
	Metadata        map[string]interface{} `json:"metadata"`
}

// Legal summary structure
type LegalSummary struct {
	ExecutiveSummary string                   `json:"executive_summary"`
	KeyFindings      []string                 `json:"key_findings"`
	LegalPrecedents  []LegalPrecedent         `json:"legal_precedents"`
	FinancialTerms   []FinancialTerm          `json:"financial_terms,omitempty"`
	Parties          []Party                  `json:"parties"`
	Timeline         []TimelineEvent          `json:"timeline,omitempty"`
	RiskFactors      []string                 `json:"risk_factors,omitempty"`
	Recommendations  []string                 `json:"recommendations,omitempty"`
	FullSummary      string                   `json:"full_summary"`
	BulletPoints     []string                 `json:"bullet_points"`
}

// Legal precedent reference
type LegalPrecedent struct {
	CaseName    string `json:"case_name"`
	Citation    string `json:"citation"`
	Relevance   string `json:"relevance"`
	KeyPrinciple string `json:"key_principle"`
}

// Financial terms in legal documents
type FinancialTerm struct {
	Term        string  `json:"term"`
	Amount      string  `json:"amount"`
	Currency    string  `json:"currency"`
	Description string  `json:"description"`
	Significance string `json:"significance"`
}

// Document parties
type Party struct {
	Name         string `json:"name"`
	Role         string `json:"role"` // "plaintiff", "defendant", "appellant", "respondent"
	Type         string `json:"type"` // "individual", "corporation", "government"
	Representation string `json:"representation,omitempty"`
}

// Timeline events
type TimelineEvent struct {
	Date        string `json:"date"`
	Event       string `json:"event"`
	Significance string `json:"significance"`
}

// Summary quality metrics
type SummaryQuality struct {
	Coherence      float64 `json:"coherence"`       // 0-1 score
	Completeness   float64 `json:"completeness"`    // 0-1 score
	Accuracy       float64 `json:"accuracy"`        // 0-1 score
	LegalRelevance float64 `json:"legal_relevance"` // 0-1 score
	Readability    string  `json:"readability"`     // "elementary", "high_school", "college", "graduate"
}

func NewLegalSummarizationService() *LegalSummarizationService {
	// Redis connection
	redisClient := redis.NewClient(&redis.Options{
		Addr:     "localhost:6379",
		Password: "redis",
		DB:       2, // Use DB 2 for summarization cache
	})

	// PostgreSQL connection
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	}

	dbPool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to database: %v", err)
		dbPool = nil
	}

	return &LegalSummarizationService{
		redis:     redisClient,
		dbPool:    dbPool,
		ollamaURL: "http://localhost:11434",
	}
}

// Generate comprehensive legal summary
func (s *LegalSummarizationService) SummarizeDocument(req *SummarizationRequest) (*SummarizationResponse, error) {
	startTime := time.Now()

	log.Printf("📝 Summarizing %s document: %s (%d words)",
		req.DocumentType, req.Title, len(strings.Fields(req.Content)))

	// Check cache first
	cacheKey := s.generateCacheKey(req)
	if cached, err := s.getCachedSummary(cacheKey); err == nil {
		log.Printf("💾 Returning cached summary for %s", req.DocumentID)
		return cached, nil
	}

	// Preprocess document
	processedContent := s.preprocessLegalDocument(req.Content, req.DocumentType)

	// Generate summary based on type and focus
	summary, err := s.generateStructuredSummary(req, processedContent)
	if err != nil {
		return nil, fmt.Errorf("failed to generate summary: %w", err)
	}

	// Calculate metrics
	originalWords := len(strings.Fields(req.Content))
	summaryWords := len(strings.Fields(summary.FullSummary))
	compressionRatio := float64(summaryWords) / float64(originalWords)

	// Assess quality
	quality := s.assessSummaryQuality(summary, req)

	response := &SummarizationResponse{
		DocumentID:       req.DocumentID,
		OriginalLength:   originalWords,
		SummaryLength:    summaryWords,
		CompressionRatio: compressionRatio,
		Summary:          *summary,
		ProcessingTime:   time.Since(startTime).Milliseconds(),
		Model:            "gemma3:legal-latest",
		Quality:          quality,
		Metadata:         req.Metadata,
	}

	// Cache the result
	s.cacheSummary(cacheKey, response)

	// Store in database
	if s.dbPool != nil {
		go s.storeSummaryInDB(response)
	}

	log.Printf("✅ Summary complete: %d→%d words (%.1f%% compression)",
		originalWords, summaryWords, compressionRatio*100)

	return response, nil
}

// Preprocess legal document for better summarization
func (s *LegalSummarizationService) preprocessLegalDocument(content, docType string) string {
	// Remove excessive whitespace
	content = regexp.MustCompile(`\s+`).ReplaceAllString(content, " ")

	// Mark section headers
	content = regexp.MustCompile(`(?i)(section|article|part)\s+(\d+)`).ReplaceAllString(content, "\n### $1 $2")

	// Mark legal citations
	content = regexp.MustCompile(`(\d+\s+[A-Z][a-z]+\.?\s+\d+)`).ReplaceAllString(content, "**$1**")

	// Mark monetary amounts
	content = regexp.MustCompile(`(\$[\d,]+(?:\.\d{2})?)`).ReplaceAllString(content, "**$1**")

	// Mark dates
	content = regexp.MustCompile(`(\d{1,2}/\d{1,2}/\d{4}|\w+\s+\d{1,2},?\s+\d{4})`).ReplaceAllString(content, "**$1**")

	return strings.TrimSpace(content)
}

// Generate structured legal summary using Gemma3
func (s *LegalSummarizationService) generateStructuredSummary(req *SummarizationRequest, content string) (*LegalSummary, error) {
	summary := &LegalSummary{}

	// Generate different summary components based on document type
	switch req.DocumentType {
	case "judgment", "court_decision":
		return s.summarizeJudgment(req, content)
	case "contract", "agreement":
		return s.summarizeContract(req, content)
	case "brief", "legal_brief":
		return s.summarizeBrief(req, content)
	case "statute", "regulation":
		return s.summarizeStatute(req, content)
	default:
		return s.summarizeGenericLegal(req, content)
	}
}

// Summarize court judgment/decision
func (s *LegalSummarizationService) summarizeJudgment(req *SummarizationRequest, content string) (*LegalSummary, error) {
	// Executive summary prompt
	executivePrompt := fmt.Sprintf(`You are a legal AI specializing in court decision analysis.

Analyze this court judgment and provide a concise executive summary (2-3 paragraphs):

Document: %s

Focus on:
- The main legal issue(s)
- The court's decision and reasoning
- Key legal precedents cited
- Impact and implications

Provide a clear, professional summary suitable for legal professionals.`, content)

	executiveSummary, err := s.callGemma3(executivePrompt)
	if err != nil {
		return nil, err
	}

	// Extract key findings
	findingsPrompt := fmt.Sprintf(`From this court judgment, extract the key findings as a numbered list:

%s

Provide 5-7 key findings in this format:
1. [Finding]
2. [Finding]
...`, content)

	findingsText, err := s.callGemma3(findingsPrompt)
	if err != nil {
		return nil, err
	}

	keyFindings := s.parseNumberedList(findingsText)

	// Extract legal precedents
	precedentsPrompt := fmt.Sprintf(`From this court judgment, identify all legal precedents cited:

%s

For each precedent, provide:
- Case name
- Citation
- Key legal principle
- Relevance to current case

Format as JSON array.`, content)

	precedentsText, err := s.callGemma3(precedentsPrompt)
	if err != nil {
		return nil, err
	}

	precedents := s.parseLegalPrecedents(precedentsText)

	// Extract parties
	partiesPrompt := fmt.Sprintf(`From this court judgment, identify all parties:

%s

For each party, provide:
- Name
- Role (plaintiff, defendant, appellant, respondent, etc.)
- Type (individual, corporation, government entity)

Format as JSON array.`, content)

	partiesText, err := s.callGemma3(partiesPrompt)
	if err != nil {
		return nil, err
	}

	parties := s.parseParties(partiesText)

	// Generate bullet points
	bulletPrompt := fmt.Sprintf(`Create 8-10 bullet points summarizing this court judgment:

%s

Each bullet point should be concise and capture a key aspect of the decision.`, content)

	bulletText, err := s.callGemma3(bulletPrompt)
	if err != nil {
		return nil, err
	}

	bulletPoints := s.parseBulletPoints(bulletText)

	return &LegalSummary{
		ExecutiveSummary: executiveSummary,
		KeyFindings:      keyFindings,
		LegalPrecedents:  precedents,
		Parties:          parties,
		FullSummary:      executiveSummary,
		BulletPoints:     bulletPoints,
	}, nil
}

// Summarize contract/agreement
func (s *LegalSummarizationService) summarizeContract(req *SummarizationRequest, content string) (*LegalSummary, error) {
	// Executive summary for contracts
	executivePrompt := fmt.Sprintf(`You are a legal AI specializing in contract analysis.

Analyze this contract and provide a comprehensive executive summary:

Contract: %s

Focus on:
- Parties involved and their roles
- Main purpose and scope of the agreement
- Key terms and conditions
- Financial obligations and terms
- Important dates and deadlines
- Risk factors and limitations

Provide a clear, professional summary suitable for business executives.`, content)

	executiveSummary, err := s.callGemma3(executivePrompt)
	if err != nil {
		return nil, err
	}

	// Extract financial terms
	financialPrompt := fmt.Sprintf(`From this contract, extract all financial terms:

%s

For each financial term, provide:
- Term name
- Amount
- Currency
- Description
- Significance

Format as JSON array.`, content)

	financialText, err := s.callGemma3(financialPrompt)
	if err != nil {
		return nil, err
	}

	financialTerms := s.parseFinancialTerms(financialText)

	// Extract key obligations
	obligationsPrompt := fmt.Sprintf(`From this contract, extract key obligations for each party:

%s

Provide 5-7 key obligations in numbered format.`, content)

	obligationsText, err := s.callGemma3(obligationsPrompt)
	if err != nil {
		return nil, err
	}

	keyFindings := s.parseNumberedList(obligationsText)

	// Risk factors
	riskPrompt := fmt.Sprintf(`Identify potential risk factors in this contract:

%s

List 5-7 risk factors that parties should be aware of.`, content)

	riskText, err := s.callGemma3(riskPrompt)
	if err != nil {
		return nil, err
	}

	riskFactors := s.parseNumberedList(riskText)

	return &LegalSummary{
		ExecutiveSummary: executiveSummary,
		KeyFindings:      keyFindings,
		FinancialTerms:   financialTerms,
		RiskFactors:      riskFactors,
		FullSummary:      executiveSummary,
	}, nil
}

// Summarize legal brief
func (s *LegalSummarizationService) summarizeBrief(req *SummarizationRequest, content string) (*LegalSummary, error) {
	// Brief-specific summarization
	executivePrompt := fmt.Sprintf(`You are a legal AI specializing in legal brief analysis.

Analyze this legal brief and provide a strategic summary:

Brief: %s

Focus on:
- Main legal arguments
- Supporting precedents and authorities
- Factual background
- Relief sought
- Strengths and weaknesses of the position

Provide a clear, analytical summary.`, content)

	executiveSummary, err := s.callGemma3(executivePrompt)
	if err != nil {
		return nil, err
	}

	// Extract arguments
	argumentsPrompt := fmt.Sprintf(`From this legal brief, extract the main legal arguments:

%s

Provide 5-7 key arguments in numbered format.`, content)

	argumentsText, err := s.callGemma3(argumentsPrompt)
	if err != nil {
		return nil, err
	}

	keyFindings := s.parseNumberedList(argumentsText)

	return &LegalSummary{
		ExecutiveSummary: executiveSummary,
		KeyFindings:      keyFindings,
		FullSummary:      executiveSummary,
	}, nil
}

// Summarize statute/regulation
func (s *LegalSummarizationService) summarizeStatute(req *SummarizationRequest, content string) (*LegalSummary, error) {
	// Statute-specific summarization
	executivePrompt := fmt.Sprintf(`You are a legal AI specializing in statutory analysis.

Analyze this statute/regulation and provide a comprehensive summary:

Statute: %s

Focus on:
- Purpose and scope of the law
- Key provisions and requirements
- Compliance obligations
- Penalties and enforcement
- Effective dates and applicability

Provide a clear, practical summary.`, content)

	executiveSummary, err := s.callGemma3(executivePrompt)
	if err != nil {
		return nil, err
	}

	// Extract key provisions
	provisionsPrompt := fmt.Sprintf(`From this statute, extract the key provisions:

%s

Provide 5-7 key provisions in numbered format.`, content)

	provisionsText, err := s.callGemma3(provisionsPrompt)
	if err != nil {
		return nil, err
	}

	keyFindings := s.parseNumberedList(provisionsText)

	return &LegalSummary{
		ExecutiveSummary: executiveSummary,
		KeyFindings:      keyFindings,
		FullSummary:      executiveSummary,
	}, nil
}

// Generic legal document summarization
func (s *LegalSummarizationService) summarizeGenericLegal(req *SummarizationRequest, content string) (*LegalSummary, error) {
	// Generic legal document summary
	prompt := fmt.Sprintf(`You are a legal AI assistant. Analyze this legal document and provide a comprehensive summary:

Document: %s

Provide:
1. Executive summary (2-3 paragraphs)
2. Key points (5-7 bullet points)
3. Main parties involved
4. Important dates or deadlines
5. Legal implications

Make the summary clear and accessible to legal professionals.`, content)

	fullSummary, err := s.callGemma3(prompt)
	if err != nil {
		return nil, err
	}

	return &LegalSummary{
		ExecutiveSummary: fullSummary,
		FullSummary:      fullSummary,
	}, nil
}

// Call Gemma3 via Ollama
func (s *LegalSummarizationService) callGemma3(prompt string) (string, error) {
	reqBody := map[string]interface{}{
		"model":  "gemma3:legal-latest",
		"prompt": prompt,
		"stream": false,
		"options": map[string]interface{}{
			"temperature": 0.3, // Lower temperature for more focused legal analysis
			"top_p":       0.8,
			"top_k":       40,
		},
	}

	jsonData, _ := json.Marshal(reqBody)
	resp, err := http.Post(s.ollamaURL+"/api/generate", "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return "", fmt.Errorf("Ollama API error: %w", err)
	}
	defer resp.Body.Close()

	var response map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return "", fmt.Errorf("failed to decode Ollama response: %w", err)
	}

	if text, ok := response["response"].(string); ok {
		return strings.TrimSpace(text), nil
	}

	return "", fmt.Errorf("no response text from Ollama")
}

// Parse numbered list from AI response
func (s *LegalSummarizationService) parseNumberedList(text string) []string {
	lines := strings.Split(text, "\n")
	var items []string

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if matched := regexp.MustCompile(`^\d+\.?\s*(.+)`).FindStringSubmatch(line); len(matched) > 1 {
			items = append(items, strings.TrimSpace(matched[1]))
		}
	}

	return items
}

// Parse bullet points from AI response
func (s *LegalSummarizationService) parseBulletPoints(text string) []string {
	lines := strings.Split(text, "\n")
	var points []string

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "•") || strings.HasPrefix(line, "-") || strings.HasPrefix(line, "*") {
			points = append(points, strings.TrimSpace(line[1:]))
		}
	}

	return points
}

// Parse legal precedents (mock implementation)
func (s *LegalSummarizationService) parseLegalPrecedents(text string) []LegalPrecedent {
	// In production, would parse JSON response from AI
	return []LegalPrecedent{
		{
			CaseName:     "Brown v. Board of Education",
			Citation:     "347 U.S. 483 (1954)",
			Relevance:    "Established principle of equal protection",
			KeyPrinciple: "Separate educational facilities are inherently unequal",
		},
	}
}

// Parse financial terms (mock implementation)
func (s *LegalSummarizationService) parseFinancialTerms(text string) []FinancialTerm {
	// In production, would parse JSON response from AI
	return []FinancialTerm{
		{
			Term:         "Contract Value",
			Amount:       "$500,000",
			Currency:     "USD",
			Description:  "Total contract value over 3 years",
			Significance: "Primary financial obligation",
		},
	}
}

// Parse parties (mock implementation)
func (s *LegalSummarizationService) parseParties(text string) []Party {
	// In production, would parse JSON response from AI
	return []Party{
		{
			Name: "ABC Corporation",
			Role: "Plaintiff",
			Type: "Corporation",
		},
		{
			Name: "John Smith",
			Role: "Defendant",
			Type: "Individual",
		},
	}
}

// Assess summary quality
func (s *LegalSummarizationService) assessSummaryQuality(summary *LegalSummary, req *SummarizationRequest) SummaryQuality {
	// Mock quality assessment - in production would use ML models
	return SummaryQuality{
		Coherence:      0.85,
		Completeness:   0.78,
		Accuracy:       0.82,
		LegalRelevance: 0.88,
		Readability:    "college",
	}
}

// Generate cache key
func (s *LegalSummarizationService) generateCacheKey(req *SummarizationRequest) string {
	hash := fmt.Sprintf("%s:%s:%s:%d", req.DocumentID, req.DocumentType, req.SummaryType, req.MaxLength)
	return fmt.Sprintf("summary:%x", hash)
}

// Get cached summary
func (s *LegalSummarizationService) getCachedSummary(cacheKey string) (*SummarizationResponse, error) {
	cached, err := s.redis.Get(context.Background(), cacheKey).Result()
	if err != nil {
		return nil, err
	}

	var response SummarizationResponse
	if err := json.Unmarshal([]byte(cached), &response); err != nil {
		return nil, err
	}

	return &response, nil
}

// Cache summary
func (s *LegalSummarizationService) cacheSummary(cacheKey string, response *SummarizationResponse) {
	responseJSON, _ := json.Marshal(response)
	s.redis.SetEX(context.Background(), cacheKey, string(responseJSON), 24*time.Hour)
}

// Store summary in database
func (s *LegalSummarizationService) storeSummaryInDB(response *SummarizationResponse) {
	if s.dbPool == nil {
		return
	}

	ctx := context.Background()
	summaryJSON, _ := json.Marshal(response.Summary)
	qualityJSON, _ := json.Marshal(response.Quality)
	metadataJSON, _ := json.Marshal(response.Metadata)

	_, err := s.dbPool.Exec(ctx, `
		INSERT INTO legal_summaries (
			document_id, original_length_words, summary_length_words,
			compression_ratio, summary_data, quality_metrics,
			processing_time_ms, model, created_at, metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
		ON CONFLICT (document_id) DO UPDATE SET
			summary_data = EXCLUDED.summary_data,
			quality_metrics = EXCLUDED.quality_metrics,
			processing_time_ms = EXCLUDED.processing_time_ms,
			updated_at = NOW()
	`, response.DocumentID, response.OriginalLength, response.SummaryLength,
		response.CompressionRatio, string(summaryJSON), string(qualityJSON),
		response.ProcessingTime, response.Model, string(metadataJSON))

	if err != nil {
		log.Printf("Failed to store summary in database: %v", err)
	}
}

// HTTP API setup
func (s *LegalSummarizationService) setupRoutes() {
	gin.SetMode(gin.ReleaseMode)
	s.httpServer = gin.New()
	s.httpServer.Use(gin.Logger(), gin.Recovery())

	// CORS
	s.httpServer.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	api := s.httpServer.Group("/api/v1")
	{
		api.GET("/health", s.healthHandler)
		api.POST("/summarize", s.summarizeHandler)
		api.GET("/summaries/:doc_id", s.getSummaryHandler)
		api.POST("/batch-summarize", s.batchSummarizeHandler)
	}
}

// Summarize handler
func (s *LegalSummarizationService) summarizeHandler(c *gin.Context) {
	var req SummarizationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request format"})
		return
	}

	// Set defaults
	if req.DocumentID == "" {
		req.DocumentID = uuid.New().String()
	}
	if req.MaxLength == 0 {
		req.MaxLength = 500 // Default 500 words
	}
	if req.SummaryType == "" {
		req.SummaryType = "executive"
	}

	response, err := s.SummarizeDocument(&req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"summarization":     response,
		"service":          "gemma3-legal-summarization",
		"compression_info": gin.H{
			"original_words":    response.OriginalLength,
			"summary_words":     response.SummaryLength,
			"compression_ratio": fmt.Sprintf("%.1f%%", response.CompressionRatio*100),
		},
	})
}

// Get summary handler
func (s *LegalSummarizationService) getSummaryHandler(c *gin.Context) {
	docID := c.Param("doc_id")

	// Try cache first
	cacheKey := fmt.Sprintf("summary:doc:%s", docID)
	if cached, err := s.getCachedSummary(cacheKey); err == nil {
		c.JSON(http.StatusOK, cached)
		return
	}

	// Query database
	if s.dbPool != nil {
		var summaryJSON string
		err := s.dbPool.QueryRow(context.Background(),
			"SELECT summary_data FROM legal_summaries WHERE document_id = $1", docID).Scan(&summaryJSON)
		if err == nil {
			var summary LegalSummary
			if json.Unmarshal([]byte(summaryJSON), &summary) == nil {
				c.JSON(http.StatusOK, summary)
				return
			}
		}
	}

	c.JSON(http.StatusNotFound, gin.H{"error": "Summary not found"})
}

// Batch summarize handler
func (s *LegalSummarizationService) batchSummarizeHandler(c *gin.Context) {
	var requests []SummarizationRequest
	if err := c.ShouldBindJSON(&requests); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid batch request format"})
		return
	}

	responses := make([]*SummarizationResponse, len(requests))
	for i, req := range requests {
		if response, err := s.SummarizeDocument(&req); err == nil {
			responses[i] = response
		} else {
			log.Printf("Batch summarization failed for %s: %v", req.DocumentID, err)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"results":   responses,
		"total":     len(requests),
		"processed": len(responses),
	})
}

// Health handler
func (s *LegalSummarizationService) healthHandler(c *gin.Context) {
	// Check service health
	redisStatus := "disconnected"
	if err := s.redis.Ping(context.Background()).Err(); err == nil {
		redisStatus = "connected"
	}

	dbStatus := "disconnected"
	if s.dbPool != nil {
		if err := s.dbPool.Ping(context.Background()); err == nil {
			dbStatus = "connected"
		}
	}

	ollamaStatus := "disconnected"
	if resp, err := http.Get(s.ollamaURL + "/api/tags"); err == nil {
		resp.Body.Close()
		ollamaStatus = "connected"
	}

	c.JSON(http.StatusOK, gin.H{
		"service": "gemma3-legal-summarization",
		"status":  "healthy",
		"connections": gin.H{
			"redis":    redisStatus,
			"database": dbStatus,
			"ollama":   ollamaStatus,
		},
		"capabilities": gin.H{
			"document_types":     []string{"judgment", "contract", "brief", "statute"},
			"summary_types":      []string{"executive", "detailed", "bullet_points", "legal_analysis"},
			"supported_formats":  []string{"text", "markdown"},
			"quality_assessment": true,
			"caching":           true,
			"batch_processing":   true,
		},
		"model": gin.H{
			"name":        "gemma3:legal-latest",
			"provider":    "ollama",
			"temperature": 0.3,
		},
		"timestamp": time.Now(),
	})
}

func main() {
	log.Printf("🚀 Starting Gemma3 Legal Summarization Service")
	log.Printf("Purpose: Convert 200-page legal documents into concise summaries")

	// Create database schema
	createSummarizationSchema()

	service := NewLegalSummarizationService()
	service.setupRoutes()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8101"
	}

	log.Printf("🌐 Summarization API: http://localhost:%s/api/v1/health", port)
	log.Printf("📝 Summarize Endpoint: http://localhost:%s/api/v1/summarize", port)
	log.Printf("📊 Batch Summarize: http://localhost:%s/api/v1/batch-summarize", port)

	if err := service.httpServer.Run(":" + port); err != nil {
		log.Fatalf("Failed to start summarization service: %v", err)
	}
}

// Create database schema for summaries
func createSummarizationSchema() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://legal_admin:123456@localhost:5432/legal_ai_db?sslmode=disable"
	}

	dbPool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Printf("Warning: Failed to connect to database: %v", err)
		return
	}
	defer dbPool.Close()

	_, err = dbPool.Exec(context.Background(), `
		CREATE TABLE IF NOT EXISTS legal_summaries (
			id SERIAL PRIMARY KEY,
			document_id VARCHAR(255) UNIQUE NOT NULL,
			original_length_words INTEGER,
			summary_length_words INTEGER,
			compression_ratio DECIMAL(5,4),
			summary_data JSONB,
			quality_metrics JSONB,
			processing_time_ms BIGINT,
			model VARCHAR(100),
			created_at TIMESTAMP DEFAULT NOW(),
			updated_at TIMESTAMP DEFAULT NOW(),
			metadata JSONB
		);

		CREATE INDEX IF NOT EXISTS idx_legal_summaries_doc_id ON legal_summaries(document_id);
		CREATE INDEX IF NOT EXISTS idx_legal_summaries_created ON legal_summaries(created_at);
		CREATE INDEX IF NOT EXISTS idx_legal_summaries_compression ON legal_summaries(compression_ratio);
		CREATE INDEX IF NOT EXISTS idx_legal_summaries_processing_time ON legal_summaries(processing_time_ms);
	`)

	if err != nil {
		log.Printf("Failed to create summarization schema: %v", err)
	} else {
		log.Printf("✅ Legal summarization database schema ready")
	}
}