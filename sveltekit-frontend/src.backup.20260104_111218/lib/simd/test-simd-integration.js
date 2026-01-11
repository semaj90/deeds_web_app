/**
 * Test script for SIMD JSON parser integration
 */

import { checkSIMDStatus, enhanceRabbitMQMessage, parseLargeJSON } from './simd-json-integration.js';

async function testSIMDIntegration() {
 console.log('🧪 Testing SIMD JSON Parser Integration...\n');

 // Test 1: Check SIMD status
 console.log('1. Checking SIMD service status...');
 const status = await checkSIMDStatus();
 console.log('Status:', status);
 console.log('');

 // Test 2: Test message enhancement
 console.log('2. Testing RabbitMQ message enhancement...');
 const testMessage = {
 type: 'legal_document',
 payload: '{"id": "test-doc", "title": "Contract Analysis", "content": "Legal content here"}',
 metadata: '{"jurisdiction": "federal", "case_type": "contract"}',
 embeddings: '[0.1, 0.2, 0.3]'
 };

 try {
 const enhanced = await enhanceRabbitMQMessage(testMessage);
 console.log('✅ Message enhancement successful');
 console.log('Enhanced message keys:', Object.keys(enhanced));
 console.log('');
 } catch (error) {
 console.log('❌ Message enhancement failed:', error.message);
 console.log('');
 }

 // Test 3: Test large JSON parsing
 console.log('3. Testing large JSON parsing...');
 const largeJson = JSON.stringify({
 documents: Array(100).fill().map((_, i) => ({
 id: `doc-${i}`,
 title: `Legal Document ${i}`,
 content: 'Sample legal content '.repeat(50),
 metadata: { type: 'contract', jurisdiction: 'federal' }
 }))
 });

 try {
 const parsed = await parseLargeJSON(largeJson);
 console.log('✅ Large JSON parsing successful');
 console.log('Parsed documents count:', parsed.documents?.length || 'unknown');
 console.log('');
 } catch (error) {
 console.log('❌ Large JSON parsing failed:', error.message);
 console.log('');
 }

 console.log('🎉 SIMD Integration test completed!');
}

// Run the test
testSIMDIntegration().catch(console.error);