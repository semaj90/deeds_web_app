-- Agent Claim Ledger (Phase 75)
-- Prevents duplicate agent work by tracking who claims what task and what proof they produce

-- Story-level tracking (e.g., "P3G-QDRANT", "Identity-Freeze", "PageRank-GPU")
CREATE TABLE IF NOT EXISTS atlas_stories (
  story_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'BLOCKED')) DEFAULT 'ACTIVE'
);

-- Task-level tracking (e.g., "repair-join", "backfill-som", "verify-identity")
CREATE TABLE IF NOT EXISTS atlas_tasks (
  task_id TEXT NOT NULL,
  story_id TEXT NOT NULL REFERENCES atlas_stories(story_id),
  title TEXT NOT NULL,
  description TEXT,
  required_before TEXT[], -- Other task_ids that must complete first
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  estimated_duration_mins INT,
  status TEXT CHECK (status IN ('PENDING', 'ACTIVE', 'COMPLETED', 'BLOCKED', 'SKIPPED')) DEFAULT 'PENDING',

  PRIMARY KEY (story_id, task_id)
);

-- Agent claim (who is doing what task and when did they claim it)
CREATE TABLE IF NOT EXISTS atlas_agent_claims (
  claim_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_name TEXT NOT NULL, -- "claude", "codex", "opencode", "hermes"
  branch_name TEXT NOT NULL, -- Git branch or session ID
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('CLAIMED', 'EXECUTING', 'COMPLETED', 'FAILED', 'ABANDONED')) DEFAULT 'CLAIMED',

  -- Supersedes tracking
  supersedes_claim_id TEXT REFERENCES atlas_agent_claims(claim_id),
  supersedes_reason TEXT, -- "duplicate", "better-approach", "error-fix", "optimization"

  -- Proof artifacts
  files_created TEXT[], -- List of file paths created by this claim
  commits_made TEXT[], -- Git commit hashes
  proof_artifact TEXT, -- Path to verification report

  FOREIGN KEY (story_id, task_id) REFERENCES atlas_tasks(story_id, task_id),
  UNIQUE (story_id, task_id, agent_name, claimed_at) -- Prevent duplicate claims within 1s
);

-- Task verdict (did the claim succeed or fail, and why)
CREATE TABLE IF NOT EXISTS atlas_task_verdicts (
  verdict_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES atlas_agent_claims(claim_id),

  verdict TEXT CHECK (verdict IN ('PASS', 'FAIL', 'PARTIAL', 'BLOCKED', 'SUPERSEDED')) DEFAULT 'PARTIAL',
  reason TEXT,

  -- Verification reports
  replay_report TEXT, -- Path to replay test report
  verification_report TEXT, -- Path to gate verification report
  metrics JSONB, -- Custom metrics (coverage %, latency, etc.)

  created_at TIMESTAMPTZ DEFAULT NOW(),

  FOREIGN KEY (story_id, task_id) REFERENCES atlas_tasks(story_id, task_id)
);

-- Packet claim lineage (which packets were claimed/produced by which agent)
CREATE TABLE IF NOT EXISTS atlas_packet_claims (
  packet_key TEXT NOT NULL,
  claim_id TEXT NOT NULL REFERENCES atlas_agent_claims(claim_id),
  action TEXT CHECK (action IN ('CREATED', 'MODIFIED', 'VERIFIED', 'ARCHIVED')),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (packet_key, claim_id, action)
);

-- Create indexes for fast claim lookup
CREATE INDEX IF NOT EXISTS idx_claims_story_task ON atlas_agent_claims(story_id, task_id);
CREATE INDEX IF NOT EXISTS idx_claims_agent ON atlas_agent_claims(agent_name);
CREATE INDEX IF NOT EXISTS idx_claims_status ON atlas_agent_claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_supersedes ON atlas_agent_claims(supersedes_claim_id);
CREATE INDEX IF NOT EXISTS idx_tasks_story ON atlas_tasks(story_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON atlas_tasks(status);
CREATE INDEX IF NOT EXISTS idx_verdicts_claim ON atlas_task_verdicts(claim_id);
CREATE INDEX IF NOT EXISTS idx_verdicts_story_task ON atlas_task_verdicts(story_id, task_id);
CREATE INDEX IF NOT EXISTS idx_packet_claims_claim ON atlas_packet_claims(claim_id);
CREATE INDEX IF NOT EXISTS idx_packet_claims_packet ON atlas_packet_claims(packet_key);
