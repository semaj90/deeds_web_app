#!/usr/bin/env zx

import { $, chalk } from 'zx';
import postgres from 'postgres';

// Legal AI Embedding Generation Script
// Optimized for RTX 3060 Ti GPU processing
console.log(chalk.cyan('🔍 Legal AI Embedding Generation v1.0'));

const config = {
  databaseUrl: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11435', // Updated to use correct running port
  embeddingModel: process.env.LEGAL_EMBEDDING_MODEL || 'embeddinggemma:latest',
  batchSize: parseInt(process.env.BATCH_SIZE) || 32,
  gpuLayers: parseInt(process.env.OLLAMA_GPU_LAYERS) || 35,
  maxRetries: 3,
  dimensions: 384,
};

console.log(chalk.blue('📋 Embedding Configuration:'));
console.log(`   Database: ${config.databaseUrl.split('@')[1]}`);
console.log(`   Model: ${config.embeddingModel}`);
console.log(`   Batch Size: ${config.batchSize}`);
console.log(`   GPU Layers: ${config.gpuLayers}`);
console.log(`   Dimensions: ${config.dimensions}`);

// Database connection
const sql = postgres(config.databaseUrl, {
  host: 'localhost',
  port: 5434,
  database: 'legal_ai_db',
  username: 'legal_admin',
  password: '123456',
  max: 3,
});

// Generate embedding using Ollama
async function generateEmbedding(text, retries = 0) {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.embeddingModel,
        prompt: text.slice(0, 8000), // Truncate very long texts
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    if (retries < config.maxRetries) {
      console.log(chalk.yellow(`⚠️  Retry ${retries + 1}/${config.maxRetries}: ${error.message}`));
      await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)));
      return generateEmbedding(text, retries + 1);
    }
    throw error;
  }
}

// Process evidence documents
async function processEvidenceEmbeddings() {
  console.log(chalk.cyan('\n🔍 Processing evidence documents...'));

  // Get evidence without embeddings
  const evidenceRows = await sql`
    SELECT id, title, description, ai_summary, file_name
    FROM evidence
    WHERE title_embedding IS NULL OR content_embedding IS NULL
    LIMIT 100
  `;

  console.log(chalk.blue(`Found ${evidenceRows.length} evidence documents to process`));

  let processed = 0;
  let errors = 0;

  for (const evidence of evidenceRows) {
    try {
      console.log(chalk.gray(`Processing evidence: ${evidence.title || evidence.file_name}`));

      // Generate title embedding
      const titleText = evidence.title || evidence.file_name || 'Untitled Evidence';
      const titleEmbedding = await generateEmbedding(titleText);

      // Generate content embedding
      const contentText = [evidence.title, evidence.description, evidence.ai_summary].filter(Boolean).join(' ');

      const contentEmbedding = await generateEmbedding(contentText);

      // Update database with embeddings
      await sql`
        UPDATE evidence
        SET
          title_embedding = ${sql`${JSON.stringify(titleEmbedding)}::vector`},
          content_embedding = ${sql`${JSON.stringify(contentEmbedding)}::vector`}
        WHERE id = ${evidence.id}
      `;

      processed++;
      console.log(chalk.green(`✅ Processed: ${evidence.title || evidence.file_name}`));
    } catch (error) {
      errors++;
      console.log(chalk.red(`❌ Error processing ${evidence.title}: ${error.message}`));
    }
  }

  console.log(chalk.cyan(`\n📊 Evidence Processing Complete:`));
  console.log(chalk.green(`   ✅ Processed: ${processed}`));
  console.log(chalk.red(`   ❌ Errors: ${errors}`));
}

// Process chat messages
async function processChatEmbeddings() {
  console.log(chalk.cyan('\n💬 Processing chat messages...'));

  // Get chat messages without embeddings
  const chatRows = await sql`
    SELECT id, content, role
    FROM chat_messages
    WHERE embedding IS NULL
    LIMIT 200
  `;

  console.log(chalk.blue(`Found ${chatRows.length} chat messages to process`));

  let processed = 0;
  let errors = 0;

  for (const message of chatRows) {
    try {
      const embedding = await generateEmbedding(message.content);

      await sql`
        UPDATE chat_messages
        SET embedding = ${sql`${JSON.stringify(embedding)}::vector`}
        WHERE id = ${message.id}
      `;

      processed++;
      console.log(chalk.green(`✅ Chat message processed (${message.role})`));
    } catch (error) {
      errors++;
      console.log(chalk.red(`❌ Error processing chat message: ${error.message}`));
    }
  }

  console.log(chalk.cyan(`\n📊 Chat Processing Complete:`));
  console.log(chalk.green(`   ✅ Processed: ${processed}`));
  console.log(chalk.red(`   ❌ Errors: ${errors}`));
}

// Process case documents
async function processCaseEmbeddings() {
  console.log(chalk.cyan('\n📁 Processing case documents...'));

  // Get cases that need embeddings
  const caseRows = await sql`
    SELECT id, title, description
    FROM cases
    WHERE id NOT IN (SELECT DISTINCT case_id FROM case_embeddings WHERE case_id IS NOT NULL)
    LIMIT 50
  `;

  console.log(chalk.blue(`Found ${caseRows.length} cases to process`));

  let processed = 0;
  let errors = 0;

  for (const caseDoc of caseRows) {
    try {
      const caseText = [caseDoc.title, caseDoc.description].filter(Boolean).join(' ');
      const embedding = await generateEmbedding(caseText);

      // Insert into case_embeddings table
      await sql`
        INSERT INTO case_embeddings (case_id, content, embedding, metadata)
        VALUES (
          ${caseDoc.id},
          ${caseText},
          ${sql`${JSON.stringify(embedding)}::vector`},
          ${sql`${JSON.stringify({ source: 'case_summary', model: config.embeddingModel })}`}
        )
      `;

      processed++;
      console.log(chalk.green(`✅ Case processed: ${caseDoc.title}`));
    } catch (error) {
      errors++;
      console.log(chalk.red(`❌ Error processing case ${caseDoc.title}: ${error.message}`));
    }
  }

  console.log(chalk.cyan(`\n📊 Case Processing Complete:`));
  console.log(chalk.green(`   ✅ Processed: ${processed}`));
  console.log(chalk.red(`   ❌ Errors: ${errors}`));
}

// Main execution
async function main() {
  try {
    const startTime = Date.now();

    // Test Ollama connection
    console.log(chalk.cyan('\n🔧 Testing Ollama connection...'));
    await fetch(`${config.ollamaUrl}/api/tags`);
    console.log(chalk.green('✅ Ollama API available'));

    // Test database connection
    console.log(chalk.cyan('🔧 Testing database connection...'));
    await sql`SELECT 1 as test`;
    console.log(chalk.green('✅ Database connection active'));

    // Process all types of embeddings
    await processEvidenceEmbeddings();
    await processChatEmbeddings();
    await processCaseEmbeddings();

    const duration = Date.now() - startTime;
    console.log(
      chalk.cyan(`\n🎯 Embedding generation complete in ${Math.round(duration / 1000)}s`)
    );
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Error handling
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n⚠️  Shutting down embedding generator...'));
  await sql.end();
  process.exit(130);
});

process.on('unhandledRejection', (error) => {
  console.error(chalk.red('\n❌ Unhandled rejection:'), error);
  process.exit(1);
});

// Run
main().catch((error) => {
  console.error(chalk.red('\n❌ Fatal error:'), error);
  process.exit(1);
});
