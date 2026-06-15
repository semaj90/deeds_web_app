-- P1: Agentic Error Fixing — Error Logs Table
-- Date: June 15, 2026
-- Purpose: Track all errors for automated fixing, planning, verification

CREATE TABLE IF NOT EXISTS error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Error classification
  error_category VARCHAR(100) NOT NULL,     -- e.g., "type_mismatch", "missing_field", "identity_error"
  severity VARCHAR(20) NOT NULL,            -- CRITICAL, ERROR, WARNING, INFO
  message TEXT NOT NULL,                    -- Error message

  -- Stack trace and context
  stack TEXT,                               -- Full stack trace (for debugging)
  context_key VARCHAR(255),                 -- Source: route path, function name, component
  route_path VARCHAR(255),                  -- API route or page path (e.g., /api/cases/[id])
  file_path VARCHAR(512),                   -- Source file path
  line_number INTEGER,                      -- Line where error occurred

  -- Parent Atlas linkage
  packet_key VARCHAR(255),                  -- Link to atlas_packets.packet_key (if applicable)
  source_ref VARCHAR(255),                  -- Link to source_ref (if applicable)

  -- Lifecycle tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  fixed_at TIMESTAMP WITH TIME ZONE,        -- When P1.3 fixed it
  resolved BOOLEAN DEFAULT false NOT NULL,  -- Marked as resolved

  -- Fix details (populated by P1.3)
  fix_strategy VARCHAR(50),                 -- Type of fix applied: pattern, ast, semantic, manual
  fix_confidence NUMERIC,                   -- 0.0-1.0, confidence in the fix
  fix_notes TEXT,                           -- Human-readable fix explanation

  -- Audit trail
  audit_count INTEGER DEFAULT 1 NOT NULL,   -- How many times this error was observed
  last_audit_at TIMESTAMP WITH TIME ZONE,   -- Last time error was audited

  CONSTRAINT error_logs_severity_check CHECK (
    severity IN ('CRITICAL', 'ERROR', 'WARNING', 'INFO')
  ),
  CONSTRAINT error_logs_fix_strategy_check CHECK (
    fix_strategy IS NULL OR fix_strategy IN ('pattern', 'ast', 'semantic', 'manual')
  ),
  CONSTRAINT error_logs_confidence_check CHECK (
    fix_confidence IS NULL OR (fix_confidence >= 0.0 AND fix_confidence <= 1.0)
  )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_error_logs_category
  ON error_logs(error_category);

CREATE INDEX IF NOT EXISTS idx_error_logs_severity
  ON error_logs(severity);

CREATE INDEX IF NOT EXISTS idx_error_logs_created
  ON error_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_route
  ON error_logs(route_path);

CREATE INDEX IF NOT EXISTS idx_error_logs_packet_key
  ON error_logs(packet_key)
  WHERE packet_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_error_logs_resolved
  ON error_logs(resolved, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_fix_strategy
  ON error_logs(fix_strategy)
  WHERE fixed_at IS NOT NULL;

-- View: Error summary by category
CREATE OR REPLACE VIEW v_error_logs_summary AS
SELECT
  error_category,
  severity,
  COUNT(*) as total_count,
  COUNT(CASE WHEN resolved THEN 1 END) as resolved_count,
  COUNT(CASE WHEN fixed_at IS NOT NULL THEN 1 END) as fixed_count,
  ROUND(100.0 * COUNT(CASE WHEN resolved THEN 1 END) / COUNT(*), 1) as resolution_rate,
  MIN(created_at) as oldest_error,
  MAX(created_at) as newest_error
FROM error_logs
GROUP BY error_category, severity
ORDER BY total_count DESC;

-- View: Errors awaiting fix (P1.3 candidates)
CREATE OR REPLACE VIEW v_error_logs_fixable AS
SELECT
  id,
  error_category,
  severity,
  message,
  context_key,
  route_path,
  COUNT(*) OVER (PARTITION BY error_category) as category_count,
  RANK() OVER (ORDER BY severity DESC, created_at DESC) as priority_rank
FROM error_logs
WHERE fixed_at IS NULL AND resolved = false
ORDER BY severity DESC, audit_count DESC, created_at DESC;
