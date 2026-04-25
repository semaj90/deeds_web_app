#!/usr/bin/env zx

import { $, chalk } from 'zx';
import postgres from 'postgres';

// Case Similarity Analysis Script
// Leverages pgvector for high-performance legal case comparison
console.log(chalk.cyan('⚖️  Legal Case Similarity Analysis v1.0'));

const config = {
  databaseUrl:
    process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11435',
  embeddingModel: process.env.LEGAL_EMBEDDING_MODEL || 'nomic-embed-text',
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.7,
  batchSize: parseInt(process.env.BATCH_SIZE) || 16,
  gpuLayers: parseInt(process.env.OLLAMA_GPU_LAYERS) || 35,
  maxResults: 10,
};

console.log(chalk.blue('📋 Similarity Analysis Configuration:'));
console.log(`   Database: ${config.databaseUrl.split('@')[1]}`);
console.log(`   Similarity Threshold: ${config.similarityThreshold}`);
console.log(`   Batch Size: ${config.batchSize}`);
console.log(`   Max Results: ${config.maxResults}`);

// Database connection
const sql = postgres(config.databaseUrl, {
  host: 'localhost',
  port: 5434,
  database: 'legal_ai_db',
  username: 'legal_admin',
  password: '123456',
  max: 3,
});

// Generate embedding for search queries
async function generateQueryEmbedding(text) {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.embeddingModel,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error(chalk.red(`❌ Error generating embedding: ${error.message}`));
    return null;
  }
}

// Find similar cases using pgvector
async function findSimilarCases(queryText, excludeCaseId = null) {
  console.log(chalk.blue(`🔍 Analyzing similarity for: "${queryText.slice(0, 100)}..."`));

  try {
    // Generate query embedding
    const queryEmbedding = await generateQueryEmbedding(queryText);
    if (!queryEmbedding) {
      throw new Error('Failed to generate query embedding');
    }

    // Search using cosine similarity
    let similarCases;

    if (excludeCaseId) {
      similarCases = await sql`
        SELECT 
          ce.case_id,
          c.title,
          c.description,
          c.status,
          c.case_type,
          ce.content,
          1 - (ce.embedding <=> ${sql`${JSON.stringify(queryEmbedding)}::vector`}) as similarity
        FROM case_embeddings ce
        JOIN cases c ON ce.case_id = c.id
        WHERE ce.case_id != ${excludeCaseId}
          AND 1 - (ce.embedding <=> ${sql`${JSON.stringify(queryEmbedding)}::vector`}) > ${config.similarityThreshold}
        ORDER BY similarity DESC
        LIMIT ${config.maxResults}
      `;
    } else {
      similarCases = await sql`
        SELECT 
          ce.case_id,
          c.title,
          c.description,
          c.status,
          c.case_type,
          ce.content,
          1 - (ce.embedding <=> ${sql`${JSON.stringify(queryEmbedding)}::vector`}) as similarity
        FROM case_embeddings ce
        JOIN cases c ON ce.case_id = c.id
        WHERE 1 - (ce.embedding <=> ${sql`${JSON.stringify(queryEmbedding)}::vector`}) > ${config.similarityThreshold}
        ORDER BY similarity DESC
        LIMIT ${config.maxResults}
      `;
    }

    return similarCases;
  } catch (error) {
    console.error(chalk.red(`❌ Error in similarity search: ${error.message}`));
    return [];
  }
}

// Analyze case-to-case similarities
async function analyzeCaseSimilarities() {
  console.log(chalk.cyan('\n📊 Analyzing case-to-case similarities...'));

  try {
    // Get all cases with embeddings
    const casesWithEmbeddings = await sql`
      SELECT DISTINCT c.id, c.title, c.description, c.case_type, c.created_at
      FROM cases c
      JOIN case_embeddings ce ON c.id = ce.case_id
      ORDER BY c.created_at DESC
      LIMIT 20
    `;

    console.log(chalk.blue(`Found ${casesWithEmbeddings.length} cases to analyze`));

    let totalComparisons = 0;
    let similarityMatches = 0;

    for (const caseDoc of casesWithEmbeddings) {
      console.log(chalk.gray(`\nAnalyzing: ${caseDoc.title}`));

      const queryText = [caseDoc.title, caseDoc.description].filter(Boolean).join(' ');
      const similarCases = await findSimilarCases(queryText, caseDoc.id);

      totalComparisons++;

      if (similarCases.length > 0) {
        similarityMatches++;
        console.log(chalk.green(`  ✅ Found ${similarCases.length} similar cases:`));

        similarCases.forEach((similar, index) => {
          const similarity = (similar.similarity * 100).toFixed(1);
          console.log(chalk.cyan(`    ${index + 1}. ${similar.title} (${similarity}% similar)`));
          console.log(chalk.gray(`       Type: ${similar.case_type}, Status: ${similar.status}`));
        });

        // Store similarity relationships for future analysis
        for (const similar of similarCases) {
          try {
            await sql`
              INSERT INTO case_similarities (case_id_a, case_id_b, similarity_score, analysis_date, metadata)
              VALUES (
                ${caseDoc.id}, 
                ${similar.case_id}, 
                ${similar.similarity},
                NOW(),
                ${sql`${JSON.stringify({
                  method: 'pgvector_cosine',
                  model: config.embeddingModel,
                  threshold: config.similarityThreshold,
                })}`}
              )
              ON CONFLICT (case_id_a, case_id_b) DO UPDATE SET
                similarity_score = EXCLUDED.similarity_score,
                analysis_date = EXCLUDED.analysis_date
            `;
          } catch (error) {
            // Handle case_similarities table not existing
            if (error.message.includes('relation "case_similarities" does not exist')) {
              console.log(
                chalk.yellow('⚠️  case_similarities table does not exist, skipping storage')
              );
              break;
            }
          }
        }
      } else {
        console.log(
          chalk.yellow(`  ⚠️  No similar cases found above ${config.similarityThreshold} threshold`)
        );
      }

      // Small delay to prevent overwhelming the GPU
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log(chalk.cyan(`\n📈 Analysis Summary:`));
    console.log(chalk.green(`   ✅ Cases analyzed: ${totalComparisons}`));
    console.log(chalk.blue(`   🔗 Cases with similarities: ${similarityMatches}`));
    console.log(
      chalk.gray(`   📊 Match rate: ${((similarityMatches / totalComparisons) * 100).toFixed(1)}%`)
    );
  } catch (error) {
    console.error(chalk.red(`❌ Error in case similarity analysis: ${error.message}`));
  }
}

// Search for cases similar to evidence documents
async function findCasesForEvidence() {
  console.log(chalk.cyan('\n🔍 Finding cases similar to evidence documents...'));

  try {
    // Get evidence with embeddings
    const evidenceWithEmbeddings = await sql`
      SELECT id, title, description, ai_summary, case_id
      FROM evidence
      WHERE content_embedding IS NOT NULL
      ORDER BY uploaded_at DESC
      LIMIT 10
    `;

    console.log(chalk.blue(`Analyzing ${evidenceWithEmbeddings.length} evidence documents`));

    for (const evidence of evidenceWithEmbeddings) {
      console.log(chalk.gray(`\nAnalyzing evidence: ${evidence.title}`));

      const queryText = [evidence.title, evidence.description, evidence.ai_summary]
        .filter(Boolean)
        .join(' ');

      const similarCases = await findSimilarCases(queryText, evidence.case_id);

      if (similarCases.length > 0) {
        console.log(chalk.green(`  ✅ Found ${similarCases.length} potentially relevant cases:`));

        similarCases.forEach((caseDoc, index) => {
          const similarity = (caseDoc.similarity * 100).toFixed(1);
          console.log(chalk.cyan(`    ${index + 1}. ${caseDoc.title} (${similarity}% relevant)`));
        });
      } else {
        console.log(chalk.yellow(`  ⚠️  No relevant cases found`));
      }
    }
  } catch (error) {
    console.error(chalk.red(`❌ Error in evidence-case analysis: ${error.message}`));
  }
}

// Perform semantic search on legal content
async function semanticSearch(query) {
  console.log(chalk.cyan(`\n🔎 Semantic search: "${query}"`));

  try {
    const results = await findSimilarCases(query);

    if (results.length > 0) {
      console.log(chalk.green(`Found ${results.length} relevant cases:`));

      results.forEach((result, index) => {
        const similarity = (result.similarity * 100).toFixed(1);
        console.log(chalk.cyan(`  ${index + 1}. ${result.title} (${similarity}% relevant)`));
        console.log(chalk.gray(`     Type: ${result.case_type}, Status: ${result.status}`));
        if (result.description) {
          console.log(chalk.gray(`     Description: ${result.description.slice(0, 100)}...`));
        }
      });
    } else {
      console.log(chalk.yellow('No relevant cases found'));
    }

    return results;
  } catch (error) {
    console.error(chalk.red(`❌ Error in semantic search: ${error.message}`));
    return [];
  }
}

// Main execution
async function main() {
  try {
    const startTime = Date.now();

    // Test connections
    console.log(chalk.cyan('\n🔧 Testing connections...'));
    await fetch(`${config.ollamaUrl}/api/tags`);
    console.log(chalk.green('✅ Ollama API available'));

    await sql`SELECT 1 as test`;
    console.log(chalk.green('✅ Database connection active'));

    // Run analysis tasks
    await analyzeCaseSimilarities();
    await findCasesForEvidence();

    // Example semantic searches
    const sampleQueries = [
      'contract dispute commercial litigation',
      'employment discrimination wrongful termination',
      'intellectual property patent infringement',
      'real estate property dispute',
    ];

    for (const query of sampleQueries) {
      await semanticSearch(query);
    }

    const duration = Date.now() - startTime;
    console.log(
      chalk.cyan(`\n🎯 Case similarity analysis complete in ${Math.round(duration / 1000)}s`)
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
  console.log(chalk.yellow('\n⚠️  Shutting down similarity analyzer...'));
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
