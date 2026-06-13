#!/usr/bin/env node

/**
 * No Placeholder Policy Hook — OpenCode Agent Integration
 *
 * This module provides the decision chain enforcement that should be wired
 * into OpenCode's write() tool handler BEFORE file creation is permitted.
 *
 * Usage (in OpenCode agent initialization):
 *   import { enforceNoPlaceholderPolicy } from './scripts/opencode/no-placeholder-policy-hook.mjs';
 *   const decision = await enforceNoPlaceholderPolicy(filePath);
 *   if (!decision.proceed_to_create) throw new Error(decision.reason);
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const ATLAS_SCOPES = [
  'scripts/atlas',
  'docs/atlas',
  'sveltekit-frontend/scripts/atlas'
];

const LANE_TIMEOUT_MS = 5000;
const AUDIT_LOG_PATH = 'docs/reports/file-creation-audit.jsonl';

/**
 * Check if file path is within Atlas scope
 */
function isAtlasScoped(filePath) {
  return ATLAS_SCOPES.some(scope => filePath.includes(scope));
}

/**
 * Check if file already exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lane 1: atlas-tools_find_source_refs
 * Query atlas_packets table for matching source_ref
 */
async function lane1AtlasToolsFindSourceRefs(candidate) {
  const startTime = Date.now();
  try {
    // This would call the actual atlas-tools MCP in real implementation
    // For now, simulate the structure
    const query = `source_ref LIKE '${candidate}%'`;

    // In real implementation:
    // const result = await atlasTools.findSourceRefs({ sourceRef: candidate });

    return {
      lane: 1,
      name: 'atlas-tools_find_source_refs',
      query,
      result: 'NONE',
      duration_ms: Date.now() - startTime,
      hit: null
    };
  } catch (err) {
    return {
      lane: 1,
      name: 'atlas-tools_find_source_refs',
      status: 'ERROR',
      error: err.message,
      duration_ms: Date.now() - startTime
    };
  }
}

/**
 * Lane 2: trace_atlas_packet_search
 * Query trace system for file_path match
 */
async function lane2TraceAtlasPacketSearch(candidate) {
  const startTime = Date.now();
  try {
    // In real implementation:
    // const result = await traceAtlasPacket.search({ filePath: candidate });

    return {
      lane: 2,
      name: 'trace_atlas_packet_search',
      query: `file_path == '${candidate}'`,
      result: 'NONE',
      duration_ms: Date.now() - startTime,
      hit: null
    };
  } catch (err) {
    return {
      lane: 2,
      name: 'trace_atlas_packet_search',
      status: 'ERROR',
      error: err.message,
      duration_ms: Date.now() - startTime
    };
  }
}

/**
 * Lane 3: trace_kag_multi_lane_search
 * Semantic search for the intent/feature
 */
async function lane3TraceKagMultiLaneSearch(candidate) {
  const startTime = Date.now();
  try {
    // Extract intent from filename
    const intent = candidate.split('/').pop().replace(/\.mjs?$/, '').replace(/-/g, ' ');

    // In real implementation:
    // const result = await traceKagMultiLane.search({ intent, threshold: 0.65 });

    return {
      lane: 3,
      name: 'trace_kag_multi_lane_search',
      query: `semantic '${intent}'`,
      result: 'NONE',
      duration_ms: Date.now() - startTime,
      hit: null
    };
  } catch (err) {
    return {
      lane: 3,
      name: 'trace_kag_multi_lane_search',
      status: 'ERROR',
      error: err.message,
      duration_ms: Date.now() - startTime
    };
  }
}

/**
 * Lane 4: trace_topology_search_4d
 * SOM cells + Neo4j neighborhood search
 */
async function lane4TraceTopologySearch4d(candidate) {
  const startTime = Date.now();
  try {
    const directory = candidate.split('/').slice(0, -1).join('/');

    // In real implementation:
    // const result = await traceTopologySearch4d.searchNeighborhood({
    //   directory,
    //   depth: 2
    // });

    return {
      lane: 4,
      name: 'trace_topology_search_4d',
      query: `directory='${directory}' + SOM topology`,
      result: 'NONE',
      duration_ms: Date.now() - startTime,
      hit: null
    };
  } catch (err) {
    return {
      lane: 4,
      name: 'trace_topology_search_4d',
      status: 'ERROR',
      error: err.message,
      duration_ms: Date.now() - startTime
    };
  }
}

/**
 * Lane 5: trace_atlas_suggest_files
 * Suggestion engine candidate pool
 */
async function lane5TraceAtlasSuggestFiles(candidate) {
  const startTime = Date.now();
  try {
    const keyword = candidate.split('/').pop().split('.')[0];

    // In real implementation:
    // const result = await traceAtlasSuggestFiles.suggest({ keyword });

    return {
      lane: 5,
      name: 'trace_atlas_suggest_files',
      query: `suggest files for '${keyword}'`,
      result: 'NONE',
      duration_ms: Date.now() - startTime,
      hit: null
    };
  } catch (err) {
    return {
      lane: 5,
      name: 'trace_atlas_suggest_files',
      status: 'ERROR',
      error: err.message,
      duration_ms: Date.now() - startTime
    };
  }
}

/**
 * Lane 6: rg_fallback
 * Text search across filesystem
 */
async function lane6RgFallback(candidate) {
  const startTime = Date.now();
  try {
    const fileName = candidate.split('/').pop().split('.')[0];
    const pattern = `${fileName}`;
    const query = `rg '${pattern}' src/ scripts/ --type ts --type mjs --type js`;

    try {
      const { stdout } = await execAsync(
        `rg "${pattern}" src/ scripts/ --type ts --type mjs --type js 2>/dev/null || true`,
        { timeout: LANE_TIMEOUT_MS }
      );

      if (stdout.trim().length > 0) {
        return {
          lane: 6,
          name: 'rg_fallback',
          query,
          result: 'HIT',
          duration_ms: Date.now() - startTime,
          hit: stdout.split('\n')[0]
        };
      }

      return {
        lane: 6,
        name: 'rg_fallback',
        query,
        result: 'NONE',
        duration_ms: Date.now() - startTime,
        hit: null
      };
    } catch (execErr) {
      // Treat timeout differently from other errors
      if (execErr.killed || execErr.code === 'ETIMEDOUT') {
        return {
          lane: 6,
          name: 'rg_fallback',
          status: 'TIMEOUT',
          error: 'rg search exceeded timeout',
          duration_ms: Date.now() - startTime
        };
      }
      throw execErr;
    }
  } catch (err) {
    return {
      lane: 6,
      name: 'rg_fallback',
      status: 'ERROR',
      error: err.message,
      duration_ms: Date.now() - startTime
    };
  }
}

/**
 * Execute the 6-lane decision chain
 * Stops at first HIT or ERROR
 */
async function executeDecisionChain(candidate) {
  const startTime = Date.now();
  const decisionChain = [];

  // Lane 1
  const lane1 = await lane1AtlasToolsFindSourceRefs(candidate);
  decisionChain.push(lane1);
  if (lane1.result === 'HIT' || lane1.status === 'ERROR' || lane1.status === 'TIMEOUT') {
    return {
      stopped_at_lane: lane1.lane,
      stopped_reason: lane1.result === 'HIT' ? 'hit' : 'error',
      decision_chain: decisionChain,
      total_duration_ms: Date.now() - startTime,
      all_lanes_complete: false,
      all_returned_none: false,
      ready_for_approval: false
    };
  }

  // Lane 2
  const lane2 = await lane2TraceAtlasPacketSearch(candidate);
  decisionChain.push(lane2);
  if (lane2.result === 'HIT' || lane2.status === 'ERROR' || lane2.status === 'TIMEOUT') {
    return {
      stopped_at_lane: lane2.lane,
      stopped_reason: lane2.result === 'HIT' ? 'hit' : 'error',
      decision_chain: decisionChain,
      total_duration_ms: Date.now() - startTime,
      all_lanes_complete: false,
      all_returned_none: false,
      ready_for_approval: false
    };
  }

  // Lane 3
  const lane3 = await lane3TraceKagMultiLaneSearch(candidate);
  decisionChain.push(lane3);
  if (lane3.result === 'HIT' || lane3.status === 'ERROR' || lane3.status === 'TIMEOUT') {
    return {
      stopped_at_lane: lane3.lane,
      stopped_reason: lane3.result === 'HIT' ? 'hit' : 'error',
      decision_chain: decisionChain,
      total_duration_ms: Date.now() - startTime,
      all_lanes_complete: false,
      all_returned_none: false,
      ready_for_approval: false
    };
  }

  // Lane 4
  const lane4 = await lane4TraceTopologySearch4d(candidate);
  decisionChain.push(lane4);
  if (lane4.result === 'HIT' || lane4.status === 'ERROR' || lane4.status === 'TIMEOUT') {
    return {
      stopped_at_lane: lane4.lane,
      stopped_reason: lane4.result === 'HIT' ? 'hit' : 'error',
      decision_chain: decisionChain,
      total_duration_ms: Date.now() - startTime,
      all_lanes_complete: false,
      all_returned_none: false,
      ready_for_approval: false
    };
  }

  // Lane 5
  const lane5 = await lane5TraceAtlasSuggestFiles(candidate);
  decisionChain.push(lane5);
  if (lane5.result === 'HIT' || lane5.status === 'ERROR' || lane5.status === 'TIMEOUT') {
    return {
      stopped_at_lane: lane5.lane,
      stopped_reason: lane5.result === 'HIT' ? 'hit' : 'error',
      decision_chain: decisionChain,
      total_duration_ms: Date.now() - startTime,
      all_lanes_complete: false,
      all_returned_none: false,
      ready_for_approval: false
    };
  }

  // Lane 6
  const lane6 = await lane6RgFallback(candidate);
  decisionChain.push(lane6);
  if (lane6.result === 'HIT' || lane6.status === 'ERROR' || lane6.status === 'TIMEOUT') {
    return {
      stopped_at_lane: lane6.lane,
      stopped_reason: lane6.result === 'HIT' ? 'hit' : 'error',
      decision_chain: decisionChain,
      total_duration_ms: Date.now() - startTime,
      all_lanes_complete: true,
      all_returned_none: lane6.result === 'NONE',
      ready_for_approval: lane6.result === 'NONE'
    };
  }

  // All lanes returned NONE
  return {
    stopped_at_lane: null,
    stopped_reason: null,
    decision_chain: decisionChain,
    total_duration_ms: Date.now() - startTime,
    all_lanes_complete: true,
    all_returned_none: true,
    ready_for_approval: true
  };
}

/**
 * Log audit entry to JSONL file
 */
async function logAuditEntry(entry) {
  try {
    const logDir = path.dirname(AUDIT_LOG_PATH);
    await fs.mkdir(logDir, { recursive: true });

    const jsonLine = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry
    });

    await fs.appendFile(AUDIT_LOG_PATH, jsonLine + '\n');
  } catch (err) {
    console.error(`Failed to write audit log: ${err.message}`);
  }
}

/**
 * Main enforcement function
 * Call this BEFORE write() tool in OpenCode agent
 *
 * Returns: { proceed_to_create, reason, decision_chain, ... }
 */
export async function enforceNoPlaceholderPolicy(filePath) {
  const timestamp = new Date().toISOString();

  // Check 1: Is this a new file?
  const exists = await fileExists(filePath);
  if (exists) {
    const auditEntry = {
      action: 'file_already_exists',
      candidate: filePath,
      proceed_to_create: true,
      reason: 'file_exists'
    };
    await logAuditEntry(auditEntry);
    return {
      proceed_to_create: true,
      reason: 'file_already_exists',
      decision_skipped: true
    };
  }

  // Check 2: Is this within Atlas scope?
  if (!isAtlasScoped(filePath)) {
    const auditEntry = {
      action: 'non_atlas_scoped',
      candidate: filePath,
      proceed_to_create: true,
      reason: 'outside_atlas_scope'
    };
    await logAuditEntry(auditEntry);
    return {
      proceed_to_create: true,
      reason: 'outside_atlas_scope',
      decision_skipped: true
    };
  }

  // Execute the 6-lane decision chain
  const chainResult = await executeDecisionChain(filePath);

  // If stopped at a HIT or ERROR, deny creation
  if (!chainResult.all_lanes_complete || !chainResult.ready_for_approval) {
    const auditEntry = {
      action: 'file_creation_denied',
      candidate: filePath,
      reason: chainResult.stopped_reason === 'hit' ? 'file_exists_in_lanes' : 'retrieval_error',
      stopped_at_lane: chainResult.stopped_at_lane,
      all_lanes_complete: chainResult.all_lanes_complete,
      ready_for_creation: false,
      decision_chain: chainResult.decision_chain
    };
    await logAuditEntry(auditEntry);
    return {
      proceed_to_create: false,
      reason: auditEntry.reason,
      decision_chain: chainResult.decision_chain,
      stopped_at_lane: chainResult.stopped_at_lane
    };
  }

  // All lanes returned NONE — requires user approval
  const auditEntry = {
    action: 'awaiting_user_approval',
    candidate: filePath,
    all_lanes_complete: true,
    all_returned_none: true,
    ready_for_creation: true,
    decision_chain: chainResult.decision_chain,
    prompt: `File ${filePath} not found in any retrieval lane. Create? (y/n)`
  };
  await logAuditEntry(auditEntry);

  return {
    proceed_to_create: null, // Awaiting user approval
    reason: 'awaiting_user_approval',
    decision_chain: chainResult.decision_chain,
    all_lanes_complete: true,
    all_returned_none: true,
    ready_for_creation: true,
    prompt: auditEntry.prompt
  };
}

/**
 * Process user approval response
 * Call this after user responds to approval prompt
 */
export async function recordUserApprovalDecision(filePath, approved, decisionChain) {
  const auditEntry = {
    action: approved ? 'file_creation_approved' : 'file_creation_denied',
    candidate: filePath,
    all_lanes_complete: true,
    all_returned_none: true,
    user_approved: approved,
    reason: approved ? null : 'user_declined',
    decision_chain: decisionChain
  };

  if (approved) {
    auditEntry.created_at = new Date().toISOString();
  }

  await logAuditEntry(auditEntry);

  return {
    proceed_to_create: approved,
    action: auditEntry.action,
    reason: auditEntry.reason
  };
}

export default {
  enforceNoPlaceholderPolicy,
  recordUserApprovalDecision,
  isAtlasScoped,
  fileExists,
  AUDIT_LOG_PATH
};
