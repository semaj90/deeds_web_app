-- Rollback-only canary checks for WORKSPACE-EVENT-BRIDGE-01 (TRCF-21). Run inside BEGIN ... ROLLBACK after the base sidecar and the DRAFT; every row is throwaway.
-- Run: { echo "BEGIN;"; cat sveltekit-frontend/drizzle/manual/20260916_workspace_event_head_v1.sql sveltekit-frontend/drizzle/manual/20261017_workspace_event_provenance_v1_DRAFT.sql scripts/atlas/sql/prove-workspace-event-provenance-canary-v1.sql; echo "ROLLBACK;"; } | docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db -v ON_ERROR_STOP=1
DO $$
DECLARE
  h64 text := repeat('a', 64);
  ev  uuid := '00000000-0000-4000-8000-000000000001';
  ev2 uuid := '00000000-0000-4000-8000-000000000002';
  ev3 uuid := '00000000-0000-4000-8000-000000000003';
  ev4 uuid := '00000000-0000-4000-8000-000000000004';
  lease1 uuid := '00000000-0000-4000-8000-0000000000a1';
BEGIN
  -- 0. objects exist
  IF to_regclass('public.atlas_workspace_events') IS NULL
     OR to_regclass('public.atlas_workspace_event_participants') IS NULL
     OR to_regclass('public.atlas_workspace_heads') IS NULL
     OR to_regclass('public.atlas_workspace_event_observations') IS NULL
     OR to_regclass('public.worktree_leases') IS NULL THEN
    RAISE EXCEPTION 'CANARY_FAIL objects missing';
  END IF;
  RAISE NOTICE 'PASS 0 all five tables created';

  -- 1. full provenance accepted
  INSERT INTO public.atlas_workspace_events
    (event_id, workspace_id, sequence, base_snapshot_revision, previous_head_revision, workspace_head_revision,
     delta_root_checksum, event_type, occurred_at, correlation_id, producer_revision, after_state_checksum, event_checksum,
     task_id, execution_run_id, lease_id, lease_fence_token, lease_fence_epoch, worktree_id, branch, base_commit, actor, idempotency_key)
  VALUES (ev, 'repo#wt-a', 1, 'b', 'p', 'h1', h64, 'SOURCE_UPDATED', now(), ev, 'canary', h64, repeat('1', 64),
     'task:T1', 'run-1', lease1, 'fence-7', 3, 'wt/a', 'agent/t1', 'abc123', 'agent-a', 'k1');
  RAISE NOTICE 'PASS 1 full provenance accepted';

  -- 2. partial provenance rejected
  BEGIN
    INSERT INTO public.atlas_workspace_events
      (event_id, workspace_id, sequence, base_snapshot_revision, previous_head_revision, workspace_head_revision,
       delta_root_checksum, event_type, occurred_at, correlation_id, producer_revision, after_state_checksum, event_checksum, task_id)
    VALUES (ev2, 'repo#wt-a', 2, 'b', 'p', 'h2', h64, 'SOURCE_UPDATED', now(), ev2, 'canary', h64, repeat('2', 64), 'task:T1');
    RAISE EXCEPTION 'CANARY_FAIL partial provenance accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 2 partial provenance rejected';
  END;

  -- 3. same idempotency key in the same stream rejected (different sequence + checksum)
  BEGIN
    INSERT INTO public.atlas_workspace_events
      (event_id, workspace_id, sequence, base_snapshot_revision, previous_head_revision, workspace_head_revision,
       delta_root_checksum, event_type, occurred_at, correlation_id, producer_revision, after_state_checksum, event_checksum,
       task_id, execution_run_id, lease_id, lease_fence_token, lease_fence_epoch, worktree_id, branch, base_commit, actor, idempotency_key)
    VALUES (ev2, 'repo#wt-a', 2, 'b', 'h1', 'h2', h64, 'SOURCE_UPDATED', now(), ev2, 'canary', h64, repeat('3', 64),
       'task:T1', 'run-1', lease1, 'fence-7', 3, 'wt/a', 'agent/t1', 'abc123', 'agent-a', 'k1');
    RAISE EXCEPTION 'CANARY_FAIL duplicate idempotency key accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS 3 duplicate idempotency key rejected';
  END;

  -- 4. same key in a DIFFERENT stream is independent (separate worktree)
  INSERT INTO public.atlas_workspace_events
    (event_id, workspace_id, sequence, base_snapshot_revision, previous_head_revision, workspace_head_revision,
     delta_root_checksum, event_type, occurred_at, correlation_id, producer_revision, after_state_checksum, event_checksum,
     task_id, execution_run_id, lease_id, lease_fence_token, lease_fence_epoch, worktree_id, branch, base_commit, actor, idempotency_key)
  VALUES (ev3, 'repo#wt-b', 1, 'b', 'p', 'h1', h64, 'SOURCE_UPDATED', now(), ev3, 'canary', h64, repeat('4', 64),
     'task:T2', 'run-9', lease1, 'fence-1', 1, 'wt/b', 'agent/t2', 'abc123', 'agent-b', 'k1');
  RAISE NOTICE 'PASS 4 independent worktree stream not blocked by the same key';

  -- 5. events without provenance may share a NULL idempotency key (partial unique ignores NULL)
  INSERT INTO public.atlas_workspace_events
    (event_id, workspace_id, sequence, base_snapshot_revision, previous_head_revision, workspace_head_revision,
     delta_root_checksum, event_type, occurred_at, correlation_id, producer_revision, after_state_checksum, event_checksum)
  VALUES (ev4, 'repo#legacy', 1, 'b', 'p', 'h1', h64, 'SOURCE_UPDATED', now(), ev4, 'canary', h64, repeat('5', 64));
  INSERT INTO public.atlas_workspace_events
    (event_id, workspace_id, sequence, base_snapshot_revision, previous_head_revision, workspace_head_revision,
     delta_root_checksum, event_type, occurred_at, correlation_id, producer_revision, after_state_checksum, event_checksum)
  VALUES ('00000000-0000-4000-8000-000000000005', 'repo#legacy', 2, 'b', 'h1', 'h2', h64, 'SOURCE_UPDATED', now(),
     ev4, 'canary', h64, repeat('6', 64));
  RAISE NOTICE 'PASS 5 legacy events without provenance still insert';

  -- 6. supersedes FK: missing target rejected, existing target accepted
  BEGIN
    INSERT INTO public.atlas_workspace_events
      (event_id, workspace_id, sequence, base_snapshot_revision, previous_head_revision, workspace_head_revision,
       delta_root_checksum, event_type, occurred_at, correlation_id, producer_revision, after_state_checksum, event_checksum, supersedes_event_id)
    VALUES ('00000000-0000-4000-8000-000000000006', 'repo#legacy', 3, 'b', 'h2', 'h3', h64, 'SOURCE_UPDATED', now(), ev4, 'canary', h64,
       repeat('7', 64), '00000000-0000-4000-8000-0000000000ff');
    RAISE EXCEPTION 'CANARY_FAIL dangling supersedes accepted';
  EXCEPTION WHEN foreign_key_violation THEN RAISE NOTICE 'PASS 6a dangling supersedes rejected';
  END;
  INSERT INTO public.atlas_workspace_events
    (event_id, workspace_id, sequence, base_snapshot_revision, previous_head_revision, workspace_head_revision,
     delta_root_checksum, event_type, occurred_at, correlation_id, producer_revision, after_state_checksum, event_checksum, supersedes_event_id)
  VALUES ('00000000-0000-4000-8000-000000000007', 'repo#legacy', 3, 'b', 'h2', 'h3', h64, 'SOURCE_UPDATED', now(), ev4, 'canary', h64,
     repeat('8', 64), ev4);
  RAISE NOTICE 'PASS 6b valid supersedes accepted';

  -- 7. immutability: events and observations cannot be updated
  BEGIN
    UPDATE public.atlas_workspace_events SET actor = 'tampered' WHERE event_id = ev;
    RAISE EXCEPTION 'CANARY_FAIL event update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ATLAS_WORKSPACE_EVENT_IMMUTABLE%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 7a event update blocked';
  END;
  INSERT INTO public.atlas_workspace_event_observations (event_id, approval, tool) VALUES (ev, 'PENDING', 'edit');
  INSERT INTO public.atlas_workspace_event_observations (event_id, approval, decided_by) VALUES (ev, 'APPROVED', 'operator');
  BEGIN
    UPDATE public.atlas_workspace_event_observations SET approval = 'REJECTED';
    RAISE EXCEPTION 'CANARY_FAIL observation update accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'ATLAS_WORKSPACE_EVENT_IMMUTABLE%' THEN RAISE; END IF;
    RAISE NOTICE 'PASS 7b observation update blocked, appends allowed';
  END;
  IF (SELECT approval FROM public.atlas_workspace_event_observations WHERE event_id = ev ORDER BY observation_id DESC LIMIT 1) <> 'APPROVED' THEN
    RAISE EXCEPTION 'CANARY_FAIL latest observation is not APPROVED';
  END IF;
  RAISE NOTICE 'PASS 7c latest observation row is current approval state';

  -- 8. head FK to events
  INSERT INTO public.atlas_workspace_heads
    (workspace_id, base_snapshot_revision, last_event_sequence, last_event_id, last_event_checksum, delta_root_checksum, workspace_head_revision)
  VALUES ('repo#wt-a', 'b', 1, ev, repeat('1', 64), h64, 'h1');
  RAISE NOTICE 'PASS 8 head row referencing event accepted';

  -- 9. worktree leases: one ACTIVE lease per path, status CHECK, reuse after release
  INSERT INTO public.worktree_leases (task_id, run_id, owner_agent, repository_root, worktree_path, branch_name, base_commit, status)
  VALUES ('task:T1', 'run-1', 'agent-a', 'C:/repo', 'C:/wt/a', 'agent/t1', 'abc123', 'ACTIVE');
  BEGIN
    INSERT INTO public.worktree_leases (task_id, run_id, owner_agent, repository_root, worktree_path, branch_name, base_commit, status)
    VALUES ('task:T2', 'run-2', 'agent-b', 'C:/repo', 'C:/wt/a', 'agent/t2', 'abc123', 'ACTIVE');
    RAISE EXCEPTION 'CANARY_FAIL second active lease on same path accepted';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'PASS 9a second active lease on same path rejected';
  END;
  BEGIN
    INSERT INTO public.worktree_leases (task_id, owner_agent, repository_root, worktree_path, branch_name, base_commit, status)
    VALUES ('task:T3', 'agent-c', 'C:/repo', 'C:/wt/c', 'agent/t3', 'abc123', 'BOGUS');
    RAISE EXCEPTION 'CANARY_FAIL invalid lease status accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 9b invalid lease status rejected';
  END;
  UPDATE public.worktree_leases SET status = 'RELEASED', released_at = now() WHERE worktree_path = 'C:/wt/a';
  INSERT INTO public.worktree_leases (task_id, run_id, owner_agent, repository_root, worktree_path, branch_name, base_commit, status)
  VALUES ('task:T2', 'run-2', 'agent-b', 'C:/repo', 'C:/wt/a', 'agent/t2', 'abc123', 'ACTIVE');
  RAISE NOTICE 'PASS 9c path reusable after release';

  -- 10. lease fence_epoch: defaults to 1, must be positive, and is monotonic by UPDATE
  IF (SELECT fence_epoch FROM public.worktree_leases WHERE worktree_path = 'C:/wt/a' AND status = 'ACTIVE') <> 1 THEN
    RAISE EXCEPTION 'CANARY_FAIL fence_epoch default is not 1';
  END IF;
  BEGIN
    INSERT INTO public.worktree_leases (task_id, owner_agent, repository_root, worktree_path, branch_name, base_commit, fence_epoch)
    VALUES ('task:T4', 'agent-d', 'C:/repo', 'C:/wt/d', 'agent/t4', 'abc123', 0);
    RAISE EXCEPTION 'CANARY_FAIL fence_epoch 0 accepted';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS 10a fence_epoch must be positive';
  END;
  UPDATE public.worktree_leases SET fence_epoch = fence_epoch + 1 WHERE worktree_path = 'C:/wt/a' AND status = 'ACTIVE';
  IF (SELECT fence_epoch FROM public.worktree_leases WHERE worktree_path = 'C:/wt/a' AND status = 'ACTIVE') <> 2 THEN
    RAISE EXCEPTION 'CANARY_FAIL fence_epoch did not advance';
  END IF;
  RAISE NOTICE 'PASS 10b fence_epoch defaults to 1 and advances';

  RAISE NOTICE 'CANARY_ALL_PASS';
END
$$;
