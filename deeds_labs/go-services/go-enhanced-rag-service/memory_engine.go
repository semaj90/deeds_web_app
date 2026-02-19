package main

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"

	"github.com/bytedance/sonic" // High-performance JSON library with SIMD
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
)

// MemoryEngine handles contextual memory management with CUDA acceleration
type MemoryEngine struct {
	db         *gorm.DB
	redis      *redis.Client
	embedder   *EmbeddingService
	cudaWorker *CudaWorker
	jsonParser *sonic.API // High-performance JSON parser with SIMD
}

// NewMemoryEngine creates a new memory engine with optimized JSON processing
func NewMemoryEngine(db *gorm.DB, redis *redis.Client, embedder *EmbeddingService, cudaWorker *CudaWorker) *MemoryEngine {
	return &MemoryEngine{
		db:         db,
		redis:      redis,
		embedder:   embedder,
		cudaWorker: cudaWorker,
		jsonParser: sonic.ConfigDefault, // Use default sonic config with SIMD optimizations
	}
}

// FastJSONMarshal uses sonic for high-performance JSON marshaling with SIMD
func (me *MemoryEngine) FastJSONMarshal(v interface{}) ([]byte, error) {
	return me.jsonParser.Marshal(v)
}

// FastJSONUnmarshal uses sonic for high-performance JSON unmarshaling with SIMD
func (me *MemoryEngine) FastJSONUnmarshal(data []byte, v interface{}) error {
	return me.jsonParser.Unmarshal(data, v)
}

// FastJSONGet uses sonic's AST for ultra-fast JSON field extraction
func (me *MemoryEngine) FastJSONGet(data []byte, path string) (interface{}, error) {
	node, err := me.jsonParser.Get(data, path)
	if err != nil {
		return nil, err
	}
	return node.Interface(), nil
}

// JSONBToMap converts PostgreSQL JSONB to Go map with sonic
func (me *MemoryEngine) JSONBToMap(jsonbData []byte) (map[string]interface{}, error) {
	var result map[string]interface{}
	err := me.FastJSONUnmarshal(jsonbData, &result)
	return result, err
}

// MapToJSONB converts Go map to PostgreSQL JSONB with sonic
func (me *MemoryEngine) MapToJSONB(data map[string]interface{}) ([]byte, error) {
	return me.FastJSONMarshal(data)
}

// SaveMemoryWithJSONB saves memory with optimized JSONB storage
func (me *MemoryEngine) SaveMemoryWithJSONB(ctx context.Context, caseID string, memory *MemoryContext) error {
	// Convert memory to JSONB with sonic
	jsonbData, err := me.FastJSONMarshal(memory)
	if err != nil {
		return fmt.Errorf("failed to marshal memory to JSONB: %w", err)
	}

	// Save to Redis with JSONB
	redisKey := fmt.Sprintf("case:memory:%s", caseID)
	err = me.redis.Set(ctx, redisKey, jsonbData, 24*time.Hour).Err()
	if err != nil {
		return fmt.Errorf("failed to save memory to Redis: %w", err)
	}

	// Save to PostgreSQL with JSONB
	query := `
		INSERT INTO case_memories (case_id, memory_json, updated_at) 
		VALUES ($1, $2, $3) 
		ON CONFLICT (case_id) 
		DO UPDATE SET memory_json = $2, updated_at = $3
	`
	
	_, err = me.db.Exec(query, caseID, jsonbData, time.Now())
	if err != nil {
		return fmt.Errorf("failed to save memory to PostgreSQL: %w", err)
	}

	return nil
}

// LoadMemoryWithJSONB loads memory with optimized JSONB parsing
func (me *MemoryEngine) LoadMemoryWithJSONB(ctx context.Context, caseID string) (*MemoryContext, error) {
	// Try Redis first
	redisKey := fmt.Sprintf("case:memory:%s", caseID)
	jsonbData, err := me.redis.Get(ctx, redisKey).Bytes()
	if err == nil && len(jsonbData) > 0 {
		var memory MemoryContext
		err = me.FastJSONUnmarshal(jsonbData, &memory)
		if err == nil {
			return &memory, nil
		}
	}

	// Fallback to PostgreSQL
	var memory MemoryContext
	var jsonbBytes []byte
	
	err = me.db.Raw(`
		SELECT memory_json FROM case_memories 
		WHERE case_id = $1 
		ORDER BY updated_at DESC 
		LIMIT 1
	`, caseID).Scan(&jsonbBytes).Error
	
	if err != nil {
		return nil, fmt.Errorf("failed to load memory from PostgreSQL: %w", err)
	}

	if len(jsonbBytes) == 0 {
		return nil, fmt.Errorf("no memory found for case %s", caseID)
	}

	err = me.FastJSONUnmarshal(jsonbBytes, &memory)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal memory JSONB: %w", err)
	}

	// Cache in Redis for future access
	me.redis.Set(ctx, redisKey, jsonbBytes, 24*time.Hour)

	return &memory, nil
}

// FastMemorySearch performs vector similarity search with JSONB metadata
func (me *MemoryEngine) FastMemorySearch(ctx context.Context, query string, caseID string, limit int) ([]MemoryInteraction, error) {
	// Get query embedding
	queryEmbedding, err := me.embedder.GenerateEmbedding(query)
	if err != nil {
		return nil, fmt.Errorf("failed to generate query embedding: %w", err)
	}

	// Perform vector similarity search with JSONB filtering
	var results []MemoryInteraction
	err = me.db.Raw(`
		SELECT id, user_id, case_id, session_id, type, content, response, 
		       embedding, metadata, importance, decay, created_at, accessed_at
		FROM memory_interactions 
		WHERE case_id = $1 
		ORDER BY embedding <-> $2 
		LIMIT $3
	`, caseID, queryEmbedding, limit).Scan(&results).Error

	if err != nil {
		return nil, fmt.Errorf("failed to perform vector search: %w", err)
	}

	return results, nil
}

// Memory interaction record
type MemoryInteraction struct {
	ID          string                 `json:"id" gorm:"primaryKey"`
	UserID      string                 `json:"user_id" gorm:"index"`
	CaseID      string                 `json:"case_id" gorm:"index"`
	SessionID   string                 `json:"session_id" gorm:"index"`
	Type        string                 `json:"type"` // chat, search, analysis, etc.
	Content     string                 `json:"content"`
	Response    string                 `json:"response"`
	Embedding   []float32              `json:"embedding" gorm:"type:vector(768)"`
	Metadata    map[string]interface{} `json:"metadata" gorm:"type:jsonb"`
	Importance  float32                `json:"importance"`
	Decay       float32                `json:"decay" gorm:"default:1.0"`
	CreatedAt   time.Time              `json:"created_at"`
	AccessedAt  time.Time              `json:"accessed_at"`
}

// Memory degrees structure
type MemoryDegrees struct {
	Immediate   []MemoryInteraction `json:"immediate"`   // Last 5 interactions
	ShortTerm   []MemoryInteraction `json:"short_term"`  // Last hour
	MediumTerm  []MemoryInteraction `json:"medium_term"` // Last day
	LongTerm    []MemoryInteraction `json:"long_term"`   // Last week+
}

// Memory context for user/case
type MemoryContext struct {
	UserID      string                 `json:"user_id"`
	CaseID      string                 `json:"case_id"`
	Degrees     MemoryDegrees          `json:"degrees"`
	UserPattern UserPattern            `json:"user_pattern"`
	Metadata    map[string]interface{} `json:"metadata"`
	UpdatedAt   time.Time              `json:"updated_at"`
}

// User interaction patterns
type UserPattern struct {
	ExpertiseLevel   string    `json:"expertise_level"`
	ResponseStyle    string    `json:"response_style"`
	FrequentTopics   []string  `json:"frequent_topics"`
	InteractionTimes []string  `json:"interaction_times"`
	Preferences      map[string]interface{} `json:"preferences"`
}

func NewMemoryEngine(db *gorm.DB, redis *redis.Client, embedder *EmbeddingService) *MemoryEngine {
	return &MemoryEngine{
		db:       db,
		redis:    redis,
		embedder: embedder,
	}
}

// GetRelevantMemory retrieves contextually relevant memory items
func (me *MemoryEngine) GetRelevantMemory(ctx context.Context, userID, caseID, query string, queryEmbedding []float32) ([]MemoryItem, error) {
	startTime := time.Now()
	
	// Get memory interactions from database
	var interactions []MemoryInteraction
	query_db := me.db.WithContext(ctx).Where("user_id = ?", userID)
	
	if caseID != "" {
		query_db = query_db.Where("case_id = ?", caseID)
	}
	
	// Get recent interactions (within last week)
	weekAgo := time.Now().AddDate(0, 0, -7)
	if err := query_db.Where("created_at > ?", weekAgo).
		Order("created_at DESC").
		Limit(100).
		Find(&interactions).Error; err != nil {
		return nil, fmt.Errorf("failed to retrieve memory interactions: %w", err)
	}
	
	if len(interactions) == 0 {
		return []MemoryItem{}, nil
	}
	
	// Filter interactions with embeddings
	var embeddedInteractions []MemoryInteraction
	var embeddings [][]float32
	
	for _, interaction := range interactions {
		if len(interaction.Embedding) > 0 {
			embeddedInteractions = append(embeddedInteractions, interaction)
			embeddings = append(embeddings, interaction.Embedding)
		}
	}
	
	if len(embeddedInteractions) == 0 {
		return []MemoryItem{}, nil
	}
	
	// Compute similarities using CUDA if available
	var similarities []float32
	var err error
	
	if me.cudaWorker != nil && me.cudaWorker.IsAvailable() && len(embeddings) > 5 {
		similarities, err = me.cudaWorker.ComputeVectorSimilarity(ctx, VectorSimilarityRequest{
			QueryVector:     queryEmbedding,
			DocumentVectors: embeddings,
			Threshold:       0.3, // Lower threshold for memory
		})
		
		if err != nil {
			// Fallback to CPU
			similarities = me.computeSimilaritiesCPU(queryEmbedding, embeddings)
		}
	} else {
		similarities = me.computeSimilaritiesCPU(queryEmbedding, embeddings)
	}
	
	// Create memory items with relevance scoring
	memoryItems := make([]MemoryItem, 0, len(embeddedInteractions))
	
	for i, interaction := range embeddedInteractions {
		if i < len(similarities) {
			relevance := me.calculateMemoryRelevance(similarities[i], interaction)
			
			if relevance > 0.3 { // Only include reasonably relevant items
				memoryItems = append(memoryItems, MemoryItem{
					Content:   interaction.Content,
					Timestamp: interaction.CreatedAt,
					Type:      interaction.Type,
					Relevance: relevance,
					Metadata: map[string]interface{}{
						"similarity":  similarities[i],
						"importance":  interaction.Importance,
						"decay":       interaction.Decay,
						"session_id":  interaction.SessionID,
						"response":    interaction.Response,
					},
				})
			}
		}
	}
	
	// Sort by relevance
	sort.Slice(memoryItems, func(i, j int) bool {
		return memoryItems[i].Relevance > memoryItems[j].Relevance
	})
	
	// Limit to most relevant items
	if len(memoryItems) > 10 {
		memoryItems = memoryItems[:10]
	}
	
	// Update access times for retrieved memories
	go me.updateMemoryAccess(ctx, embeddedInteractions, similarities)
	
	fmt.Printf("Memory retrieval completed in %v (items: %d)\n", time.Since(startTime), len(memoryItems))
	
	return memoryItems, nil
}

// UpdateMemory stores new interaction and updates memory context
func (me *MemoryEngine) UpdateMemory(ctx context.Context, userID, caseID, sessionID, query, response string, memoryContext []MemoryItem) error {
	// Generate embedding for the interaction
	interactionText := fmt.Sprintf("Q: %s A: %s", query, response)
	embedding, err := me.embedder.GenerateEmbedding(ctx, interactionText)
	if err != nil {
		return fmt.Errorf("failed to generate embedding: %w", err)
	}
	
	// Calculate importance score
	importance := me.calculateImportance(query, response, memoryContext)
	
	// Create memory interaction record
	interaction := MemoryInteraction{
		ID:          fmt.Sprintf("%s_%d", userID, time.Now().UnixNano()),
		UserID:      userID,
		CaseID:      caseID,
		SessionID:   sessionID,
		Type:        "chat",
		Content:     query,
		Response:    response,
		Embedding:   embedding,
		Importance:  importance,
		Decay:       1.0,
		CreatedAt:   time.Now(),
		AccessedAt:  time.Now(),
		Metadata: map[string]interface{}{
			"context_used": len(memoryContext),
		},
	}
	
	// Store in database
	if err := me.db.WithContext(ctx).Create(&interaction).Error; err != nil {
		return fmt.Errorf("failed to store memory interaction: %w", err)
	}
	
	// Update memory cache
	go me.updateMemoryCache(ctx, userID, caseID)
	
	return nil
}

// ConsolidateMemory performs memory consolidation using CUDA
func (me *MemoryEngine) ConsolidateMemory(ctx context.Context) error {
	// Get all memory interactions that need consolidation
	var interactions []MemoryInteraction
	oneDayAgo := time.Now().AddDate(0, 0, -1)
	
	if err := me.db.WithContext(ctx).
		Where("created_at < ? AND decay > ?", oneDayAgo, 0.1).
		Find(&interactions).Error; err != nil {
		return fmt.Errorf("failed to retrieve interactions for consolidation: %w", err)
	}
	
	if len(interactions) == 0 {
		return nil
	}
	
	// Apply temporal decay using CUDA if available
	if me.cudaWorker != nil && me.cudaWorker.IsAvailable() {
		err := me.applyTemporalDecayCUDA(ctx, interactions)
		if err != nil {
			// Fallback to CPU
			me.applyTemporalDecayCPU(interactions)
		}
	} else {
		me.applyTemporalDecayCPU(interactions)
	}
	
	// Update decay values in database
	for _, interaction := range interactions {
		me.db.WithContext(ctx).Model(&interaction).Update("decay", interaction.Decay)
	}
	
	// Remove very low importance memories
	me.db.WithContext(ctx).Where("decay < ?", 0.05).Delete(&MemoryInteraction{})
	
	fmt.Printf("Memory consolidation completed (%d interactions processed)\n", len(interactions))
	
	return nil
}

// CUDA-accelerated temporal decay
func (me *MemoryEngine) applyTemporalDecayCUDA(ctx context.Context, interactions []MemoryInteraction) error {
	if me.cudaWorker == nil {
		return fmt.Errorf("CUDA worker not available")
	}
	
	// Prepare data for CUDA processing
	weights := make([]float32, len(interactions))
	timestamps := make([]float32, len(interactions))
	currentTime := float32(time.Now().Unix())
	
	for i, interaction := range interactions {
		weights[i] = interaction.Decay
		timestamps[i] = float32(interaction.CreatedAt.Unix())
	}
	
	// This would call a CUDA kernel for memory decay
	// For now, simulate the calculation
	decayRate := float32(0.1) // Decay rate per day
	
	for i := range interactions {
		timeDiff := (currentTime - timestamps[i]) / (24 * 3600) // Days
		decayFactor := float32(1.0) - (decayRate * timeDiff)
		if decayFactor < 0 {
			decayFactor = 0
		}
		interactions[i].Decay = weights[i] * decayFactor
	}
	
	return nil
}

// CPU fallback for temporal decay
func (me *MemoryEngine) applyTemporalDecayCPU(interactions []MemoryInteraction) {
	now := time.Now()
	decayRate := 0.1 // Decay rate per day
	
	for i := range interactions {
		daysSince := now.Sub(interactions[i].CreatedAt).Hours() / 24
		decayFactor := 1.0 - (decayRate * daysSince)
		if decayFactor < 0 {
			decayFactor = 0
		}
		interactions[i].Decay = interactions[i].Decay * float32(decayFactor)
	}
}

// Calculate memory relevance with temporal and contextual factors
func (me *MemoryEngine) calculateMemoryRelevance(similarity float32, interaction MemoryInteraction) float32 {
	relevance := similarity
	
	// Apply temporal decay
	relevance *= interaction.Decay
	
	// Apply importance weighting
	relevance *= interaction.Importance
	
	// Boost recent interactions
	hoursSince := time.Since(interaction.CreatedAt).Hours()
	if hoursSince < 1 {
		relevance *= 1.5 // Recent memory boost
	} else if hoursSince < 24 {
		relevance *= 1.2
	}
	
	// Access frequency boost
	accessBoost := 1.0 + (time.Since(interaction.AccessedAt).Hours() / 168) // Weekly decay
	relevance *= float32(accessBoost)
	
	return min(relevance, 1.0)
}

// Calculate importance of new interaction
func (me *MemoryEngine) calculateImportance(query, response string, context []MemoryItem) float32 {
	importance := float32(0.5) // Base importance
	
	// Length-based importance
	if len(query) > 100 {
		importance += 0.1
	}
	if len(response) > 200 {
		importance += 0.1
	}
	
	// Context-based importance
	if len(context) > 0 {
		importance += 0.2 // Questions with context are more important
	}
	
	// Keyword-based importance
	importantKeywords := []string{"contract", "liability", "evidence", "precedent", "statute"}
	for _, keyword := range importantKeywords {
		if containsIgnoreCase(query, keyword) || containsIgnoreCase(response, keyword) {
			importance += 0.1
		}
	}
	
	return min(importance, 1.0)
}

// Helper functions
func (me *MemoryEngine) computeSimilaritiesCPU(queryVector []float32, embeddings [][]float32) []float32 {
	similarities := make([]float32, len(embeddings))
	
	for i, embedding := range embeddings {
		similarities[i] = me.cosineSimilarity(queryVector, embedding)
	}
	
	return similarities
}

func (me *MemoryEngine) cosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) {
		return 0.0
	}
	
	var dotProduct, normA, normB float32
	
	for i := range a {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	
	if normA == 0 || normB == 0 {
		return 0.0
	}
	
	return dotProduct / (float32(normA) * float32(normB))
}

func (me *MemoryEngine) updateMemoryAccess(ctx context.Context, interactions []MemoryInteraction, similarities []float32) {
	// Update access times for relevant memories
	for i, interaction := range interactions {
		if i < len(similarities) && similarities[i] > 0.5 {
			me.db.WithContext(ctx).Model(&interaction).Update("accessed_at", time.Now())
		}
	}
}

func (me *MemoryEngine) updateMemoryCache(ctx context.Context, userID, caseID string) {
	// Update Redis cache with latest memory context
	cacheKey := fmt.Sprintf("memory:%s:%s", userID, caseID)
	
	// Build memory degrees
	degrees := me.buildMemoryDegrees(ctx, userID, caseID)
	
	// Cache for 1 hour
	data, _ := json.Marshal(degrees)
	me.redis.Set(ctx, cacheKey, data, time.Hour)
}

func (me *MemoryEngine) buildMemoryDegrees(ctx context.Context, userID, caseID string) MemoryDegrees {
	now := time.Now()
	
	var degrees MemoryDegrees
	
	// Immediate (last 5 interactions)
	me.db.WithContext(ctx).Where("user_id = ? AND case_id = ?", userID, caseID).
		Order("created_at DESC").Limit(5).Find(&degrees.Immediate)
	
	// Short term (last hour)
	oneHourAgo := now.Add(-time.Hour)
	me.db.WithContext(ctx).Where("user_id = ? AND case_id = ? AND created_at > ?", userID, caseID, oneHourAgo).
		Order("created_at DESC").Find(&degrees.ShortTerm)
	
	// Medium term (last day)
	oneDayAgo := now.AddDate(0, 0, -1)
	me.db.WithContext(ctx).Where("user_id = ? AND case_id = ? AND created_at > ?", userID, caseID, oneDayAgo).
		Order("importance DESC").Limit(20).Find(&degrees.MediumTerm)
	
	// Long term (last week+, high importance only)
	oneWeekAgo := now.AddDate(0, 0, -7)
	me.db.WithContext(ctx).Where("user_id = ? AND case_id = ? AND created_at > ? AND importance > ?", userID, caseID, oneWeekAgo, 0.7).
		Order("importance DESC").Limit(10).Find(&degrees.LongTerm)
	
	return degrees
}

func containsIgnoreCase(text, substr string) bool {
	return len(text) >= len(substr) && 
		   text[:len(substr)] == substr || 
		   (len(text) > len(substr) && containsIgnoreCase(text[1:], substr))
}

// min function removed - using the one from vector_store.go