/**
 * Contextual Prompt Engineer for Svelte 5 Migrations
 * Downloads Svelte docs, uses ripgrep for keyword extraction, injects into Gemma3 prompts
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { llamaChat } from '../../../scripts/atlas/lib/llama-inference.mjs';

// Svelte docs URLs
const DOCS_URLS = {
    svelte: 'https://svelte.dev/docs/svelte/llms.txt',
    sveltekit: 'https://svelte.dev/docs/kit/llms.txt'
};

const DOCS_DIR = 'data/svelte-docs';
const CACHE_FILE = `${DOCS_DIR}/docs-cache.json`;

/**
 * Download Svelte docs if not cached
 */
async function ensureDocs(forceDownload = false) {
    if (!existsSync(DOCS_DIR)) {
        mkdirSync(DOCS_DIR, { recursive: true });
    }

    const cache = existsSync(CACHE_FILE)
        ? JSON.parse(readFileSync(CACHE_FILE, 'utf-8'))
        : { lastFetch: 0 };

    const now = Date.now();
    const cacheAge = now - cache.lastFetch;
    const ONE_DAY = 24 * 60 * 60 * 1000;

    if (forceDownload || cacheAge > ONE_DAY) {
        console.log(`📥 ${forceDownload ? 'Force downloading' : 'Downloading'} Svelte docs${forceDownload ? '' : ' (cache older than 24h)'}...`);

        for (const [name, url] of Object.entries(DOCS_URLS)) {
            const filePath = join(DOCS_DIR, `${name}.txt`);
            console.log(`   Fetching ${name}...`);

            try {
                const response = await fetch(url);
                const text = await response.text();
                writeFileSync(filePath, text, 'utf-8');
                console.log(`   ✅ Saved to ${filePath}`);
            } catch (error) {
                console.error(`   ❌ Failed to fetch ${name}: ${error.message}`);
            }
        }

        cache.lastFetch = now;
        writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    } else {
        console.log(`✅ Using cached docs (${Math.floor(cacheAge / 1000 / 60)} minutes old)`);
    }
}

/**
 * Use ripgrep to search Svelte docs for keywords
 */
function searchDocs(keywords) {
    const results = {};

    for (const [name, _] of Object.entries(DOCS_URLS)) {
        const filePath = join(DOCS_DIR, `${name}.txt`);

        if (!existsSync(filePath)) {
            console.warn(`⚠️  ${filePath} not found, skipping`);
            continue;
        }

        // Build ripgrep command with context lines
        const keywordPattern = keywords.join('|');

        try {
            // Use ripgrep with context (-C 3 lines before/after) and limit to first 10 matches
            const output = execSync(
                `rg -i -C 3 -m 10 "${keywordPattern}" "${filePath}"`,
                { encoding: 'utf-8' }
            ).trim();

            if (output) {
                results[name] = output;
            }
        } catch (error) {
            // ripgrep exits with code 1 if no matches found
            if (error.status === 1) {
                results[name] = null;
            } else {
                console.error(`❌ ripgrep error for ${name}: ${error.message}`);
            }
        }
    }

    return results;
}

/**
 * Extract relevant context from docs
 */
function extractContext(searchResults) {
    let context = '';
    const MAX_CONTEXT_LENGTH = 5000; // Limit to ~5KB of context

    for (const [docName, content] of Object.entries(searchResults)) {
        if (content) {
            // Truncate content if too long
            const truncatedContent = content.length > MAX_CONTEXT_LENGTH
                ? content.substring(0, MAX_CONTEXT_LENGTH) + '\n... (truncated for brevity)'
                : content;

            context += `\n═══ From ${docName} docs ═══\n${truncatedContent}\n`;
        }
    }

    return context.trim();
}

/**
 * Build contextual prompt with Svelte 5 enforcement
 */
function buildContextualPrompt(userQuery, keywords) {
    // Search docs for relevant sections
    const searchResults = searchDocs(keywords);
    const docsContext = extractContext(searchResults);

    // Build the system prompt with Svelte 5 enforcement
    const systemPrompt = `You are a Svelte 5 Expert and Migration Specialist.

STRICT RULES:
1. You enforce "Runes" syntax ($state, $derived, $effect, $props)
2. You REJECT "export let" → Use $props() instead
3. You REJECT "$:" labels → Use $derived() or $effect() instead
4. You REJECT jQuery and legacy libraries → Use native DOM or Svelte features
5. You REJECT "new Component()" → Use mount() from @svelte/element

${docsContext ? `RELEVANT DOCUMENTATION:\n${docsContext}\n` : ''}

When suggesting code:
- Always use Svelte 5 Runes syntax
- Provide before/after examples
- Explain WHY the old pattern is deprecated
- Show the migration path step-by-step`;

    const fullPrompt = `${systemPrompt}\n\nUSER QUESTION:\n${userQuery}`;

    return fullPrompt;
}

/**
 * Query Ollama with contextual prompt
 */
async function queryOllamaWithContext(userQuery, keywords = []) {
    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║  Contextual Svelte 5 Query with Gemma3                       ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

    // Ensure docs are downloaded
    await ensureDocs();

    // Auto-detect keywords from query if not provided
    if (keywords.length === 0) {
        const autoKeywords = [];
        const patterns = {
            'export let': ['export let', 'props', '$props'],
            '$:': ['\\$:', 'reactive', '$derived', '$effect'],
            'new Component': ['new Component', 'mount', 'instantiation'],
            'onMount': ['onMount', '$effect', 'lifecycle'],
            'state': ['$state', 'reactivity', 'let'],
            'store': ['$store', 'writable', '$state']
        };

        for (const [pattern, kws] of Object.entries(patterns)) {
            if (userQuery.toLowerCase().includes(pattern.toLowerCase())) {
                autoKeywords.push(...kws);
            }
        }

        keywords = [...new Set(autoKeywords)]; // dedupe
    }

    console.log(`🔍 Searching docs for keywords: ${keywords.join(', ')}\n`);

    // Build contextual prompt
    const prompt = buildContextualPrompt(userQuery, keywords);

    console.log(`📏 Prompt length: ${prompt.length} chars\n`);
    console.log(`⏳ Querying Ollama (gemma3-legal)...\n`);

    try {
        const t0 = Date.now();
        // Chat/generation goes to llama-server (Ornith 1.5); Ollama is embeddings-only.
        const data = { response: await llamaChat(prompt, { maxTokens: 2048, temperature: 0.7, timeoutMs: 180_000 }) };
        data.total_duration = (Date.now() - t0) * 1e6;
        data.eval_count = 'n/a';
        if (data.response != null) {

            console.log(`✅ Response:\n`);
            console.log(`${'━'.repeat(70)}`);
            console.log(data.response);
            console.log(`${'━'.repeat(70)}\n`);

            console.log(`📊 Stats:`);
            console.log(`   Tokens: ${data.eval_count}`);
            console.log(`   Time: ${(data.total_duration / 1e9).toFixed(2)}s`);
            console.log(`   Context included: ${keywords.length} keyword patterns\n`);

            // Save result
            const outputFile = `${DOCS_DIR}/query-result-${Date.now()}.md`;
            writeFileSync(outputFile, `# Query: ${userQuery}\n\n## Keywords\n${keywords.join(', ')}\n\n## Response\n\n${data.response}\n`);
            console.log(`💾 Saved to ${outputFile}\n`);

            return data.response;
        } else {
            throw new Error(`Ollama error: no response`);
        }
    } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        throw error;
    }
}

// CLI - Get filename for module detection

// Run CLI if this is the main module
if (process.argv[1] && (process.argv[1].endsWith('contextual-prompt-engineer.mjs') || process.argv[1] === __filename)) {
    const args = process.argv.slice(2);

    // Handle --force-download
    if (args.includes('--force-download')) {
        console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
        console.log(`║  Svelte Docs - Force Download                                ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

        ensureDocs(true)
            .then(() => {
                console.log(`\n✅ Docs successfully downloaded and cached!\n`);
                process.exit(0);
            })
            .catch(error => {
                console.error(error);
                process.exit(1);
            });
    } else if (args.includes('--help') || args.includes('-h')) {
        console.log(`
╔═══════════════════════════════════════════════════════════════╗
║  Contextual Prompt Engineer - CLI                            ║
╚═══════════════════════════════════════════════════════════════╝

USAGE:
  node contextual-prompt-engineer.mjs [QUERY] [KEYWORDS...]
  node contextual-prompt-engineer.mjs --force-download

OPTIONS:
  --force-download      Force refresh Svelte docs cache
  -h, --help            Show this help

EXAMPLES:
  node contextual-prompt-engineer.mjs "How do I migrate export let?"
  node contextual-prompt-engineer.mjs "What are runes?" "$state" "$derived"
  node contextual-prompt-engineer.mjs --force-download

FEATURES:
  - Auto-downloads Svelte docs (svelte.dev/docs/*/llms.txt)
  - Caches docs for 24 hours
  - Uses ripgrep for fast keyword extraction
  - Auto-detects keywords from query
  - Injects Svelte 5 enforcement rules into prompts
  - Queries Gemma3 with enriched context
        `);
        process.exit(0);
    } else {
        const query = args[0] || 'How do I replace export let with $props()?';
        const keywords = args.slice(1);

        console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
        console.log(`║  Contextual Prompt Engineer - Svelte 5                       ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);
        console.log(`🔍 Query: ${query}\n`);

        queryOllamaWithContext(query, keywords)
            .then(() => console.log(`\n✨ Complete!\n`))
            .catch(error => {
                console.error(error);
                process.exit(1);
            });
    }
}

export { ensureDocs, queryOllamaWithContext, searchDocs };
