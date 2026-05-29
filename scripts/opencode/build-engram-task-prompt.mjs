#!/usr/bin/env node
import { normalizeTaskPayload, validateTaskPayload } from './normalize-task-payload.mjs';
import fs from 'fs/promises';
import { execSync } from 'child_process';

async function readEngram() {
  // Try running get-engram-context.mjs which prints JSON { key, data }
  try {
    const out = execSync('node scripts/opencode/get-engram-context.mjs', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    try {
      const parsed = JSON.parse(out);
      // parsed may be { key, data } or { file, data }
      return parsed.data || {};
    } catch (e) {
      return {};
    }
  } catch (e) {
    return {};
  }
}

async function main() {
  const engram = await readEngram();

  const base = {
    description: engram.description || engram.title || 'Run Atlas audit using retrieved Engram context.',
    context: {
      user_goal: engram.user_goal || engram.goal || '',
      recent_memory: engram.recent_memory || engram.memory || [],
      ace_packet_key: 'ace:packet:latest',
      engram_key: 'engram:user:chat:latest'
    },
    constraints: [
      'Windows safe',
      'Do not read raw /dev filesystem; use process.stdin/process.stdout APIs',
      'Do not run heavy ingestion unless requested'
    ],
    expected_output: {
      likely_cause: '',
      patch_targets: [],
      safe_next_command: '',
      do_not_do: []
    }
  };

  const normalized = normalizeTaskPayload(Object.assign({}, base, engram));
  if (!validateTaskPayload(normalized)) {
    console.error('Normalized payload failed validation');
    process.exit(1);
  }

  // Print JSON to stdout for piping
  console.log(JSON.stringify(normalized, null, 2));
}

main();

/**
 * @fileoverview Build Engram/Redis memory into a standardized OpenCode Task Payload structure.
 * @description This script reads transient memory from Redis (Engram) and transforms it into a JSON object
 * that strictly conforms to the expected payload schema for OpenCode task delegation, guaranteeing
 * the presence of a root-level 'description'.
 *
 * @requires redis, dotenv, fs, path, etc.
 * @module scripts/opencode/build-engram-task-prompt.mjs
 */
import { Redis } from 'ioredis';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';

const redisClient = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    retryStrategy: (times) => Math.min(times, 200),
});

/**
 * Reads the necessary context from Redis/Engram memory based on a provided run ID.
 * @param {string} runId - The session identifier for context retrieval.
 * @returns {Promise<object>} - A promise that resolves with the raw memory object or an error state.
 */
async function readEngramContext(runId) {
    console.log("Attempting to read Engram context from Redis...");
    try {
        // Attempt to read the primary ACE packet first
        const acePacketKey = `ace:packet:${runId}`;
        let value = await redisClient.get(acePacketKey);

        if (value) {
            console.log(`[SUCCESS] Found ACE packet key: ${acePacketKey}`);
            return JSON.parse(value);
        } else {
            console.warn(`[WARN] ACE packet key not found: ${acePacketKey}. Falling back to general chat memory.`);
            // Fallback to general chat memory if ACE packet is missing
            const chatMemoryKey = `ace:chat:memory:${runId}`;
            value = await redisClient.get(chatMemoryKey);
            if (value) {
                return JSON.parse(value);
            }
            return null;
        }
    } catch (error) {
        console.error("[ERROR] Failed to read context from Redis:", error.message);
        return null;
    }
}

/**
 * Constructs the required OpenCode payload object using retrieved memory and fallback logic.
 * @param {object | null} rawContext - The raw context read from Redis.
 * @param {string} userGoal - The primary intent of the task.
 * @returns {object} - The fully structured task payload.
 */
function buildTaskPayload(rawContext, userGoal) {
    const fallbackContext = {
        description: `Atlas diagnostic task triggered by user goal: ${userGoal}. Redis context was unavailable or incomplete.`,
        context: {
            recent_memory: [],
            ace_packet_key: 'N/A',
            engram_key: 'N/A',
            source_fallback: 'No specific memory context found.'
        },
        constraints: [
            "Windows safe environment.",
            "Do not read raw /dev filesystem; use process.stdin/process.stdout APIs.",
            "Do not run heavy ingestion unless explicitly requested by the user."
        ],
        expected_output: {
            likely_cause: "Context retrieval failed or was empty.",
            evidence: [],
            patch_targets: [],
            safe_next_command: "Run 'npm run opencode:find-feature' to diagnose missing components.",
            do_not_do: ["Attempt to read full files."]
        }
    };

    if (rawContext) {
        // This logic assumes the rawContext structure contains necessary fields from the Redis write.
        const structuredPayload = {
            description: `OpenCode task payload generated based on Redis memory for goal: ${userGoal}.`,
            context: {
                recent_memory: rawContext.cards || [], // Assuming 'cards' or similar structure is present
                ace_packet_key: rawContext.runId || 'N/A',
                engram_key: rawContext.sourceRef || 'N/A',
                source_fallback: rawContext.summary || 'Context available via ACE packet.'
            },
            constraints: rawContext.constraints || fallbackContext.constraints,
            expected_output: {
                likely_cause: "N/A",
                evidence: rawContext.evidence || [],
                patch_targets: rawContext.patch_targets || [],
                safe_next_command: rawContext.safe_next_command || 'Continue with next step.',
                do_not_do: rawContext.do_not_do || fallbackContext.do_not_do
            }
        };
        return structuredPayload;
    } else {
        return fallbackContext;
    }
}

/**
 * Main function to orchestrate the payload generation.
 * @param {string} runId - The unique run ID for the session.
 * @param {string} userGoal - The user's original query/goal.
 */
async function main(runId, userGoal) {
    console.log("--- Starting OpenCode Task Payload Builder ---");

    // 1. Read Memory
    const rawContext = await readEngramContext(runId);

    // 2. Build Payload
    const finalPayload = buildTaskPayload(rawContext, userGoal);

    console.log("\\n=====================================================");
    console.log("✅ PAYLOAD GENERATION COMPLETE. Outputting structured payload:");
    console.log("=====================================================");
    // Normalize final payload to enforce Atlas context schema
    const normalizedFinal = normalizeTaskPayload(finalPayload);
    if (!validateTaskPayload(normalizedFinal)) {
      console.error('Final payload failed validation');
      process.exit(1);
    }
    console.log(JSON.stringify(normalizedFinal, null, 2));
    console.log("=====================================================");

    process.exit(0);
}

// --- Execution Simulation (For testing purposes) ---
// In a real scenario, this script would be called by another tool/script providing runId and userGoal.
// For demonstration, we simulate a call:
const TEST_RUN_ID = "simulated-run-id";
const TEST_USER_GOAL = "Consolidate all architectural knowledge cards.";

// To test the full flow, you would need to first populate Redis with a dummy ACE packet.
// For this initial write, we just show the structure.
main(TEST_RUN_ID, TEST_USER_GOAL);
