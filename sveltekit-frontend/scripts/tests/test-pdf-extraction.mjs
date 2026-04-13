#!/usr/bin/env node
/**
 * PDF Extraction Diagnostics — Test all 4 tiers of PDF text extraction
 *
 * Tests the evidence upload pipeline's PDF extraction with a sample PDF:
 * - Tier 1: Docling (IBM granite-docling-258m)
 * - Tier 2: pdf-parse (standard library)
 * - Tier 3: Granite-Docling for scanned PDFs
 * - Tier 4: OCR Hybrid fallback
 *
 * Usage:
 *   node scripts/tests/test-pdf-extraction.mjs <pdf-file-path>
 *   node scripts/tests/test-pdf-extraction.mjs test.pdf
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Minimum text length threshold (same as upload route)
const MIN_PDF_TEXT_LENGTH = 50;

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║       PDF Extraction Pipeline Diagnostics                    ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Get PDF file path from command line args
const pdfPath = process.argv[2];

if (!pdfPath) {
  console.error('❌ Error: No PDF file specified');
  console.log('\nUsage:');
  console.log('  node scripts/tests/test-pdf-extraction.mjs <pdf-file-path>\n');
  console.log('Example:');
  console.log('  node scripts/tests/test-pdf-extraction.mjs sample-contract.pdf');
  process.exit(1);
}

console.log(`📄 Testing PDF: ${pdfPath}\n`);

/**
 * Tier 1: Test Docling (IBM granite-docling-258m)
 */
async function testDocling(buffer) {
  console.log('━━━ Tier 1: Docling (IBM granite-docling-258m) ━━━');
  try {
    // Dynamic import to handle module not found gracefully
    const { isDoclingAvailable, analyzeDocumentWithDocling } = await import(
      '../../src/lib/server/docling.js'
    );

    if (!(await isDoclingAvailable())) {
      console.log('⚠️  Docling service unavailable (not running)');
      return null;
    }

    const startTime = Date.now();
    const result = await analyzeDocumentWithDocling({
      fileBuffer: buffer,
      mimeType: 'application/pdf',
    });
    const elapsed = Date.now() - startTime;

    const textLength = result.fullText.trim().length;
    const blockCount = result.blocks?.length ?? 0;

    if (textLength >= MIN_PDF_TEXT_LENGTH) {
      console.log(`✅ SUCCESS — ${textLength} chars, ${blockCount} blocks (${elapsed}ms)`);
      console.log(`   Preview: ${result.fullText.substring(0, 100)}...`);
      return result.fullText;
    } else {
      console.log(`⚠️  Insufficient text — ${textLength} chars < ${MIN_PDF_TEXT_LENGTH} threshold`);
      return null;
    }
  } catch (err) {
    console.log(`❌ FAILED — ${err.message}`);
    return null;
  }
}

/**
 * Tier 2: Test pdf-parse (standard library)
 */
async function testPdfParse(buffer) {
  console.log('\n━━━ Tier 2: pdf-parse (Standard Library) ━━━');
  try {
    const startTime = Date.now();
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);
    const elapsed = Date.now() - startTime;

    const text = parsed.text ?? '';
    const textLength = text.trim().length;
    const pageCount = parsed.numpages ?? 0;

    console.log(`📊 Metadata — ${pageCount} pages, ${textLength} chars (${elapsed}ms)`);

    if (textLength >= MIN_PDF_TEXT_LENGTH) {
      console.log(`✅ SUCCESS — ${textLength} chars extracted`);
      console.log(`   Preview: ${text.substring(0, 100)}...`);
      return text;
    } else {
      console.log(`⚠️  Insufficient text — ${textLength} chars < ${MIN_PDF_TEXT_LENGTH} threshold`);
      console.log('   Likely a scanned PDF (image-based, no text layer)');
      return null;
    }
  } catch (err) {
    console.log(`❌ FAILED — ${err.message}`);
    console.error('   Stack:', err.stack);
    return null;
  }
}

/**
 * Tier 3: Test Granite-Docling for scanned PDFs
 */
async function testGraniteDocling(buffer) {
  console.log('\n━━━ Tier 3: Granite-Docling (Scanned PDF Handler) ━━━');
  try {
    const { isGraniteDoclingAvailable, analyzePdfWithGraniteDocling } = await import(
      '../../src/lib/server/analysis/granite-docling.js'
    );

    if (!(await isGraniteDoclingAvailable())) {
      console.log('⚠️  Granite-Docling service unavailable');
      return null;
    }

    const startTime = Date.now();
    const result = await analyzePdfWithGraniteDocling(buffer);
    const elapsed = Date.now() - startTime;

    const textLength = result.fullText.trim().length;
    const blockCount = result.blocks?.length ?? 0;

    if (textLength >= MIN_PDF_TEXT_LENGTH) {
      console.log(`✅ SUCCESS — ${textLength} chars, ${blockCount} blocks (${elapsed}ms)`);
      console.log(`   Preview: ${result.fullText.substring(0, 100)}...`);
      return result.fullText;
    } else {
      console.log(`⚠️  Insufficient text — ${textLength} chars < ${MIN_PDF_TEXT_LENGTH} threshold`);
      return null;
    }
  } catch (err) {
    console.log(`❌ FAILED — ${err.message}`);
    return null;
  }
}

/**
 * Tier 4: Test OCR Hybrid fallback
 */
async function testOcrHybrid(buffer, fileName) {
  console.log('\n━━━ Tier 4: OCR Hybrid Fallback ━━━');
  try {
    const { extractTextHybrid } = await import('../../src/lib/server/ocr/hybrid.js');

    const startTime = Date.now();
    const result = await extractTextHybrid(buffer, fileName);
    const elapsed = Date.now() - startTime;

    const textLength = result.text.trim().length;

    console.log(`📊 Method: ${result.method}, Confidence: ${result.confidence?.toFixed(2) ?? 'N/A'}`);

    if (textLength > 0) {
      console.log(`✅ SUCCESS — ${textLength} chars (${elapsed}ms)`);
      console.log(`   Preview: ${result.text.substring(0, 100)}...`);
      return result.text;
    } else {
      console.log(`❌ FAILED — ${textLength} chars extracted`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      return null;
    }
  } catch (err) {
    console.log(`❌ FAILED — ${err.message}`);
    console.error('   Stack:', err.stack);
    return null;
  }
}

/**
 * Main test runner
 */
async function main() {
  try {
    // Read PDF file
    const buffer = await readFile(pdfPath);
    const fileName = pdfPath.split(/[\\/]/).pop();

    console.log(`✅ Loaded ${buffer.length} bytes\n`);

    // Test all 4 tiers in order
    let extractedText = null;

    // Tier 1: Docling
    extractedText = await testDocling(buffer);
    if (extractedText) {
      console.log('\n🎉 SUCCESS — Tier 1 (Docling) extracted sufficient text');
      return;
    }

    // Tier 2: pdf-parse
    extractedText = await testPdfParse(buffer);
    if (extractedText) {
      console.log('\n🎉 SUCCESS — Tier 2 (pdf-parse) extracted sufficient text');
      return;
    }

    // Tier 3: Granite-Docling for scanned PDFs
    extractedText = await testGraniteDocling(buffer);
    if (extractedText) {
      console.log('\n🎉 SUCCESS — Tier 3 (Granite-Docling) extracted sufficient text');
      return;
    }

    // Tier 4: OCR Hybrid
    extractedText = await testOcrHybrid(buffer, fileName);
    if (extractedText) {
      console.log('\n🎉 SUCCESS — Tier 4 (OCR Hybrid) extracted sufficient text');
      return;
    }

    // All tiers failed
    console.log('\n❌ PIPELINE FAILURE — All 4 tiers failed to extract text');
    console.log('\nPossible causes:');
    console.log('  1. PDF is encrypted or password-protected');
    console.log('  2. PDF is corrupted or malformed');
    console.log('  3. PDF uses unsupported encoding');
    console.log('  4. Docling/Granite-Docling services not running');
    console.log('  5. OCR hybrid module bug (known issue for PDFs)');

    process.exit(1);

  } catch (err) {
    console.error('\n❌ Fatal Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// Run diagnostics
main();
