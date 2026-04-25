import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

// 1. Connect to Qdrant
const qdrant = new QdrantClient({ url: 'http://localhost:6333' });
const OUTPUT_FILE = 'svelte5_training_data.jsonl';

async function generateDataset() {
    console.log("🔍 Scanning Knowledge Base for Svelte 5 DNA...");

    // 2. Fetch all docs related to Svelte 5 / Runes
    // We use scrolling to get everything from the collection
    const result = await qdrant.scroll('phase76_knowledge_base', {
        limit: 1000,
        with_payload: true,
        with_vector: false
    });

    const dataset = [];
    const points = result.points || [];

    console.log(`📊 Found ${points.length} knowledge points.`);

    for (const point of points) {
        const p = point.payload;

        // Filter: Only care about Svelte/Kit docs
        if (!p.url || (!p.url.includes('svelte.dev') && !p.url.includes('kit.svelte.dev'))) {
            continue;
        }

        // 3. Create the Instruction Pair (Alpaca Format)
        // We simulate a user asking "How does this work?" and the "Output" is the documentation.
        const entry = {
            instruction: `Explain the concept of "${p.title}" in Svelte 5, specifically regarding Runes and modern syntax.`,
            input: "", // Optional context
            output: p.summary || "No summary available." // This is the "Gold Standard" answer from your docs
        };

        dataset.push(JSON.stringify(entry));
    }

    // 4. Write to JSONL
    fs.writeFileSync(OUTPUT_FILE, dataset.join('\n'));
    console.log(`✅ Successfully generated ${dataset.length} training examples.`);
    console.log(`📂 Saved to: ${OUTPUT_FILE}`);
    console.log(`🚀 Next Step: Upload this file to your Google Colab Unsloth notebook.`);
}

generateDataset().catch(console.error);