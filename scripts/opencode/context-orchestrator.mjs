/**
 * @fileoverview Core Context Orchestrator.
 * @description This module enforces the Knowledge Card Validation Gate across all incoming user queries.
 *              It acts as the single entry point for all context consumption, ensuring that no RAG/Synthesis
 *              operation occurs without first validating the context against alias mappings and schema rules.
 * @module contextOrchestrator
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRecommendation } from './validation-gate.mjs';
import { resolveAliases } from './alias-card-mapper.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIRS_ATLAS_PATH = path.join(REPO_ROOT, 'sveltekit-frontend/memory/atlas/codebase-atlas.dirs.json');
const DEFAULT_ALIAS_MAP_PATH = path.join(REPO_ROOT, 'sveltekit-frontend/memory/atlas/implementation-intent-aliases.json');

function matchDirectoryContextCards(userQuery, domain, maxCards = 6) {
    if (!fs.existsSync(DIRS_ATLAS_PATH)) return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(DIRS_ATLAS_PATH, 'utf8'));
        const tokens = String(userQuery ?? '')
            .toLowerCase()
            .split(/[^a-z0-9_/-]+/)
            .filter((t) => t.length >= 3);
        const domainNorm = String(domain ?? '').toLowerCase();

        const scored = [];
        for (const card of parsed.cards ?? []) {
            const hay = `${card.d} ${(card.topo ?? []).join(' ')} ${(card.tags ?? []).join(' ')} ${(card.top ?? []).join(' ')}`.toLowerCase();
            let hits = 0;
            for (const tok of tokens) {
                if (hay.includes(tok)) hits += 1;
            }
            if (domainNorm && domainNorm !== 'general' && hay.includes(domainNorm)) hits += 2;
            if (hits > 0) {
                scored.push({ score: hits + Number(card.rank ?? 0), card });
            }
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, maxCards).map((s) => s.card);
    } catch {
        return [];
    }
}

/**
 * @async
 * @function processQueryWithGate
 * @description Primary entry point. Processes a user query by building real directory-card context and validating it against the read-only gate.
 * @param {string} userQuery - The raw query from the user.
 * @param {string} domain - The domain of the query (e.g., 'schema', 'retrieval').
 * @returns {Promise<{status: string, final_context: string|null, next_action: string, matched_source_refs?: string[]}>} The outcome of the gate check.
 */
async function processQueryWithGate(userQuery, domain = 'general') {
    const matchedCards = matchDirectoryContextCards(userQuery, domain, 6);
    const sourceRefs = matchedCards.flatMap((c) => (c.top ?? []).slice(0, 2)).slice(0, 10);

    const initialContext = {
        sourceRefs: sourceRefs.length > 0 ? sourceRefs : ['sveltekit-frontend/memory/atlas/codebase-atlas.dirs.json'],
        matchedDirectories: matchedCards.map((c) => c.d),
        rawQuery: userQuery,
        estimatedTokens: Math.min(8000, 400 + matchedCards.length * 350),
        domain,
    };

    const uuidRegex = /([0-9a-fA-F]{16,36})/g;
    const queryUuids = [...String(userQuery ?? '').matchAll(uuidRegex)].map((m) => m[1]);
    const aliasResult = queryUuids.length > 0 && fs.existsSync(DEFAULT_ALIAS_MAP_PATH)
        ? await resolveAliases(queryUuids, DEFAULT_ALIAS_MAP_PATH)
        : { resolved: {}, unresolved: queryUuids, totalChecked: queryUuids.length };
    initialContext.aliases = aliasResult.resolved;

    try {
        const validationResult = await validateRecommendation(
            {
                isHighRisk: domain === 'database' || domain === 'schema' || /drift|migration/i.test(userQuery),
                recommendation: matchedCards.length > 0
                    ? `Inspect verified candidates in ${matchedCards.slice(0, 3).map((c) => c.d).join(', ')}`
                    : 'Run bounded atlas_context lookup before proposing edits.',
                sourceRef: initialContext.sourceRefs[0],
            },
            userQuery
        );

        return {
            status: 'SUCCESS',
            final_context: validationResult.report,
            next_action: validationResult.nextAction,
            matched_source_refs: initialContext.sourceRefs,
        };
    } catch (error) {
        console.error('[ORCHESTRATOR FAILURE] Gate execution failed:', error.message);
        return {
            status: 'GATE_FAILURE',
            final_context: `[CRITICAL] Validation Gate failed during execution. Manual intervention required. Error: ${error.message}`,
            next_action: 'Review orchestrator logic for immediate fix.',
            matched_source_refs: initialContext.sourceRefs,
        };
    }
}

// Expose the main function for external tool calls
export { processQueryWithGate };

// Example of running the gate check on a query
const testQuery = "How do I handle a missing sourceRef when querying for 'drizzle-sidecar-audit'?";
// Note: Execution must be done via a dedicated run script to avoid blocking the module load.
// processQueryWithGate(testQuery, 'retrieval').then(result => { ... }); 
// (Execution removed to prevent blocking module loading)