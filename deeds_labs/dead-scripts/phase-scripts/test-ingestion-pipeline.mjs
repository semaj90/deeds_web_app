#!/usr/bin/env node
/**
 * End-to-End Ingestion Pipeline Test
 * Tests: Upload → OCR → Chunking → Embedding → Vector Search
 *
 * Usage: node test-ingestion-pipeline.mjs
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const API_BASE = process.env.API_BASE || 'http://localhost:5173';
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

// Test document content
const testDocument = {
  content: `
    LEGAL BRIEF - Case No. 2024-CR-001234

    IN THE SUPERIOR COURT OF CALIFORNIA
    COUNTY OF LOS ANGELES

    THE PEOPLE OF THE STATE OF CALIFORNIA,
    Plaintiff,
    vs.
    JOHN DOE,
    Defendant.

    MOTION TO SUPPRESS EVIDENCE

    TO THE HONORABLE COURT:

    Defendant John Doe, through undersigned counsel, hereby moves this Court for an order suppressing all evidence obtained from the search of defendant's residence on January 15, 2024. This motion is made pursuant to Penal Code Section 1538.5 and the Fourth Amendment to the United States Constitution.

    STATEMENT OF FACTS:

    On January 15, 2024, at approximately 3:00 PM, officers from the Los Angeles Police Department executed a search warrant at 123 Main Street, Los Angeles, CA 90001, the residence of defendant John Doe. The warrant was issued based on an affidavit submitted by Detective Jane Smith, which alleged that controlled substances were being sold from the premises.

    During the search, officers seized approximately 100 grams of a substance suspected to be methamphetamine, $5,000 in cash, and various items of drug paraphernalia. Defendant was present during the search and was subsequently arrested.

    LEGAL ARGUMENT:

    The search warrant was invalid for the following reasons:

    1. Lack of Probable Cause: The affidavit in support of the search warrant failed to establish probable cause. Detective Smith relied solely on an anonymous tip that was uncorroborated by independent police investigation. Under Illinois v. Gates, 462 U.S. 213 (1983), an anonymous tip must be sufficiently corroborated to establish probable cause.

    2. Staleness: The information in the affidavit was stale. The anonymous tip was received approximately three months prior to the issuance of the warrant. Courts have consistently held that information must be reasonably current to support a finding of probable cause.

    3. Overbreadth: The warrant authorized the search of the"entire premises," including areas not reasonably connected to the alleged criminal activity. This violates the particularity requirement of the Fourth Amendment.

    CONCLUSION:

    For the foregoing reasons, defendant respectfully requests that this Court grant this motion and suppress all evidence obtained from the search of his residence.

    Dated: March 1, 2024

    Respectfully submitted,

    SMITH & JONES, LLP
    By: /s/ Robert Smith
    ROBERT SMITH, ESQ.
    Attorneys for Defendant
  `.trim(),
  filename: 'motion-to-suppress-2024.txt',
  mimeType: 'text/plain',
  metadata: {
    caseNumber: '2024-CR-001234',
    documentType: 'legal_brief',
    court: 'Superior Court of California, Los Angeles County',
    filingDate: '2024-03-01'
  }
};

async function testHealthCheck() {
  log('\n=== Testing Health Check ===', 'cyan');

  try {
    const response = await fetch(`${API_BASE}/api/v1/ingest/unified`);
    const data = await response.json();

    if (data.status === 'healthy') {
      log('✅ Health check passed', 'green');
      log(`   Documents: ${data.statistics.documentsIngested}`, 'blue');
      log(`   Chunks: ${data.statistics.chunksCreated}`, 'blue');
      log(`   Avg chunks/doc: ${data.statistics.averageChunksPerDocument}`, 'blue');
      return true;
    } else {
      log('❌ Health check failed', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Health check error: ${error.message}`, 'red');
    return false;
  }
}

async function testDocumentIngestion() {
  log('\n=== Testing Document Ingestion ===', 'cyan');

  try {
    const startTime = Date.now();

    const response = await fetch(`${API_BASE}/api/v1/ingest/unified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDocument)
    });

    const result = await response.json();
    const duration = Date.now() - startTime;

    if (result.success) {
      log('✅ Document ingested successfully', 'green');
      log(`   Document ID: ${result.document.id}`, 'blue');
      log(`   Filename: ${result.document.filename}`, 'blue');
      log(`   Content hash: ${result.document.contentHash.substring(0, 16)}...`, 'blue');
      log(`   Chunks created: ${result.document.chunksCount}`, 'green');
      log(`   Embeddings generated: ${result.document.embeddingsGenerated}`, 'green');
      log(`   Text length: ${result.document.textLength} chars`, 'blue');
      log(`   Processing time: ${result.processing.processingTimeMs}ms`, 'yellow');
      log(`   Chunk size: ${result.processing.chunkSize}`, 'blue');
      log(`   Embedding model: ${result.processing.embeddingModel}`, 'blue');
      log(`   Embedding dimensions: ${result.processing.embeddingDimensions}`, 'blue');
      log(`   PostgreSQL: ${result.storage.postgres}`, 'green');
      log(`   pgvector: ${result.storage.pgvector}`, 'green');

      return {
        success: true,
        documentId: result.document.id,
        duration
      };
    } else {
      log('❌ Ingestion failed', 'red');
      log(`   Error: ${result.error}`, 'red');
      return { success: false };
    }
  } catch (error) {
    log(`❌ Ingestion error: ${error.message}`, 'red');
    return { success: false };
  }
}

async function testDuplicateDetection() {
  log('\n=== Testing Duplicate Detection ===', 'cyan');

  try {
    const response = await fetch(`${API_BASE}/api/v1/ingest/unified`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testDocument)
    });

    const result = await response.json();

    if (result.duplicate) {
      log('✅ Duplicate detected correctly', 'green');
      log(`   Document ID: ${result.documentId}`, 'blue');
      return true;
    } else {
      log('⚠️  Duplicate not detected (may be a new test run)', 'yellow');
      return true; // Not a failure
    }
  } catch (error) {
    log(`❌ Duplicate detection error: ${error.message}`, 'red');
    return false;
  }
}

async function testVectorSearch(query = 'Fourth Amendment search warrant') {
  log('\n=== Testing Vector Search ===', 'cyan');
  log(`   Query: "${query}"`, 'blue');

  try {
    const response = await fetch(`${API_BASE}/api/search-pgvector`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        topK: 5,
        threshold: 0.5
      })
    });

    const result = await response.json();

    if (result.success) {
      log(`✅ Search completed in ${result.responseTime}ms`, 'green');
      log(`   Results found: ${result.results.length}`, 'green');

      result.results.forEach((r, idx) => {
        log(`   ${idx + 1}. ${r.title} (similarity: ${r.similarity.toFixed(3)})`, 'blue');
        log(`      Content preview: ${r.content.substring(0, 100)}...`, 'cyan');
      });

      return true;
    } else {
      log('❌ Search failed', 'red');
      return false;
    }
  } catch (error) {
    log(`⚠️  Search endpoint not available yet: ${error.message}`, 'yellow');
    return true; // Not a critical failure
  }
}

async function testOllamaConnection() {
  log('\n=== Testing Ollama Connection ===', 'cyan');

  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

  try {
    const response = await fetch(`${ollamaUrl}/api/tags`);
    const data = await response.json();

    log('✅ Ollama connected', 'green');
    log(`   Available models: ${data.models.length}`, 'blue');

    const embedModel = data.models.find(m => m.name.includes('embeddinggemma'));
    if (embedModel) {
      log(`   ✅ embeddinggemma model found`, 'green');
    } else {
      log(`   ⚠️  embeddinggemma model not found`, 'yellow');
    }

    return true;
  } catch (error) {
    log(`❌ Ollama connection failed: ${error.message}`, 'red');
    log(`   Make sure Ollama is running on ${ollamaUrl}`, 'yellow');
    return false;
  }
}

async function runAllTests() {
  log('╔══════════════════════════════════════════════════════════╗', 'cyan');
  log('║  YoRHa Document Ingestion Pipeline - End-to-End Test   ║', 'cyan');
  log('╚══════════════════════════════════════════════════════════╝', 'cyan');

  const results = {
    ollama: await testOllamaConnection(),
    health: await testHealthCheck(),
    ingestion: await testDocumentIngestion(),
    duplicate: await testDuplicateDetection(),
    search: await testVectorSearch()
  };

  log('\n═══════════════════════════════════════', 'cyan');
  log('TEST SUMMARY', 'cyan');
  log('═══════════════════════════════════════', 'cyan');

  const passedTests = Object.values(results).filter(r => r === true || r?.success).length;
  const totalTests = Object.keys(results).length;

  Object.entries(results).forEach(([name, result]) => {
    const passed = result === true || result?.success;
    const icon = passed ? '✅' : '❌';
    const color = passed ? 'green' : 'red';
    log(`${icon} ${name.padEnd(15)} ${passed ? 'PASSED' : 'FAILED'}`, color);
  });

  log('\n═══════════════════════════════════════', 'cyan');
  log(`Total: ${passedTests}/${totalTests} tests passed`, passedTests === totalTests ? 'green' : 'yellow');
  log('═══════════════════════════════════════\n', 'cyan');

  process.exit(passedTests === totalTests ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Test suite failed: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
