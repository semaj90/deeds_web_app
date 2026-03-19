-- Timeline Events table for POI and Case timelines
CREATE TABLE IF NOT EXISTS timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poi_id UUID REFERENCES persons_of_interest(id) ON DELETE CASCADE,
  case_id UUID,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  event_date TIMESTAMPTZ NOT NULL,
  event_type VARCHAR(100) DEFAULT 'general',
  location VARCHAR(500),
  severity VARCHAR(20) DEFAULT 'low',
  metadata JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timeline_events_poi_id ON timeline_events(poi_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_case_id ON timeline_events(case_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_event_date ON timeline_events(event_date);
