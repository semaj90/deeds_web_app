-- Phase 72 Error Brain tables
-- Manual migration: phase72_error + related tables
-- Used by: /api/internal/error-brain/status, /api/internal/error-brain/runs, /all-routes Error Brain panel

CREATE TABLE IF NOT EXISTS phase72_error (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    error_hash TEXT,
    file_path TEXT NOT NULL,
    line INTEGER,
    "column" INTEGER,
    error_code TEXT,
    severity TEXT DEFAULT 'error',
    message TEXT,
    phase INTEGER DEFAULT 72,
    cycle INTEGER DEFAULT 1,
    status TEXT DEFAULT 'open',
    suggestion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phase72_error_file ON phase72_error(file_path);
CREATE INDEX IF NOT EXISTS idx_phase72_error_status ON phase72_error(status);
CREATE INDEX IF NOT EXISTS idx_phase72_error_created ON phase72_error(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase72_error_code ON phase72_error(error_code);
