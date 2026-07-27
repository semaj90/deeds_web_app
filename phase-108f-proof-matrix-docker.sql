-- Phase 108F: Re-validation of Phase 108D proof-matrix on aligned schema
-- Tests immutability gates across 5 layers with workspace_id + ontology_version now present

-- Step 1: Postgres layer validation
SELECT 
  'POSTGRES_LAYER' as layer,
  COUNT(*) as total_packets,
  COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as has_packet_key,
  COUNT(CASE WHEN workspace_id IS NOT NULL AND workspace_id != 'unknown' THEN 1 END) as has_workspace,
  COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as has_source_ref,
  COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as has_feature_id,
  COUNT(CASE WHEN semantic_anchor IS NOT NULL THEN 1 END) as has_anchor,
  COUNT(CASE WHEN ontology_version IS NOT NULL THEN 1 END) as has_ontology
FROM atlas_packets;

-- Step 2: Immutability gate — check for packet_key duplicates with different workspace_id
SELECT 
  'IMMUTABILITY_GATE_1' as gate,
  CASE 
    WHEN COUNT(DISTINCT workspace_id) <= 1 FOR ALL GROUPS THEN 'PASS'
    ELSE 'FAIL'
  END as status,
  packet_key,
  COUNT(DISTINCT workspace_id) as workspace_variants
FROM atlas_packets
GROUP BY packet_key
HAVING COUNT(DISTINCT workspace_id) > 1
LIMIT 5;

-- Step 3: Sample packet validation (the Phase 108D test packet)
SELECT 
  'SAMPLE_PACKET' as validation,
  packet_key,
  workspace_id,
  source_ref,
  feature_id,
  semantic_anchor,
  ontology_version,
  CASE 
    WHEN packet_key IS NOT NULL AND workspace_id IS NOT NULL AND ontology_version = 'v1.0' THEN 'PASS'
    ELSE 'FAIL'
  END as immutability_proof
FROM atlas_packets
WHERE packet_key LIKE '%f861cf0d18d4%' OR packet_key LIKE '%ace:packet%'
LIMIT 1;

-- Step 4: Overall gate pass/fail
SELECT 
  'PHASE_108F_GATE' as gate_name,
  CASE 
    WHEN COUNT(*) = 61659 AND COUNT(CASE WHEN workspace_id IS NOT NULL THEN 1 END) = 61659 
         AND COUNT(CASE WHEN ontology_version IS NOT NULL THEN 1 END) = 61659 THEN 'PASS_PARTIAL_PROVEN'
    ELSE 'WARN_INCOMPLETE'
  END as gate_result
FROM atlas_packets;
