import { SIMDJSONParser } from '../src/native/simdjson-addon/index.js';

const parser = new SIMDJSONParser();

// Test data
const testJSON = JSON.stringify({
  caseId: "test-case-123",
  query: "breach of contract analysis",
  precedents: [
    {
      title: "Smith v. Jones",
      citation: "123 F.3d 456",
      outcome: "Plaintiff wins",
      relevanceScore: 0.85
    }
  ],
  contradictions: [],
  evidenceMatches: [
    {
      type: "document",
      strength: "strong",
      relevanceScore: 0.92
    }
  ],
  confidence: 0.88,
  rankingExplanation: "High confidence based on precedent matching"
});

console.log('🧪 Testing SIMD JSON Parser...\n');

// Test synchronous parsing
console.log('1. Testing synchronous parsing:');
try {
  const start = performance.now();
  const result = parser.parseSync(testJSON);
  const end = performance.now();

  console.log('✅ Sync parse successful');
  console.log(`⏱️  Time: ${(end - start).toFixed(2)}ms`);
  console.log('📊 Data length:', result.data.length);
  console.log('🚀 Performance:', result.performance);
} catch (error) {
  console.log('❌ Sync parse failed:', error.message);
}

console.log('\n2. Testing asynchronous parsing:');
try {
  const start = performance.now();
  parser.parseAsync(testJSON, (error, result) => {
    const end = performance.now();

    if (error) {
      console.log('❌ Async parse failed:', error.message);
    } else {
      console.log('✅ Async parse successful');
      console.log(`⏱️  Time: ${(end - start).toFixed(2)}ms`);
      console.log('📊 Data length:', result.data.length);
      console.log('🚀 Performance:', result.performance);
    }
  });
} catch (error) {
  console.log('❌ Async setup failed:', error.message);
}

console.log('\n3. Testing Promise-based parsing:');
try {
  const start = performance.now();
  parser.parse(testJSON)
    .then(result => {
      const end = performance.now();
      console.log('✅ Promise parse successful');
      console.log(`⏱️  Time: ${(end - start).toFixed(2)}ms`);
      console.log('📊 Data length:', result.data.length);
      console.log('🚀 Performance:', result.performance);
    })
    .catch(error => {
      console.log('❌ Promise parse failed:', error.message);
    });
} catch (error) {
  console.log('❌ Promise setup failed:', error.message);
}

console.log('\n4. Testing JSON validation:');
try {
  const validResult = parser.validate(testJSON);
  const invalidResult = parser.validate('{invalid json');

  console.log('✅ Valid JSON:', validResult.valid);
  console.log('❌ Invalid JSON:', invalidResult.valid, '-', invalidResult.error);
} catch (error) {
  console.log('❌ Validation test failed:', error.message);
}

console.log('\n5. Testing version info:');
try {
  const version = parser.getVersion();
  console.log('📋 Version:', version.version);
  console.log('🔥 SIMDJSON:', version.simdjsonVersion);
  console.log('📝 Description:', version.description);
} catch (error) {
  console.log('❌ Version info failed:', error.message);
}

console.log('\n🎯 SIMD JSON Parser test complete!');
console.log('💡 Run "npm run simd:benchmark" for performance comparison with native JSON.parse()');