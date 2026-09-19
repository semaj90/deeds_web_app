import { llamaChat } from '../../../scripts/atlas/lib/llama-inference.mjs';
/**
 * Working Demo: Query Svelte 5 Migration Patterns
 * Uses direct Ollama calls (bypasses tool calling issues)
 */

async function querySvelte5Patterns() {
    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║  Svelte 5 Migration Assistant - Indexed Codebase Query       ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);

    const questions = [
        {
            title: "Component Instantiation Migration",
            prompt: `From your indexed Svelte error analysis codebase, explain the migration from:
- OLD: new Component({ target, props })
- NEW: mount(Component, target, props)

Include:
1. Why this change was made
2. Common errors developers encounter
3. Step-by-step migration guide
4. Code examples (before/after)`
        },
        {
            title: "Lifecycle Hooks in Svelte 5",
            prompt: `What are the Svelte 5 changes to lifecycle hooks? Explain:
1. onMount vs $effect
2. onDestroy cleanup patterns
3. Common migration issues
4. Best practices`
        },
        {
            title: "State Management ($state vs let)",
            prompt: `Explain Svelte 5 state management migration:
1. When to use $state vs regular let
2. $derived for computed values
3. Common errors from error analysis
4. Migration examples`
        }
    ];

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];

        console.log(`\n${'━'.repeat(70)}`);
        console.log(`📋 Question ${i + 1}: ${q.title}`);
        console.log(`${'━'.repeat(70)}\n`);
        console.log(`⏳ Querying Ollama (gemma3-legal)...\n`);

        try {
            const t0 = Date.now();
            const data = { response: await llamaChat(q.prompt, { maxTokens: 1024, temperature: 0.7, timeoutMs: 180_000 }) };
            data.total_duration = (Date.now() - t0) * 1e6;
            data.eval_count = 'n/a';
            if (data.response != null) {

                console.log(`✅ Response:\n`);
                console.log(data.response);
                console.log(`\n📊 Stats: ${data.eval_count} tokens, ${(data.total_duration / 1e9).toFixed(2)}s\n`);

                // Save to file
                const fs = await import('fs');
                const outputFile = `data/svelte5-migration-${i + 1}.md`;
                fs.writeFileSync(outputFile, `# ${q.title}\n\n${data.response}\n`);
                console.log(`💾 Saved to ${outputFile}`);

            } else {
                console.error(`❌ Error: no response`);
            }

        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
        }

        // Pause between questions
        if (i < questions.length - 1) {
            console.log(`\n⏸️  Pausing 3 seconds before next question...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
    console.log(`║  All questions completed!                                     ║`);
    console.log(`║  Check data/ folder for saved responses                       ║`);
    console.log(`╚═══════════════════════════════════════════════════════════════╝\n`);
}

// Run the demo
querySvelte5Patterns().catch(console.error);
