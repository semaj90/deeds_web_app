/**
 * Query Error Database + Ask Ollama for Svelte 5 Solutions
 * Connects Phase 79 error analysis with MCP LLM queries
 */

import pg from 'pg';
const { Client } = pg;

async function querySvelte5ErrorsAndSolutions() {
    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║  Svelte 5 Migration: Error DB → LLM Solution Pipeline        ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

    // Connect to PostgreSQL
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db'
    });

    try {
        await client.connect();
        console.log(`✅ Connected to PostgreSQL\n`);

        // Query Svelte-related errors
        console.log(`📊 Querying error_cluster for Svelte files...\n`);

        const result = await client.query(`
            SELECT
                error_code,
                error_message,
                file_path,
                COUNT(*) as occurrence_count
            FROM error_cluster
            WHERE file_path LIKE '%.svelte'
               OR error_message LIKE '%Component%'
               OR error_message LIKE '%mount%'
               OR error_message LIKE '%$state%'
            GROUP BY error_code, error_message, file_path
            ORDER BY COUNT(*) DESC
            LIMIT 5
        `);

        console.log(`Found ${result.rows.length} distinct Svelte error patterns\n`);
        console.log(`${'═'.repeat(70)}\n`);

        if (result.rows.length === 0) {
            console.log(`ℹ️  No Svelte-specific errors found in error_cluster`);
            console.log(`   This might mean:`);
            console.log(`   • Errors aren't indexed yet (run: npm run phase79:complete)`);
            console.log(`   • Svelte files have different error patterns`);
            console.log(`   • Database is empty\n`);
            return;
        }

        // For each error, ask Ollama for Svelte 5 migration solution
        for (let i = 0; i < result.rows.length; i++) {
            const error = result.rows[i];

            console.log(`📋 Error ${i + 1}/${result.rows.length}`);
            console.log(`${'─'.repeat(70)}`);
            console.log(`   Code: ${error.error_code}`);
            console.log(`   File: ${error.file_path}`);
            console.log(`   Occurrences: ${error.occurrence_count}`);
            console.log(`   Message: ${error.error_message.substring(0, 100)}...\n`);

            // Build context-aware prompt
            const prompt = `You are a Svelte 5 migration expert. Analyze this error and provide a solution:

Error Code: ${error.error_code}
Error Message: ${error.error_message}
File: ${error.file_path}
Context: This is from a Svelte codebase being migrated to Svelte 5.

Provide:
1. Root cause analysis
2. Is this a Svelte 5 migration issue?
3. Specific fix with code example
4. Any related migration patterns

Be concise and practical.`;

            console.log(`⏳ Querying Ollama for solution...\n`);

            try {
                const response = await fetch('http://localhost:11434/api/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'gemma3-legal:latest',
                        prompt: prompt,
                        stream: false,
                        options: {
                            temperature: 0.7,
                            num_predict: 1024
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();

                    console.log(`✅ Solution:\n`);
                    console.log(data.response);
                    console.log(`\n📊 ${data.eval_count} tokens, ${(data.total_duration / 1e9).toFixed(2)}s\n`);

                    // Save to file
                    const fs = await import('fs');
                    const fs_promises = await import('fs/promises');

                    await fs_promises.mkdir('data/svelte5-solutions', { recursive: true });

                    const filename = `data/svelte5-solutions/${error.error_code.replace(':', '_')}_${Date.now()}.md`;
                    const content = `# ${error.error_code} - Svelte 5 Solution

## Error Details
- **Code**: ${error.error_code}
- **File**: ${error.error_path}
- **Occurrences**: ${error.occurrence_count}
- **Message**: ${error.error_message}

## Solution

${data.response}

---
Generated: ${new Date().toISOString()}
`;

                    await fs_promises.writeFile(filename, content);
                    console.log(`💾 Saved to ${filename}\n`);

                } else {
                    console.error(`❌ Ollama error: ${response.status}\n`);
                }

            } catch (err) {
                console.error(`❌ Query error: ${err.message}\n`);
            }

            // Pause between queries
            if (i < result.rows.length - 1) {
                console.log(`⏸️  Pausing 3 seconds...\n`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
        console.log(`║  Pipeline Complete!                                           ║`);
        console.log(`║  Solutions saved to data/svelte5-solutions/                   ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

    } catch (error) {
        console.error(`\n❌ Error: ${error.message}`);
        console.error(error.stack);
    } finally {
        await client.end();
    }
}

// Run the pipeline
querySvelte5ErrorsAndSolutions().catch(console.error);
