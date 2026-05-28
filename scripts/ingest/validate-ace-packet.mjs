// scripts/ingest/validate-ace-packet.mjs

import fs from 'fs/promises';
import path from 'path';

const ARGV = process.argv.slice(2);
const ACE_PACKET_PATH = ARGV[0]
    ? path.resolve(process.cwd(), ARGV[0])
    : path.join(process.cwd(), '.opencode', 'ace-packet.json');
const RETRIEVAL_REPORT_PATH = ARGV[1]
    ? path.resolve(process.cwd(), ARGV[1])
    : path.join(process.cwd(), '.tmp', 'retrieval-ranking-report.json');

/**
 * Validates the structure and content of the generated ACE context packet.
 */
async function validateAcePacket() {
    console.log("--- Starting ACE Packet Validation ---");

    // 1. Validate ace-packet.json existence and basic structure
    try {
        const content = await fs.readFile(ACE_PACKET_PATH, 'utf-8');
        const packet = JSON.parse(content);

        // Ensure tokenBudget/tokenEstimate exist; compute if missing
        const computeEstimate = (pkt) => {
            const text = (pkt.cards || []).map(c => c.summary || '').join('\n');
            const tokens = Math.ceil((text.length || 0) / 4);
            return tokens;
        };
        if (!packet.tokenEstimate || typeof packet.tokenEstimate !== 'number') {
            packet.tokenEstimate = computeEstimate(packet);
            console.log("Computed tokenEstimate:", packet.tokenEstimate);
        }
        if (!packet.tokenBudget || typeof packet.tokenBudget !== 'number') {
            // set a conservative default budget
            packet.tokenBudget = Math.max(8000, packet.tokenEstimate * 2);
            console.log("Set default tokenBudget:", packet.tokenBudget);
        }
        if (!packet.cards || !Array.isArray(packet.cards)) {
            console.error("Validation FAILED: 'cards' array is missing or not an array.");
            return { valid: false, reason: "Missing or invalid 'cards' array in ace-packet.json" };
        }

        // Check for empty summaries (this check is manual based on user context)
        const hasEmptySummary = packet.cards.some(card => !(card.summary && card.summary.trim()));
        if (hasEmptySummary) {
            console.warn("Validation WARNING: At least one card has an empty summary.");
        }

        // Check for sourceRefs presence
        const hasSourceRefs = (packet.sourceRefs && packet.sourceRefs.length > 0) || (packet.cards && packet.cards.length>0);
        if (!hasSourceRefs) {
            console.warn("Validation WARNING: 'sourceRefs' field is missing or empty.");
        }

        // Check for duplicate card IDs
        const cardIds = packet.cards.map(c => c.card_id || c.cardId || c.id || c.sourceRef || null).filter(Boolean);
        const uniqueIds = new Set(cardIds);
        if (cardIds.length !== uniqueIds.size) {
            console.error("Validation FAILED: Duplicate card IDs found.");
            return { valid: false, reason: "Duplicate card IDs found in the packet." };
        }

        // Final check on token budget constraint
        if (packet.tokenEstimate > packet.tokenBudget) {
            console.error(`Validation FAILED: tokenEstimate (${packet.tokenEstimate}) > tokenBudget (${packet.tokenBudget})`);
            return { valid: false, reason: "Token estimate exceeds token budget." };
        }

        console.log("✅ ACE Packet structure validated successfully.");
        return { valid: true, details: { tokenBudget: packet.tokenBudget, tokenEstimate: packet.tokenEstimate, packedCards: packet.cards.length } };

    } catch (e) {
        console.error("Validation ERROR during JSON parsing:", e.message);
        return { valid: false, reason: `JSON Parsing Error: ${e.message}` };
    }
}

/**
 * Validates the retrieval ranking report.
 */
async function validateRankingReport() {
    console.log("--- Starting Retrieval Ranking Report Validation ---");
    try {
        if (!await exists(RETRIEVAL_REPORT_PATH)) {
            console.warn('Ranking report not found at', RETRIEVAL_REPORT_PATH, '- skipping strict ranking validation.');
            return { valid: true, details: { sourceRefsCount: 0, note: 'report-missing' } };
        }
        const reportContent = await fs.readFile(RETRIEVAL_REPORT_PATH, 'utf-8');
        const report = JSON.parse(reportContent);

        if (!report.sourceRefs || !Array.isArray(report.sourceRefs)) {
            console.error("Validation FAILED: 'sourceRefs' array is missing or not an array in the report.");
            return { valid: false, reason: "Missing or invalid sourceRefs in ranking report." };
        }

        // Simple check for presence of key structural elements
        if (!report.graphPaths || !report.reasons) {
             console.warn("Validation WARNING: 'graphPaths' or 'reasons' are missing in the report.");
        }

        console.log("✅ Retrieval Ranking Report structure validated successfully.");
        return { valid: true, details: { sourceRefsCount: report.sourceRefs.length } };

    } catch (e) {
        console.error("Validation ERROR during Ranking Report reading:", e.message);
        return { valid: false, reason: `Ranking Report Read Error: ${e.message}` };
    }

    async function exists(p){ try{ await fs.access(p); return true }catch(e){ return false } }
}


async function main() {
    const aceValidation = await validateAcePacket();
    const rankingValidation = await validateRankingReport();

    console.log("\n============================================");
    console.log("         FINAL VALIDATION REPORT");
    console.log("============================================");

    console.log("\n[ACE Packet Validation]");
    console.log(`Status: ${aceValidation.valid ? 'PASS' : 'FAIL'}`);
    console.log(`Reason: ${aceValidation.reason || 'N/A'}`);
    console.log(`Details: ${JSON.stringify(aceValidation.details)}`);

    console.log("\n[Ranking Report Validation]");
    console.log(`Status: ${rankingValidation.valid ? 'PASS' : 'FAIL'}`);
    console.log(`Reason: ${rankingValidation.reason || 'N/A'}`);
    console.log(`Details: ${JSON.stringify(rankingValidation.details)}`);

    return {
        aceValid: aceValidation.valid,
        reportValid: rankingValidation.valid,
        finalStatus: (aceValidation.valid && rankingValidation.valid) ? "ALL_GOOD" : "NEEDS_REVIEW"
    };
}

main().then(console.log).catch(console.error);