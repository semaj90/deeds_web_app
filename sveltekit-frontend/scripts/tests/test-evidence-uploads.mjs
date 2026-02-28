#!/usr/bin/env node
/**
 * Evidence Upload Integration Tests
 * Tests all 3 upload paths: PDF, Image, Audio
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:5173';
const TEST_CASE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; // From seed-evidence.ts

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

let testsPassed = 0;
let testsFailed = 0;

function log(msg, color = RESET) {
  console.log(`${color}${msg}${RESET}`);
}

function assert(condition, testName) {
  if (condition) {
    testsPassed++;
    log(`  ✓ ${testName}`, GREEN);
    return true;
  } else {
    testsFailed++;
    log(`  ✗ ${testName}`, RED);
    return false;
  }
}

async function uploadEvidence(file, fileName, caseId) {
  const formData = new FormData();

  // Create a Blob from the file buffer
  const blob = new Blob([file], { type: getMimeType(fileName) });
  formData.append('file', blob, fileName);
  formData.append('caseId', caseId);
  formData.append('title', `Test ${fileName}`);

  const response = await fetch(`${BASE_URL}/api/evidence/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  return { response, data };
}

function getMimeType(fileName) {
  if (fileName.endsWith('.pdf')) return 'application/pdf';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.jpg')) return 'image/jpeg';
  if (fileName.endsWith('.wav')) return 'audio/wav';
  if (fileName.endsWith('.mp3')) return 'audio/mpeg';
  return 'application/octet-stream';
}

async function testPDFUpload() {
  log('\n📄 Test 1: PDF Upload (documentary type + docling extraction)', BLUE);

  // Create minimal valid PDF
  const pdfHeader = '%PDF-1.4\n';
  const pdfContent = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const pdfPages = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const pdfPage = '3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n';
  const pdfResources = '4 0 obj\n<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>\nendobj\n';
  const pdfStream = '5 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 100 700 Td (Test PDF Document) Tj ET\nendstream\nendobj\n';
  const pdfXref = 'xref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000115 00000 n\n0000000214 00000 n\n0000000304 00000 n\n';
  const pdfTrailer = 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n408\n%%EOF\n';

  const pdfBuffer = Buffer.from(pdfHeader + pdfContent + pdfPages + pdfPage + pdfResources + pdfStream + pdfXref + pdfTrailer);

  try {
    const { response, data } = await uploadEvidence(pdfBuffer, 'test-document.pdf', TEST_CASE_ID);

    assert(response.ok, 'Upload returns 200 OK');
    assert(data.success === true, 'Response indicates success');
    assert(data.evidence?.evidence_type === 'documentary', `Auto-detected as 'documentary' (got: ${data.evidence?.evidence_type})`);
    assert(data.evidence?.file_type === 'application/pdf', `File type is 'application/pdf'`);
    assert(data.evidence?.title?.includes('Test'), 'Title preserved');

    // Check if docling extraction happened (metadata should have docling blocks)
    const hasDoclingData = data.evidence?.metadata?.doclingBlocks || data.evidence?.metadata?.structure;
    log(`    Docling extraction: ${hasDoclingData ? 'YES' : 'NO (may be disabled)'}`, hasDoclingData ? GREEN : YELLOW);

  } catch (error) {
    log(`  ✗ PDF upload failed: ${error.message}`, RED);
    testsFailed++;
  }
}

async function testImageUpload() {
  log('\n🖼️  Test 2: Image Upload (photo type + VLM analysis)', BLUE);

  // Create minimal valid PNG (1x1 red pixel)
  const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const pngIHDR = Buffer.from([
    0x00, 0x00, 0x00, 0x0D, // Length
    0x49, 0x48, 0x44, 0x52, // 'IHDR'
    0x00, 0x00, 0x00, 0x01, // Width: 1
    0x00, 0x00, 0x00, 0x01, // Height: 1
    0x08, 0x02, 0x00, 0x00, 0x00, // Bit depth, color type, compression, filter, interlace
    0x90, 0x77, 0x53, 0xDE  // CRC
  ]);
  const pngIDAT = Buffer.from([
    0x00, 0x00, 0x00, 0x0C, // Length
    0x49, 0x44, 0x41, 0x54, // 'IDAT'
    0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00,
    0x18, 0xDD, 0x8D, 0xB4  // CRC
  ]);
  const pngIEND = Buffer.from([
    0x00, 0x00, 0x00, 0x00, // Length
    0x49, 0x45, 0x4E, 0x44, // 'IEND'
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);

  const pngBuffer = Buffer.concat([pngSignature, pngIHDR, pngIDAT, pngIEND]);

  try {
    const { response, data } = await uploadEvidence(pngBuffer, 'test-photo.png', TEST_CASE_ID);

    assert(response.ok, 'Upload returns 200 OK');
    assert(data.success === true, 'Response indicates success');
    assert(data.evidence?.evidence_type === 'photo', `Auto-detected as 'photo' (got: ${data.evidence?.evidence_type})`);
    assert(data.evidence?.file_type === 'image/png', `File type is 'image/png'`);

    // Check if VLM analysis happened
    const hasVLMData = data.evidence?.metadata?.visionAnalysis;
    log(`    VLM analysis: ${hasVLMData ? 'YES' : 'NO (requires YOLO + Ollama VLM)'}`, hasVLMData ? GREEN : YELLOW);

  } catch (error) {
    log(`  ✗ Image upload failed: ${error.message}`, RED);
    testsFailed++;
  }
}

async function testAudioUpload() {
  log('\n🎵 Test 3: Audio Upload (audio type + MCP transcription)', BLUE);

  // Create minimal valid WAV (silence, 1 sample)
  const wavHeader = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // 'RIFF'
    0x24, 0x00, 0x00, 0x00, // File size - 8
    0x57, 0x41, 0x56, 0x45, // 'WAVE'
    0x66, 0x6D, 0x74, 0x20, // 'fmt '
    0x10, 0x00, 0x00, 0x00, // Subchunk1Size (16 for PCM)
    0x01, 0x00,             // AudioFormat (1 = PCM)
    0x01, 0x00,             // NumChannels (1 = mono)
    0x44, 0xAC, 0x00, 0x00, // SampleRate (44100)
    0x88, 0x58, 0x01, 0x00, // ByteRate
    0x02, 0x00,             // BlockAlign
    0x10, 0x00,             // BitsPerSample (16)
    0x64, 0x61, 0x74, 0x61, // 'data'
    0x02, 0x00, 0x00, 0x00, // Subchunk2Size
    0x00, 0x00              // 1 sample of silence
  ]);

  try {
    const { response, data } = await uploadEvidence(wavHeader, 'test-audio.wav', TEST_CASE_ID);

    assert(response.ok, 'Upload returns 200 OK');
    assert(data.success === true, 'Response indicates success');
    assert(data.evidence?.evidence_type === 'audio', `Auto-detected as 'audio' (got: ${data.evidence?.evidence_type})`);
    assert(data.evidence?.file_type === 'audio/wav', `File type is 'audio/wav'`);

    // Check if MCP transcription happened
    const hasTranscript = data.evidence?.metadata?.transcript || data.evidence?.full_text;
    log(`    MCP transcription: ${hasTranscript ? 'YES' : 'NO (requires Docling ASR + FastMCP)'}`, hasTranscript ? GREEN : YELLOW);

  } catch (error) {
    log(`  ✗ Audio upload failed: ${error.message}`, RED);
    testsFailed++;
  }
}

async function testLangExtractRefinement() {
  log('\n🔍 Test 4: LangExtract Evidence Type Refinement', BLUE);

  // Create a text file with witness statement content
  const witnessText = `SWORN STATEMENT OF WITNESS\n\nI, John Doe, hereby swear that on the night of January 15th, 2025, I witnessed the following events...\n\nSigned under oath,\nJohn Doe`;

  const txtBuffer = Buffer.from(witnessText);

  try {
    const { response, data } = await uploadEvidence(txtBuffer, 'witness-statement.txt', TEST_CASE_ID);

    assert(response.ok, 'Upload returns 200 OK');
    assert(data.success === true, 'Response indicates success');

    // Should be auto-detected as 'documentary' initially, then refined to 'testimonial'
    const evidenceType = data.evidence?.evidence_type;
    const wasRefined = evidenceType === 'testimonial' || evidenceType === 'witness_statement';

    log(`    Initial type: documentary → Refined to: ${evidenceType}`, wasRefined ? GREEN : YELLOW);
    log(`    LangExtract refinement: ${wasRefined ? 'YES' : 'NO (requires port 8095)'}`, wasRefined ? GREEN : YELLOW);

    // Check if LangExtract profile was stored
    const hasProfile = data.evidence?.metadata?.evidenceProfile;
    if (hasProfile) {
      log(`    LangExtract profile: admissibility=${hasProfile.admissibility_indicators?.length || 0} indicators`, GREEN);
    }

  } catch (error) {
    log(`  ✗ LangExtract test failed: ${error.message}`, RED);
    testsFailed++;
  }
}

// Run all tests
async function runTests() {
  log('\n═══════════════════════════════════════════════', BLUE);
  log('Evidence Upload Integration Tests', BLUE);
  log('═══════════════════════════════════════════════\n', BLUE);

  await testPDFUpload();
  await testImageUpload();
  await testAudioUpload();
  await testLangExtractRefinement();

  // Summary
  log('\n═══════════════════════════════════════════════', BLUE);
  log(`Tests Passed: ${testsPassed}`, GREEN);
  log(`Tests Failed: ${testsFailed}`, testsFailed > 0 ? RED : GREEN);
  log('═══════════════════════════════════════════════\n', BLUE);

  if (testsFailed > 0) {
    log('⚠️  Some tests failed. Check services: Docling (Python), YOLO, Ollama VLM, LangExtract (port 8095)', YELLOW);
  } else {
    log('✅ All evidence upload paths working!', GREEN);
  }

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(error => {
  log(`\n❌ Test runner crashed: ${error.message}`, RED);
  console.error(error);
  process.exit(1);
});
