-- Migration: Add missing tables for API endpoints
-- Date: 2024-09-09

BEGIN;

-- Create case_timeline table
CREATE TABLE IF NOT EXISTS case_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  importance VARCHAR(20) DEFAULT 'medium',
  evidence_id UUID,
  related_entity_id UUID,
  related_entity_type VARCHAR(50),
  event_data JSONB DEFAULT '{}',
  automated BOOLEAN DEFAULT false,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create ai_recommendations table
CREATE TABLE IF NOT EXISTS ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  reasoning TEXT,
  priority VARCHAR(20) DEFAULT 'medium',
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  ai_model VARCHAR(100),
  supporting_evidence JSONB DEFAULT '[]',
  suggested_actions JSONB DEFAULT '[]',
  estimated_impact TEXT,
  timeframe VARCHAR(100),
  status VARCHAR(20) DEFAULT 'pending',
  tags JSONB DEFAULT '[]',
  created_by VARCHAR(50) DEFAULT 'ai-system',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create recommendation_ratings table
CREATE TABLE IF NOT EXISTS recommendation_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id UUID NOT NULL REFERENCES ai_recommendations(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  implemented BOOLEAN DEFAULT false,
  user_id UUID REFERENCES users(id),
  rated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create detective_analysis table
CREATE TABLE IF NOT EXISTS detective_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  analysis_type VARCHAR(50) NOT NULL,
  query_data JSONB NOT NULL,
  results JSONB NOT NULL,
  confidence_score DECIMAL(3,2),
  ai_model VARCHAR(100),
  processing_time INTEGER, -- milliseconds
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_case_timeline_case_id ON case_timeline(case_id);
CREATE INDEX IF NOT EXISTS idx_case_timeline_event_date ON case_timeline(event_date);
CREATE INDEX IF NOT EXISTS idx_case_timeline_event_type ON case_timeline(event_type);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_case_id ON ai_recommendations(case_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_type ON ai_recommendations(type);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_priority ON ai_recommendations(priority);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_status ON ai_recommendations(status);

CREATE INDEX IF NOT EXISTS idx_recommendation_ratings_recommendation_id ON recommendation_ratings(recommendation_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_ratings_user_id ON recommendation_ratings(user_id);

CREATE INDEX IF NOT EXISTS idx_detective_analysis_case_id ON detective_analysis(case_id);
CREATE INDEX IF NOT EXISTS idx_detective_analysis_type ON detective_analysis(analysis_type);
CREATE INDEX IF NOT EXISTS idx_detective_analysis_created_at ON detective_analysis(created_at);

-- Add GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_supporting_evidence ON ai_recommendations USING gin(supporting_evidence);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_suggested_actions ON ai_recommendations USING gin(suggested_actions);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_tags ON ai_recommendations USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_detective_analysis_query_data ON detective_analysis USING gin(query_data);
CREATE INDEX IF NOT EXISTS idx_detective_analysis_results ON detective_analysis USING gin(results);

COMMIT;