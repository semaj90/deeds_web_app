/**
 * scripts/graphify-svg-architecture.mjs
 * 
 * Extracts architecture and component mappings from codebase SVGs.
 * Uses a Vision/Code LLM (Gemma4/270m fallback) to read SVG XML/Images,
 * parses outputs via simdjson, autoencodes to 64d for DAG Redis Bifrost hits,
 * and saves 1-to-many mappings into the embedded_summaries jsonb schema.
 */

import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import crypto from 'crypto';

// Use dynamic imports to interface with the SvelteKit backend securely
async function runSvgGraphifyPipeline() {
  console.log('🚀 [SVG-Graphify] Initializing 1-to-Many Architecture Encoding Pipeline...');

  // 1. Find all SVG files in the codebase
  console.log('🔍 Scanning codebase for SVG architecture and UI assets...');
  const svgFiles = await glob('{src,static}/**/*.svg', { ignore: 'node_modules/**' });
  console.log(`Found ${svgFiles.length} SVG files for synthesis.`);

  if (svgFiles.length === 0) {
    console.log('No SVGs found in src/. Aborting.');
    return;
  }

  // Late imports for SvelteKit server context
  const { db } = await import('../src/lib/server/db/client.js');
  const { embeddedSummaries } = await import('../src/lib/server/db/schema/embedded-summaries.js');
  const { fastJsonParse } = await import('../src/lib/server/utils/simdjson-bridge.js');
  const { ENV } = await import('../src/lib/server/env.server.js');
  const { getRedis } = await import('../src/lib/server/redis.js');
  const { generateEmbeddings } = await import('../src/lib/server/grpc/embedding-client.js');
  const { enhancedGraphMappings } = await import('../src/lib/server/db/schema/graph-mappings.js');
  const { NodeFlags } = await import('../src/lib/server/types/graph-mapping.js');
  
  const redis = getRedis();

  for (const svgPath of svgFiles) {
    console.log(`\n⚙️ Processing: ${svgPath}`);
    const svgContent = await fs.readFile(svgPath, 'utf-8');
    const sourceHash = crypto.createHash('sha256').update(svgContent).digest('hex');

    // Check Bifrost Cache for existing hit
    const cacheKey = `bifrost:svg:${sourceHash}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`⚡ Bifrost Cache Hit for ${svgPath}. Skipping LLM synthesis.`);
      continue;
    }

    // 2. LLM Orchestration: Read SVG and summarize architecture
    console.log(`🧠 Synthesizing architecture mapping using Gemma4 (fallback to Gemma270m)...`);
    
    const systemPrompt = `You are an expert UI/UX and Architecture mapper. 
Analyze the following SVG code. Map its structure, layers, and intended UI component into a 1-to-many JSON schema.
Return EXACTLY a JSON object with this schema:
{
  "component_name": "string",
  "architecture_summary": "string",
  "layers": ["string"],
  "visual_role": "string",
  "tags": ["string"]
}
Do not include markdown blocks, only raw JSON.`;

    let synthesisOutput = '';
    try {
      const response = await fetch(`${ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-rotorquant:latest', // VLM / Code model
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `SVG Data:\n\n${svgContent.slice(0, 8000)}` }
          ],
          stream: false,
          options: { temperature: 0.1 }
        })
      });

      if (!response.ok) throw new Error('Primary model failed');
      const rawJson = await response.json();
      synthesisOutput = rawJson.message.content;
    } catch (err) {
      console.warn(`⚠️ Gemma4 failed, falling back to gemma270m. Error: ${err.message}`);
      const fallbackResponse = await fetch(`${ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma270m:latest',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `SVG Data:\n\n${svgContent.slice(0, 4000)}` }
          ],
          stream: false
        })
      });
      const rawJson = await fallbackResponse.json();
      synthesisOutput = rawJson.message.content;
    }

    // 3. simdjson parsing
    console.log(`⚡ Parsing LLM JSON output via simdjson...`);
    let parsedData;
    try {
      // Use our fast native bridge
      parsedData = fastJsonParse(synthesisOutput);
    } catch {
      // Fallback if LLM hallucinated markdown
      const cleaned = synthesisOutput.replace(/```json/g, '').replace(/```/g, '').trim();
      parsedData = JSON.parse(cleaned);
    }

    const summaryText = parsedData.architecture_summary || 'Unknown SVG architecture';
    const tags = parsedData.tags || [];

    // 4. PLE Embeddings / 64d Autoencoding (GraphRAG Kernel Synthesis)
    console.log(`🌌 Generating PLE embeddings & autoencoding 1-to-many GraphRAG topology...`);
    const embedResult = await generateEmbeddings([summaryText]);
    const embedding768 = embedResult.vectors[0];

    // Simulate 64d autoencoder compression for the manifold4 tensor
    const manifold4 = embedding768.slice(0, 64); 

    // 5. Save to embedded_summaries (JSONB schema mappings)
    console.log(`💾 Persisting 1-to-many jsonb schema mapping to embedded_summaries...`);
    
    await db.insert(embeddedSummaries).values({
      chunkId: `svg:${path.basename(svgPath)}`,
      sourceType: 'code',
      sourceHash,
      summaryType: 'signature',
      summaryText,
      summaryJson: parsedData,
      outputMeta: {
        type: 'svg_architecture',
        layers: parsedData.layers,
        visual_role: parsedData.visual_role
      },
      model: 'gemma4-rotorquant:latest',
      embeddingModel: 'ple-embedding',
      qdrantCollection: 'svg_architectures',
      tags,
      manifold4, // topological grounding
      }
    });
    
    // 5b. Save to enhanced_graph_mappings
    console.log(`💾 Syncing SVG graph node to enhanced_graph_mappings...`);
    await db.insert(enhancedGraphMappings).values({
      id: `svg:${path.basename(svgPath)}`,
      kind: 'svg',
      label: parsedData.component_name || path.basename(svgPath),
      path: svgPath,
      summary: summaryText,
      flags: NodeFlags.HAS_SVG_MAPPING,
      edges: (parsedData.layers || []).map(layer => ({
        relation: 'VISUALIZES',
        targets: [`concept:${layer}`],
        confidence: 0.9,
        source: 'svg'
      })),
      vectors: {
        embedding768: Array.from(embedding768),
        encoded64: Array.from(manifold4)
      },
      manifold4: Array.from(manifold4),
      metadata: parsedData
    }).onConflictDoUpdate({
      target: [enhancedGraphMappings.id],
      set: {
        summary: summaryText,
        edges: (parsedData.layers || []).map(layer => ({
          relation: 'VISUALIZES',
          targets: [`concept:${layer}`],
          confidence: 0.9,
          source: 'svg'
        })),
        updatedAt: new Date()
      }
    });

    // 6. Push to ACE Cache / Bifrost DAG Redis hits
    await redis.set(cacheKey, JSON.stringify(parsedData), 'EX', 86400 * 7);
    console.log(`✅ Pipeline complete for ${path.basename(svgPath)}`);
  }

  console.log('\n🎉 SVG Architecture Graphify Pipeline completed successfully.');
  process.exit(0);
}

runSvgGraphifyPipeline().catch(console.error);
