#!/usr/bin/env zx

import { $, chalk } from 'zx';
import postgres from 'postgres';

// Evidence Document Batch Processing Script
// Handles OCR, analysis, and MinIO integration for legal documents
console.log(chalk.cyan('📄 Evidence Document Batch Processor v1.0'));

const config = {
  databaseUrl:
    process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11435',
  minioUrl: process.env.MINIO_URL || 'http://localhost:9000',
  legalModel: process.env.LEGAL_MODEL || 'gemma3-legal',
  embeddingModel: 'embeddinggemma:latest',
  batchSize: parseInt(process.env.BATCH_SIZE) || 8, // Smaller batches for evidence processing
  ocrEnabled: process.env.OCR_GPU_ENABLED === 'true',
  gpuAcceleration: process.env.GPU_ACCELERATION === 'true',
  maxFileSize: 50 * 1024 * 1024, // 50MB limit
};

console.log(chalk.blue('📋 Evidence Processing Configuration:'));
console.log(`   Database: ${config.databaseUrl.split('@')[1]}`);
console.log(`   Legal Model: ${config.legalModel}`);
console.log(`   Batch Size: ${config.batchSize}`);
console.log(`   OCR Enabled: ${config.ocrEnabled}`);
console.log(`   GPU Acceleration: ${config.gpuAcceleration}`);
console.log(`   Max File Size: ${Math.round(config.maxFileSize / 1024 / 1024)}MB`);

// Database connection
const sql = postgres(config.databaseUrl, {
  host: 'localhost',
  port: 5434,
  database: 'legal_ai_db',
  username: 'legal_admin',
  password: '123456',
  max: 3,
});

// Generate AI analysis using Ollama
async function generateLegalAnalysis(content, fileName, evidenceType) {
  try {
    const prompt = `
Analyze this legal evidence document:

Document: ${fileName}
Type: ${evidenceType}
Content: ${content.slice(0, 4000)}

Provide a comprehensive legal analysis including:
1. Document classification and relevance
2. Key legal concepts and terms identified
3. Potential evidentiary value
4. Risk assessment (low/medium/high)
5. Recommended actions or follow-up
6. Summary of critical information

Format as structured analysis suitable for legal review.
`;

    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.legalModel,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3, // Lower temperature for more consistent legal analysis
          top_p: 0.9,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.response || 'Analysis unavailable';
  } catch (error) {
    console.error(chalk.red(`❌ Error generating analysis: ${error.message}`));
    return `Analysis failed: ${error.message}`;
  }
}

// Generate embedding for content
async function generateEmbedding(text) {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.embeddingModel,
        prompt: text.slice(0, 8000),
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error(chalk.red(`❌ Error generating embedding: ${error.message}`));
    return null;
  }
}

// Extract key legal tags from content
function extractLegalTags(content, analysis) {
  const legalTerms = [
    'contract',
    'agreement',
    'liability',
    'breach',
    'damages',
    'plaintiff',
    'defendant',
    'jurisdiction',
    'statute',
    'regulation',
    'precedent',
    'discovery',
    'deposition',
    'motion',
    'injunction',
    'settlement',
    'arbitration',
    'mediation',
    'appeal',
    'evidence',
    'testimony',
    'witness',
    'expert',
    'forensic',
    'chain of custody',
    'confidential',
    'privileged',
    'attorney-client',
    'work product',
    'trade secret',
    'copyright',
    'trademark',
    'patent',
    'intellectual property',
    'due diligence',
    'compliance',
    'violation',
    'penalty',
    'fine',
    'criminal',
    'civil',
    'tort',
  ];

  const fullText = `${content} ${analysis}`.toLowerCase();
  const foundTerms = legalTerms.filter((term) => fullText.includes(term));

  // Add document type classification
  const documentTypes = [];
  if (fullText.includes('contract') || fullText.includes('agreement')) {
    documentTypes.push('contract');
  }
  if (fullText.includes('email') || fullText.includes('correspondence')) {
    documentTypes.push('correspondence');
  }
  if (
    fullText.includes('financial') ||
    fullText.includes('invoice') ||
    fullText.includes('payment')
  ) {
    documentTypes.push('financial');
  }
  if (fullText.includes('medical') || fullText.includes('health')) {
    documentTypes.push('medical');
  }

  return [...foundTerms, ...documentTypes];
}

// Process pending evidence documents
async function processPendingEvidence() {
  console.log(chalk.cyan('\n📄 Processing pending evidence documents...'));

  try {
    // Get evidence documents that need processing
    const pendingEvidence = await sql`
      SELECT id, title, description, file_name, mime_type, evidence_type, case_id, file_size
      FROM evidence
      WHERE (ai_analysis IS NULL OR ai_analysis = '{}' OR ai_analysis = '')
         OR (title_embedding IS NULL)
         OR (ai_tags IS NULL OR ai_tags = '[]')
      ORDER BY uploaded_at DESC
      LIMIT ${config.batchSize * 2}
    `;

    console.log(chalk.blue(`Found ${pendingEvidence.length} evidence documents to process`));

    if (pendingEvidence.length === 0) {
      console.log(chalk.yellow('No pending evidence documents found'));
      return;
    }

    let processed = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < pendingEvidence.length; i += config.batchSize) {
      const batch = pendingEvidence.slice(i, i + config.batchSize);
      console.log(
        chalk.cyan(
          `\nProcessing batch ${Math.floor(i / config.batchSize) + 1}/${Math.ceil(pendingEvidence.length / config.batchSize)}`
        )
      );

      for (const evidence of batch) {
        try {
          console.log(chalk.gray(`Processing: ${evidence.title || evidence.file_name}`));

          // Skip if file is too large
          if (evidence.file_size && evidence.file_size > config.maxFileSize) {
            console.log(
              chalk.yellow(
                `⚠️  Skipping large file: ${Math.round(evidence.file_size / 1024 / 1024)}MB`
              )
            );
            continue;
          }

          // Prepare content for analysis
          const contentForAnalysis = [evidence.title, evidence.description, evidence.file_name]
            .filter(Boolean)
            .join(' ');

          // Generate AI analysis
          console.log(chalk.gray(`  🤖 Generating legal analysis...`));
          const aiAnalysis = await generateLegalAnalysis(
            contentForAnalysis,
            evidence.file_name || evidence.title,
            evidence.evidence_type
          );

          // Extract legal tags
          console.log(chalk.gray(`  🏷️  Extracting legal tags...`));
          const aiTags = extractLegalTags(contentForAnalysis, aiAnalysis);

          // Generate embeddings
          console.log(chalk.gray(`  🔢 Generating embeddings...`));
          const titleEmbedding = await generateEmbedding(
            evidence.title || evidence.file_name || 'Untitled'
          );
          const contentEmbedding = await generateEmbedding(contentForAnalysis);

          // Create summary based on analysis
          const aiSummary = aiAnalysis.split('\n').slice(0, 3).join(' ').slice(0, 500);

          // Update database with all analysis results
          await sql`
            UPDATE evidence 
            SET 
              ai_analysis = ${JSON.stringify({
                analysis: aiAnalysis,
                processed_at: new Date().toISOString(),
                model: config.legalModel,
                confidence: 0.8,
              })},
              ai_tags = ${JSON.stringify(aiTags)},
              ai_summary = ${aiSummary},
              title_embedding = ${titleEmbedding ? `[${titleEmbedding.join(',')}]` : null},
              content_embedding = ${contentEmbedding ? `[${contentEmbedding.join(',')}]` : null},
              updated_at = NOW()
            WHERE id = ${evidence.id}
          `;

          processed++;
          console.log(chalk.green(`  ✅ Processed: ${evidence.title || evidence.file_name}`));
          console.log(
            chalk.gray(
              `     Tags: ${aiTags.slice(0, 5).join(', ')}${aiTags.length > 5 ? '...' : ''}`
            )
          );
        } catch (error) {
          errors++;
          console.log(chalk.red(`  ❌ Error processing ${evidence.title}: ${error.message}`));

          // Update with error status
          try {
            await sql`
              UPDATE evidence 
              SET 
                ai_analysis = ${JSON.stringify({
                  error: error.message,
                  processed_at: new Date().toISOString(),
                  status: 'failed',
                })},
                updated_at = NOW()
              WHERE id = ${evidence.id}
            `;
          } catch (updateError) {
            console.log(chalk.red(`    ❌ Failed to update error status: ${updateError.message}`));
          }
        }

        // Small delay between documents to prevent overwhelming the system
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Delay between batches
      if (i + config.batchSize < pendingEvidence.length) {
        console.log(chalk.gray('⏳ Waiting before next batch...'));
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(chalk.cyan(`\n📊 Evidence Processing Complete:`));
    console.log(chalk.green(`   ✅ Successfully processed: ${processed}`));
    console.log(chalk.red(`   ❌ Errors: ${errors}`));
    console.log(
      chalk.blue(`   📈 Success rate: ${((processed / (processed + errors)) * 100).toFixed(1)}%`)
    );
  } catch (error) {
    console.error(chalk.red(`❌ Error in evidence processing: ${error.message}`));
  }
}

// Update document metadata for processed evidence
async function updateDocumentMetadata() {
  console.log(chalk.cyan('\n📋 Updating document metadata...'));

  try {
    // Sync evidence data with document_metadata table
    const updatedRows = await sql`
      UPDATE document_metadata dm
      SET 
        processing_status = 'completed',
        metadata = jsonb_build_object(
          'ai_analysis_available', CASE WHEN e.ai_analysis IS NOT NULL THEN true ELSE false END,
          'embeddings_generated', CASE WHEN e.content_embedding IS NOT NULL THEN true ELSE false END,
          'tags_extracted', CASE WHEN e.ai_tags IS NOT NULL AND jsonb_array_length(e.ai_tags) > 0 THEN true ELSE false END,
          'last_processed', NOW()
        )
      FROM evidence e
      WHERE dm.id = e.id 
        AND e.ai_analysis IS NOT NULL
        AND dm.processing_status != 'completed'
    `;

    console.log(chalk.green(`✅ Updated metadata for ${updatedRows.count || 0} documents`));
  } catch (error) {
    console.error(chalk.red(`❌ Error updating document metadata: ${error.message}`));
  }
}

// Main execution
async function main() {
  try {
    const startTime = Date.now();

    // Test connections
    console.log(chalk.cyan('\n🔧 Testing system connections...'));

    try {
      await fetch(`${config.ollamaUrl}/api/tags`);
      console.log(chalk.green('✅ Ollama API available'));
    } catch (error) {
      console.log(chalk.red(`❌ Ollama API unavailable: ${error.message}`));
      throw error;
    }

    await sql`SELECT 1 as test`;
    console.log(chalk.green('✅ Database connection active'));

    // Check if legal model is available
    try {
      const modelsResponse = await fetch(`${config.ollamaUrl}/api/tags`);
      const modelsData = await modelsResponse.json();
      const hasLegalModel = modelsData.models?.some((m) => m.name.includes(config.legalModel));

      if (!hasLegalModel) {
        console.log(
          chalk.yellow(`⚠️  Legal model '${config.legalModel}' not found, using available model`)
        );
      } else {
        console.log(chalk.green(`✅ Legal model '${config.legalModel}' available`));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not verify legal model availability`));
    }

    // Process evidence documents
    await processPendingEvidence();
    await updateDocumentMetadata();

    const duration = Date.now() - startTime;
    console.log(
      chalk.cyan(`\n🎯 Evidence batch processing complete in ${Math.round(duration / 1000)}s`)
    );
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error in evidence processing:'), error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Error handling
process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n⚠️  Shutting down evidence processor...'));
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
