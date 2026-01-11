-- Enhanced GRPO-thinking and Recommendation Engine Migration
-- Creates tables for structured reasoning, vector recommendations, and feedback loops

BEGIN;

-- AI Responses with GRPO-thinking context and embeddings
CREATE TABLE IF NOT EXISTS ai_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core query-response pair
    query TEXT NOT NULL,
    response TEXT NOT NULL,
    
    -- GRPO-thinking structured reasoning
    thinking_content TEXT,
    thinking_structured JSONB DEFAULT '{}'::jsonb,
    reasoning_steps JSONB DEFAULT '[]'::jsonb,
    
    -- Embeddings (768-dimensional for nomic-embed-text)
    query_embedding VECTOR(768),
    response_embedding VECTOR(768),
    context_embedding VECTOR(768),
    
    -- Model and confidence
    model TEXT NOT NULL DEFAULT 'gemma3-legal:latest',
    confidence DECIMAL(5,4),
    processing_time INTEGER, -- milliseconds
    
    -- Recommendation engine metadata
    user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
    usage_count INTEGER DEFAULT 0,
    success_metric DECIMAL(5,4),
    semantic_cluster TEXT,
    
    -- Temporal and contextual factors
    legal_domain TEXT,
    jurisdiction TEXT,
    complexity INTEGER CHECK (complexity >= 1 AND complexity <= 10),
    case_type TEXT,
    
    -- Foreign key relationships
    session_id UUID,
    user_id UUID,
    case_id UUID,
    
    -- Timestamps for recency scoring
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Metadata and tags
    metadata JSONB DEFAULT '{}'::jsonb,
    tags JSONB DEFAULT '[]'::jsonb,
    
    -- Quality indicators
    is_validated BOOLEAN DEFAULT FALSE,
    flagged_for_review BOOLEAN DEFAULT FALSE
);

-- Recommendation scores and rankings
CREATE TABLE IF NOT EXISTS recommendation_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Target and recommended items
    query_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
    recommended_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
    
    -- Scoring components
    semantic_similarity DECIMAL(8,6),
    temporal_score DECIMAL(5,4),
    context_relevance DECIMAL(5,4),
    user_preference DECIMAL(5,4),
    
    -- Combined score (weighted)
    final_score DECIMAL(8,6) NOT NULL,
    
    -- Recommendation metadata
    algorithm TEXT NOT NULL CHECK (algorithm IN ('semantic', 'collaborative', 'temporal', 'hybrid')),
    confidence DECIMAL(5,4),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    
    UNIQUE(query_id, recommended_id)
);

-- Feedback loop for GRPO learning
CREATE TABLE IF NOT EXISTS grpo_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Response being evaluated
    response_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
    
    -- Human preference data
    user_rating INTEGER NOT NULL CHECK (user_rating >= 1 AND user_rating <= 5),
    preferred_alternative UUID, -- Other response if comparison
    feedback_text TEXT,
    
    -- Specific aspects rated
    accuracy INTEGER CHECK (accuracy >= 1 AND accuracy <= 5),
    clarity INTEGER CHECK (clarity >= 1 AND clarity <= 5),
    completeness INTEGER CHECK (completeness >= 1 AND completeness <= 5),
    relevance INTEGER CHECK (relevance >= 1 AND relevance <= 5),
    
    -- Context for feedback
    feedback_type TEXT NOT NULL CHECK (feedback_type IN ('rating', 'comparison', 'correction', 'interaction')),
    session_context JSONB DEFAULT '{}'::jsonb,
    
    -- User providing feedback
    user_id UUID,
    user_role TEXT CHECK (user_role IN ('lawyer', 'paralegal', 'judge', 'student', 'client')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Vector similarity cache for performance
CREATE TABLE IF NOT EXISTS similarity_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Cached similarity pair
    embedding1_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
    embedding2_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
    
    -- Cached similarity score
    similarity DECIMAL(8,6) NOT NULL,
    algorithm TEXT NOT NULL CHECK (algorithm IN ('cosine', 'euclidean', 'dot')),
    
    -- Cache metadata
    computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
    
    UNIQUE(embedding1_id, embedding2_id, algorithm)
);

-- Legal entity relationships for graph-based recommendations
CREATE TABLE IF NOT EXISTS legal_entity_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source and target entities
    source_response_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
    target_response_id UUID NOT NULL REFERENCES ai_responses(id) ON DELETE CASCADE,
    
    -- Relationship type and strength
    relation_type TEXT NOT NULL CHECK (relation_type IN ('cites', 'contradicts', 'supports', 'extends', 'references')),
    relation_strength DECIMAL(5,4),
    
    -- Legal context
    legal_basis TEXT,
    jurisdiction TEXT,
    
    -- Discovery metadata
    discovered_by TEXT CHECK (discovered_by IN ('nlp', 'manual', 'graph_algorithm')),
    confidence DECIMAL(5,4),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    
    UNIQUE(source_response_id, target_response_id, relation_type)
);

-- Performance analytics for recommendation tuning
CREATE TABLE IF NOT EXISTS recommendation_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Recommendation context
    algorithm TEXT NOT NULL,
    query_type TEXT,
    
    -- Performance metrics
    click_through_rate DECIMAL(5,4),
    user_satisfaction DECIMAL(5,4),
    average_rating DECIMAL(3,2),
    
    -- Temporal aggregation
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    total_recommendations INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for performance

-- Vector similarity indexes (HNSW for fast approximate search)
CREATE INDEX IF NOT EXISTS idx_ai_responses_query_embedding 
    ON ai_responses USING hnsw (query_embedding vector_cosine_ops);
    
CREATE INDEX IF NOT EXISTS idx_ai_responses_response_embedding 
    ON ai_responses USING hnsw (response_embedding vector_cosine_ops);
    
CREATE INDEX IF NOT EXISTS idx_ai_responses_context_embedding 
    ON ai_responses USING hnsw (context_embedding vector_cosine_ops);

-- Temporal indexes for recency scoring
CREATE INDEX IF NOT EXISTS idx_ai_responses_created_at 
    ON ai_responses (created_at DESC);
    
CREATE INDEX IF NOT EXISTS idx_ai_responses_last_accessed 
    ON ai_responses (last_accessed DESC);

-- Domain and context indexes
CREATE INDEX IF NOT EXISTS idx_ai_responses_legal_domain 
    ON ai_responses (legal_domain);
    
CREATE INDEX IF NOT EXISTS idx_ai_responses_jurisdiction 
    ON ai_responses (jurisdiction);
    
CREATE INDEX IF NOT EXISTS idx_ai_responses_case_type 
    ON ai_responses (case_type);

-- User and session indexes
CREATE INDEX IF NOT EXISTS idx_ai_responses_user_id 
    ON ai_responses (user_id);
    
CREATE INDEX IF NOT EXISTS idx_ai_responses_session_id 
    ON ai_responses (session_id);
    
CREATE INDEX IF NOT EXISTS idx_ai_responses_case_id 
    ON ai_responses (case_id);

-- JSONB GIN indexes for fast metadata searches
CREATE INDEX IF NOT EXISTS idx_ai_responses_metadata_gin 
    ON ai_responses USING gin (metadata);
    
CREATE INDEX IF NOT EXISTS idx_ai_responses_tags_gin 
    ON ai_responses USING gin (tags);
    
CREATE INDEX IF NOT EXISTS idx_ai_responses_thinking_structured_gin 
    ON ai_responses USING gin (thinking_structured);

-- Recommendation score indexes
CREATE INDEX IF NOT EXISTS idx_recommendation_scores_query_id 
    ON recommendation_scores (query_id);
    
CREATE INDEX IF NOT EXISTS idx_recommendation_scores_final_score 
    ON recommendation_scores (final_score DESC);
    
CREATE INDEX IF NOT EXISTS idx_recommendation_scores_algorithm 
    ON recommendation_scores (algorithm);

-- Feedback indexes
CREATE INDEX IF NOT EXISTS idx_grpo_feedback_response_id 
    ON grpo_feedback (response_id);
    
CREATE INDEX IF NOT EXISTS idx_grpo_feedback_user_id 
    ON grpo_feedback (user_id);
    
CREATE INDEX IF NOT EXISTS idx_grpo_feedback_user_rating 
    ON grpo_feedback (user_rating);
    
CREATE INDEX IF NOT EXISTS idx_grpo_feedback_created_at 
    ON grpo_feedback (created_at DESC);

-- Similarity cache indexes
CREATE INDEX IF NOT EXISTS idx_similarity_cache_embedding1_id 
    ON similarity_cache (embedding1_id);
    
CREATE INDEX IF NOT EXISTS idx_similarity_cache_valid_until 
    ON similarity_cache (valid_until);

-- Legal entity relations indexes
CREATE INDEX IF NOT EXISTS idx_legal_entity_relations_source_response_id 
    ON legal_entity_relations (source_response_id);
    
CREATE INDEX IF NOT EXISTS idx_legal_entity_relations_target_response_id 
    ON legal_entity_relations (target_response_id);
    
CREATE INDEX IF NOT EXISTS idx_legal_entity_relations_relation_type 
    ON legal_entity_relations (relation_type);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_recommendation_analytics_algorithm 
    ON recommendation_analytics (algorithm);
    
CREATE INDEX IF NOT EXISTS idx_recommendation_analytics_period 
    ON recommendation_analytics (period_start, period_end);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_accessed when usage_count is incremented
CREATE TRIGGER trigger_update_last_accessed
    BEFORE UPDATE OF usage_count ON ai_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_last_accessed();

-- Create function for temporal score calculation
CREATE OR REPLACE FUNCTION calculate_temporal_score(created_at TIMESTAMP WITH TIME ZONE, half_life_days INTEGER DEFAULT 30)
RETURNS DECIMAL(5,4) AS $$
BEGIN
    RETURN GREATEST(0.05, EXP(-LN(2) * EXTRACT(EPOCH FROM (NOW() - created_at)) / (24 * 3600 * half_life_days)));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create view for easy recommendation queries
CREATE OR REPLACE VIEW enhanced_recommendations AS
SELECT 
    ar.id,
    ar.query,
    ar.response,
    ar.confidence,
    ar.legal_domain,
    ar.jurisdiction,
    ar.usage_count,
    ar.created_at,
    ar.last_accessed,
    calculate_temporal_score(ar.created_at) as temporal_score,
    COALESCE(avg_feedback.avg_rating, 3.0) as avg_user_rating,
    COALESCE(avg_feedback.rating_count, 0) as rating_count
FROM ai_responses ar
LEFT JOIN (
    SELECT 
        response_id,
        AVG(user_rating::DECIMAL) as avg_rating,
        COUNT(*) as rating_count
    FROM grpo_feedback
    GROUP BY response_id
) avg_feedback ON ar.id = avg_feedback.response_id
WHERE ar.is_validated = TRUE OR avg_feedback.avg_rating >= 3.5;

COMMIT;

-- Insert sample data for testing (optional)
DO $$
BEGIN
    -- Only insert if table is empty
    IF NOT EXISTS (SELECT 1 FROM ai_responses LIMIT 1) THEN
        INSERT INTO ai_responses (
            query,
            response,
            thinking_content,
            thinking_structured,
            reasoning_steps,
            model,
            confidence,
            processing_time,
            legal_domain,
            jurisdiction,
            case_type,
            metadata,
            tags
        ) VALUES (
            'What are the essential elements of contract formation?',
            'Contract formation requires four essential elements: (1) Offer - a clear proposal with definite terms; (2) Acceptance - unqualified agreement to the offer terms; (3) Consideration - exchange of value between parties; (4) Capacity - legal ability to enter contracts.',
            '<|thinking|>The user is asking about contract formation, which is a fundamental concept in contract law. I need to identify the essential elements. The Restatement (Second) of Contracts identifies these core requirements. Let me think through each: 1) Offer - must be clear and definite, 2) Acceptance - must mirror the offer, 3) Consideration - both parties must exchange something of value, 4) Capacity - parties must be legally competent. Some jurisdictions also require legality of purpose, but the four elements I mentioned are universally recognized.</|thinking|>',
            '{"premises": ["Contract law requires mutual agreement", "Legal obligations arise from voluntary commitments"], "inferences": ["Offer and acceptance demonstrate mutual assent", "Consideration ensures voluntary exchange"], "conclusions": ["Four elements are essential: offer, acceptance, consideration, capacity"], "legal_principles": ["Restatement (Second) of Contracts § 17", "Common law contract principles"], "counter_arguments": ["Some jurisdictions require additional elements like legality"], "confidence_factors": ["Well-established legal doctrine", "Consistent across jurisdictions"]}'::jsonb,
            '["Clear offer with definite terms required", "Unqualified acceptance necessary", "Consideration must be exchanged", "Parties must have legal capacity"]'::jsonb,
            'gemma3-legal:latest',
            0.92,
            1250,
            'contract',
            'federal',
            'civil',
            '{"analysis_type": "reasoning", "document_type": "legal_document"}'::jsonb,
            '["contract formation", "essential elements", "offer", "acceptance", "consideration", "capacity"]'::jsonb
        );
        
        RAISE NOTICE 'Sample data inserted for testing';
    END IF;
END $$;