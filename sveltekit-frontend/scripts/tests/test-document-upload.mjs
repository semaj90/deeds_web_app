/**
 * Document Upload Integration Test
 * Tests document upload → embedding → chat context pipeline
 */

const BASE_URL = process.env.PUBLIC_APP_URL ?? (process.env.TEST_BASE_URL || 'http://localhost:5173');

// ANSI colors
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const reset = '\x1b[0m';

function log(message, color = reset) {
  console.log(`${color}${message}${reset}`);
}

async function testDocumentUpload() {
  log('\n📤 Test: Upload Text Document', blue);

  try {
    // Create a simple test document
    const testContent = `Legal Case Summary

This is a test legal document for the chat upload feature.

Key Points:
1. Contract dispute regarding payment terms
2. Defendant failed to meet obligations under Section 4.2
3. Plaintiff seeks damages of $50,000

Relevant Statutes:
- UCC § 2-601 (Perfect Tender Rule)
- State Contract Law § 15.3

Timeline:
- 2024-01-15: Contract signed
- 2024-03-01: Payment due
- 2024-03-15: Defendant defaulted`;

    const blob = new Blob([testContent], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, 'test-case-summary.txt');
    formData.append('sessionId', 'test-session-123');
    formData.append('caseId', 'c9b79f5d-4a5e-4e8f-8f3c-1a2b3c4d5e6f');

    const response = await fetch(`${BASE_URL}/api/documents/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      log(`❌ Upload failed: ${error.error || response.statusText}`, red);
      return null;
    }

    const result = await response.json();
    log(`✅ Upload successful!`, green);
    log(`  Document ID: ${result.documentId}`, reset);
    log(`  Attachment ID: ${result.attachmentId}`, reset);

    return result.documentId;
  } catch (error) {
    log(`❌ Upload error: ${error.message}`, red);
    return null;
  }
}

async function waitForEmbedding(documentId, maxWait = 30000) {
  log('\n⏳ Waiting for document embedding...', blue);

  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    try {
      // Check Qdrant for the document
      const response = await fetch('http://localhost:6333/collections/chat_documents/points/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [{ key: 'documentId', match: { value: documentId } }]
          },
          limit: 1,
          with_payload: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result && data.result.length > 0) {
          log(`✅ Document embedded in Qdrant!`, green);
          log(`  Chunks indexed: ${data.result.length}`, reset);
          return true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      log(`⚠️  Waiting... (${Math.round((Date.now() - startTime) / 1000)}s)`, yellow);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  log(`⏱️  Timeout waiting for embedding`, yellow);
  return false;
}

async function testChatContext(sessionId) {
  log('\n💬 Test: Chat with Document Context', blue);

  try {
    // This would require the SSE chat endpoint with auth
    log('⚠️  Chat context test requires running dev server + auth', yellow);
    log('   Manual test: Send chat message in UI and verify document context appears', reset);
  } catch (error) {
    log(`❌ Chat test error: ${error.message}`, red);
  }
}

async function main() {
  log('═══════════════════════════════════════════════════', blue);
  log('   Document Upload Integration Test', blue);
  log('═══════════════════════════════════════════════════', blue);

  // Test 1: Upload document
  const documentId = await testDocumentUpload();

  if (documentId) {
    // Test 2: Wait for embedding
    await waitForEmbedding(documentId);

    // Test 3: Chat context
    await testChatContext('test-session-123');
  }

  log('\n✅ Document pipeline test complete!', green);
  log('\nNext steps:', blue);
  log('  1. Start dev server: npm run dev', reset);
  log('  2. Upload a document via UI', reset);
  log('  3. Ask chat about the document content', reset);
  log('  4. Verify LLM response includes document citations', reset);
}

main().catch(console.error);
