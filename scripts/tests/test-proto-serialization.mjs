/**
 * Test protobuf serialization for evidence metadata
 *
 * Verifies:
 * 1. Protobuf schema can be loaded
 * 2. Evidence metadata can be serialized to base64
 * 3. Deserialization produces correct structure
 * 4. Size comparison: protobuf vs JSON
 */

import { serializeEvidenceMetadataBase64, deserializeEvidenceMetadataBase64 } from '../../sveltekit-frontend/src/lib/server/evidence/proto-serializer.ts';

console.log('═'.repeat(70));
console.log('Protobuf Evidence Metadata Serialization Test');
console.log('═'.repeat(70));
console.log();

// Sample evidence metadata (realistic structure from evidence upload pipeline)
const testMetadata = {
  evidenceId: 'c9b79f5d-8f4e-4c3a-9d2a-1b3c4d5e6f7a',
  schemaVersion: 1,
  timestamp: Date.now(),
  extraction: {
    method: 'pdf-parse',
    textLength: 15420,
    ocrFallbackUsed: false,
  },
  entities: [
    {
      type: 'PERSON',
      value: 'John Doe',
      confidence: 0.95,
      startOffset: 142,
      endOffset: 150,
      source: 'langextract',
    },
    {
      type: 'DATE',
      value: '2024-03-15',
      confidence: 0.98,
      startOffset: 245,
      endOffset: 255,
      source: 'langextract',
    },
    {
      type: 'MONEY',
      value: '$50,000',
      confidence: 0.92,
      startOffset: 512,
      endOffset: 519,
      source: 'langextract',
    },
  ],
  vlm: {
    summary: 'Legal contract document with signatures and official seal visible',
    keyFindings: [
      'Two signatures present at bottom of page',
      'Official notary seal in lower right',
      'Date stamp: March 15, 2024',
    ],
    suggestedTags: ['contract', 'signed', 'notarized'],
    model: 'gemma4-rotorquant:latest-q8_0 (turboquant)',
    cached: false,
  },
  forensics: {
    flags: ['signature_detected', 'legal_keywords_high'],
    riskScore: 0.15,
  },
  sections: [
    {
      sectionType: 'ARTICLE',
      confidence: 0.88,
      startOffset: 0,
      endOffset: 1240,
    },
    {
      sectionType: 'SECTION',
      confidence: 0.92,
      startOffset: 1240,
      endOffset: 3580,
    },
  ],
  nlp: {
    documentType: 'contract',
    practiceArea: 'civil',
    confidence: 0.87,
    keyPhrases: ['whereas party', 'agrees to', 'consideration of'],
  },
  suggestedTags: ['contract', 'signed', 'notarized', 'civil', 'legal'],
  pipelineStats: {
    llmEscalated: true,
    graphConnectionsCreated: 3,
    processingTimeMs: 2450,
  },
};

console.log('📋 Test Metadata:');
console.log(`   Evidence ID: ${testMetadata.evidenceId}`);
console.log(`   Entities: ${testMetadata.entities.length}`);
console.log(`   VLM Findings: ${testMetadata.vlm.keyFindings.length}`);
console.log(`   Sections: ${testMetadata.sections.length}`);
console.log(`   Forensic Flags: ${testMetadata.forensics.flags.length}`);
console.log();

// Step 1: Serialize to base64
console.log('1️⃣  Serializing to protobuf...');
let protoBase64;
try {
	protoBase64 = serializeEvidenceMetadataBase64(testMetadata);
	console.log(`   ✅ Success: ${protoBase64.length} chars (base64)`);
} catch (err) {
	console.error(`   ❌ Serialization failed:`, err.message);
	process.exit(1);
}
console.log();

// Step 2: Deserialize from base64
console.log('2️⃣  Deserializing from protobuf...');
let deserialized;
try {
	deserialized = deserializeEvidenceMetadataBase64(protoBase64);
	console.log(`   ✅ Success`);
} catch (err) {
	console.error(`   ❌ Deserialization failed:`, err.message);
	process.exit(1);
}
console.log();

// Step 3: Verify structure
console.log('3️⃣  Verifying deserialized structure...');
const checks = [
	['Evidence ID', deserialized.evidenceId === testMetadata.evidenceId],
	['Schema Version', deserialized.schemaVersion === 1],
	['Entity Count', deserialized.entities?.length === testMetadata.entities.length],
	['VLM Summary', deserialized.vlm?.summary === testMetadata.vlm.summary],
	['Forensic Flags', deserialized.forensics?.flags?.length === testMetadata.forensics.flags.length],
	['Section Count', deserialized.sections?.length === testMetadata.sections.length],
	['NLP Type', deserialized.nlp?.documentType === testMetadata.nlp.documentType],
	['Pipeline Stats', deserialized.pipelineStats?.graphConnectionsCreated === 3],
];

let allPassed = true;
for (const [label, passed] of checks) {
	console.log(`   ${passed ? '✅' : '❌'} ${label}`);
	if (!passed) allPassed = false;
}
console.log();

// Step 4: Size comparison
console.log('4️⃣  Size Comparison:');
const jsonString = JSON.stringify(testMetadata);
const jsonBytes = Buffer.from(jsonString).length;
const protoBytes = Buffer.from(protoBase64, 'base64').length;
const reduction = ((jsonBytes - protoBytes) / jsonBytes * 100).toFixed(1);

console.log(`   JSON:     ${jsonBytes.toLocaleString()} bytes`);
console.log(`   Protobuf: ${protoBytes.toLocaleString()} bytes`);
console.log(`   Savings:  ${reduction}% reduction`);
console.log();

// Step 5: Result
console.log('═'.repeat(70));
if (allPassed) {
	console.log('✅ ALL TESTS PASSED — Protobuf serialization working correctly');
	console.log();
	console.log('Next steps:');
	console.log('  1. Upload test evidence via /api/evidence/upload');
	console.log('  2. Check evidence.ai_analysis for proto_bytes + proto_version fields');
	console.log('  3. Verify size savings in PostgreSQL (compare ai_analysis JSONB size)');
} else {
	console.log('❌ SOME TESTS FAILED — Check deserialization logic');
	process.exit(1);
}
console.log('═'.repeat(70));
