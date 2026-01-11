# Enhanced GRPO-Thinking Pipeline Integration

## Overview

The Enhanced GRPO (Generalized Reinforcement from Preference Optimization) system extends your existing Phase 2 legal AI platform with:

- **Structured reasoning context** fed back into AI responses
- **Embedding + vector search recommendation engine** with temporal scoring
- **Timestamps and recency factors** for content ranking
- **Drizzle ORM-compliant schema** for typed migrations and queries
- **Multi-algorithm recommendation system** (semantic, collaborative, hybrid, temporal)

## Architecture Components

### 1. Database Schema (`enhanced-ai-schema.ts`)

**Core Tables:**
- `ai_responses` - GRPO-enhanced responses with structured reasoning and embeddings
- `recommendation_scores` - Multi-factor ranking with semantic + temporal + user preference
- `grpo_feedback` - User preference data for reinforcement learning
- `similarity_cache` - Performance optimization for vector operations

**Key Features:**
- pgvector support for semantic search with 768-dimensional embeddings
- Temporal scoring with exponential decay (30-day half-life)
- JSON-based structured reasoning components (premises, inferences, conclusions)
- Multi-dimensional user preference tracking

### 2. Enhanced GRPO Processor (`enhanced-grpo-processor.ts`)

Extends `ThinkingProcessor` with:
- **Structured reasoning extraction** from `<|thinking|>` content
- **Vector embedding generation** using `nomic-embed-text`
- **Recommendation context retrieval** with similarity search
- **Feedback loop integration** for continuous learning
- **Temporal decay calculations** for recency scoring

### 3. Recommendation Engine (`recommendation-engine.ts`)

**4 Algorithm Types:**
1. **Semantic** - Pure vector similarity using pgvector
2. **Collaborative** - User behavior-based filtering
3. **Temporal** - Recency-focused with exponential decay
4. **Hybrid** - Weighted combination (35% semantic + 20% temporal + 25% context + 20% user preference)

**Scoring Formula:**
```typescript
final_score = 
  semantic_similarity * 0.35 +
  temporal_score * 0.20 +
  context_relevance * 0.25 +
  user_preference * 0.20 +
  usage_popularity * 0.05
```

### 4. API Integration (`enhanced-grpo/+server.ts`)

**Endpoints:**
- `POST /api/ai/enhanced-grpo` - Enhanced analysis with recommendations
- `GET /api/ai/enhanced-grpo` - History, trending topics, personalized recommendations
- `PATCH /api/ai/enhanced-grpo` - Record user feedback for learning

## Usage Examples

### Basic Enhanced Analysis

```typescript
import { ThinkingProcessor } from '$lib/ai/thinking-processor';

const analysis = await ThinkingProcessor.analyzeDocument(
  "What are the key elements of a valid contract?",
  {
    useGRPO: true,
    enableRecommendations: true,
    userId: "user-123",
    userRole: "lawyer",
    documentType: "legal_document",
    analysisType: "reasoning"
  }
);

// Enhanced response includes:
console.log(analysis.metadata.structured_reasoning); // Parsed reasoning components
console.log(analysis.metadata.recommendations_count); // Number of recommendations
console.log(analysis.metadata.temporal_score); // Recency factor
```

### Direct Recommendation Engine Usage

```typescript
import { LegalRecommendationEngine } from '$lib/services/recommendation-engine';

const recommendations = await LegalRecommendationEngine.getRecommendations({
  query: "Contract formation requirements",
  userId: "user-123",
  legalDomain: "contract",
  jurisdiction: "federal",
  userRole: "lawyer",
  maxResults: 10,
  algorithmPreference: "hybrid"
});

recommendations.forEach(rec => {
  console.log(`Score: ${rec.score}, Confidence: ${rec.confidence}`);
  console.log(`Reasoning: ${rec.reasoning.explanation}`);
  console.log(`Factors: ${rec.reasoning.factors.map(f => f.name).join(', ')}`);
});
```

### Recording User Feedback

```typescript
import { EnhancedGRPOProcessor } from '$lib/ai/enhanced-grpo-processor';

await EnhancedGRPOProcessor.recordFeedback(responseId, {
  userRating: 4, // 1-5 scale
  accuracy: 5,
  clarity: 4,
  completeness: 4,
  relevance: 5,
  feedbackText: "Very helpful analysis with good case law citations",
  userId: "user-123",
  userRole: "lawyer"
});
```

## API Usage Examples

### Enhanced Analysis Request

```bash
curl -X POST http://localhost:5177/api/ai/enhanced-grpo \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the essential elements of contract formation?",
    "userId": "user-123",
    "userRole": "lawyer",
    "documentType": "legal_document",
    "analysisType": "reasoning",
    "enableRecommendations": true,
    "enableFeedback": true,
    "maxRecommendations": 5
  }'
```

**Response Structure:**
```json
{
  "success": true,
  "analysis": {
    "thinking": "<|thinking|>...detailed legal reasoning...",
    "response": "Contract formation requires four essential elements...",
    "confidence": 0.92,
    "structured_reasoning": {
      "premises": ["Contract law requires mutual assent", "..."],
      "inferences": ["Therefore, offer and acceptance are crucial", "..."],
      "conclusions": ["The four elements are: offer, acceptance, consideration, capacity"],
      "legal_principles": ["Restatement (Second) of Contracts § 17", "..."],
      "counter_arguments": ["Some jurisdictions recognize additional requirements", "..."],
      "confidence_factors": ["Well-established legal doctrine", "..."]
    },
    "recommendations": [
      {
        "id": "rec-456",
        "score": 0.89,
        "confidence": 0.85,
        "snippet": "Offer and acceptance in contract law require...",
        "metadata": {
          "similarity": 0.91,
          "temporal_factor": 0.78,
          "context_relevance": 0.95,
          "legal_domain": "contract",
          "created_at": "2024-01-15T10:30:00Z"
        }
      }
    ],
    "trending_topics": [
      {"topic": "contract", "count": 45, "avgRating": 4.2},
      {"topic": "tort", "count": 23, "avgRating": 4.1}
    ]
  },
  "metadata": {
    "processing_time": 1250,
    "grpo_id": "grpo-789",
    "algorithm": "enhanced-grpo",
    "recommendation_count": 5,
    "capabilities": ["structured_reasoning", "temporal_scoring", "vector_recommendations"]
  }
}
```

### Get Personalized Recommendations

```bash
curl "http://localhost:5177/api/ai/enhanced-grpo?operation=personalized&userId=user-123&query=contract+disputes&limit=5"
```

### Record Feedback

```bash
curl -X PATCH http://localhost:5177/api/ai/enhanced-grpo \
  -H "Content-Type: application/json" \
  -d '{
    "responseId": "grpo-789",
    "userRating": 5,
    "accuracy": 5,
    "clarity": 4,
    "completeness": 5,
    "relevance": 5,
    "userId": "user-123",
    "userRole": "lawyer",
    "feedbackText": "Excellent analysis with comprehensive reasoning"
  }'
```

## Integration with Existing Components

### Updating Existing Chat Components

Your existing `EnhancedLegalAIChatWithSynthesis.svelte` can be enhanced:

```typescript
// Enable GRPO in existing chat
const enhancedAnalysis = await ThinkingProcessor.analyzeDocument(userQuery, {
  useGRPO: true,
  enableRecommendations: true,
  userId: currentUserId,
  userRole: currentUserRole,
  caseId: currentCaseId
});

// Display structured reasoning
if (enhancedAnalysis.metadata.structured_reasoning) {
  const reasoning = enhancedAnalysis.metadata.structured_reasoning;
  // Show premises, inferences, conclusions in UI
}

// Display recommendations
if (enhancedAnalysis.metadata.recommendations_count > 0) {
  // Show recommendation cards with scores and explanations
}
```

### Database Migration

To enable the enhanced schema:

```typescript
// Add to your migration file
import { aiResponses, grpoFeedback, recommendationScores } from '$lib/db/enhanced-ai-schema';

// Create tables with pgvector support
await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
// Then run standard Drizzle migrations
```

## Performance Considerations

1. **Vector Indexing**: Use HNSW indexes for pgvector columns
2. **Caching**: Similarity calculations are cached in `similarity_cache` table  
3. **Batch Processing**: Recommendation scores can be pre-computed for popular queries
4. **Temporal Optimization**: Recent content (< 24 hours) gets boosted scoring

## Monitoring and Analytics

The system includes built-in analytics:
- Click-through rates for recommendations
- User satisfaction scores by algorithm type
- Performance metrics by legal domain
- Trending topics and query patterns

This enhanced system maintains backward compatibility while providing significant improvements in AI reasoning quality, user personalization, and recommendation accuracy. The temporal scoring ensures fresh content is prioritized while the GRPO feedback loop continuously improves response quality based on user preferences.