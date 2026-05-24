import fs from 'node:fs';
import path from 'node:path';

const out = 'memory/subagents/subagent-log.jsonl';
fs.mkdirSync(path.dirname(out), { recursive: true });

/**
 * Logs a subagent event to the JSONL memory log file.
 * @param {string} agentName - The calling agent/system component.
 * @param {string} subagentName - The subagent that failed or encountered an issue.
 * @param {string} taskDescription - The task context for the failure.
 * @param {string} status - The status of the operation (e.g., 'blocked', 'error').
 * @param {string} reason - Detailed reason for the failure.
 * @param {string[]} toolsTried - List of tools attempted during the failure.
 * @param {string[]} sourceRefs - List of source references used/found.
 */
function logSubagentEvent(agentName, subagentName, taskDescription, status, reason, toolsTried = [], sourceRefs = []) {
    try {
        const event = {
            ts: new Date().toISOString(),
            agent: agentName,
            subagent: subagentName,
            task: taskDescription,
            status: status,
            reason: reason,
            toolsTried: toolsTried,
            sourceRefs: sourceRefs,
            // nextAction and confidence can be derived or left null/defaulted based on context
            nextAction: 'Review logs for recovery strategy.',
            confidence: 0.5
        };

        // Append the serialized JSON object followed by a newline character
        fs.appendFileSync(out, JSON.stringify(event) + '\n');

        console.log(JSON.stringify({ ok: true, event }, null, 2));
    } catch (error) {
        console.error("Failed to write subagent log event:", error.message);
    }
}

// --- Command Line Interface ---
// Usage: node scripts/agent/log-subagent.mjs <agent> <subagent> "<task>" <status> "reason" ["tool1", "tool2"] ["sourceRef1", ...]
// Example: node scripts/agent/log-subagent.mjs trace-audit drizzle-schema-review "audit sidecar migrations" blocked "missing script paths" ["rg", "package.json search"] ["sourceRef1"]

if (process.argv.length < 7) {
    console.error("Usage: node scripts/agent/log-subagent.mjs <agent> <subagent> \"<task>\" <status> \"<reason>\" [tool1] [tool2] ...");
    process.exit(1);
}

const agentName = process.argv[2];
const subagentName = process.argv[3];
const taskDescription = process.argv[4];
const status = process.argv[5];
const reason = process.argv[6];
const toolsTried = process.argv.slice(7, 7 + (process.argv.length - 7));
const sourceRefs = process.argv.slice(7 + (process.argv.length - 7), process.argv.length);

logSubagentEvent(agentName, subagentName, taskDescription, status, reason, toolsTried, sourceRefs);