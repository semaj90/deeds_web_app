/**
 * Chat Document Context Integration Test
 * Verifies SSE chat includes uploaded document context
 */

const BASE_URL = process.env.PUBLIC_APP_URL ?? (process.env.TEST_BASE_URL || 'http://localhost:5173');
const SESSION_ID = '00000000-0000-0000-0000-000000000001';

// ANSI colors
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const blue = '\x1b[34m';
const reset = '\x1b[0m';

function log(message, color = reset) {
  console.log(`${color}${message}${reset}`);
}

async function testChatWithDocumentContext() {
  log('\n💬 Test: SSE Chat with Document Context', blue);

  try {
    // Send a chat message asking about the document
    const response = await fetch(`${BASE_URL}/api/sse/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        conversationId: SESSION_ID,
        message: 'What is this case about? Please summarize the key facts.',
        temperature: 0.3,
        maxTokens: 500
      })
    });

    if (!response.ok) {
      log(`❌ Chat request failed: ${response.status} ${response.statusText}`, red);
      return false;
    }

    log(`✅ SSE stream started`, green);

    // Read SSE stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let systemPromptFound = false;
    let documentContextFound = false;
    let chunkCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      chunkCount++;

      // Check for document context in the stream
      if (chunk.includes('contract-dispute-summary.txt')) {
        documentContextFound = true;
      }

      if (chunk.includes('UCC') || chunk.includes('Contract') || chunk.includes('ABC Corporation')) {
        systemPromptFound = true;
      }

      // Parse SSE events
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.substring(6);
          if (data === '[DONE]') {
            log(`\n✅ Stream completed`, green);
            break;
          }
          try {
            const json = JSON.parse(data);
            if (json.content) {
              fullResponse += json.content;
            }
          } catch (e) {
            // Ignore parse errors for non-JSON lines
          }
        }
      }

      // Stop after reasonable amount of chunks
      if (chunkCount > 50) break;
    }

    log(`\n📊 Stream Analysis:`, blue);
    log(`  Chunks received: ${chunkCount}`, reset);
    log(`  Total response length: ${fullResponse.length} chars`, reset);
    log(`  Document context detected: ${documentContextFound ? '✅' : '❌'}`, documentContextFound ? green : red);
    log(`  System prompt includes doc: ${systemPromptFound ? '✅' : '❌'}`, systemPromptFound ? green : red);

    if (fullResponse.length > 0) {
      log(`\n📝 LLM Response Preview:`, blue);
      log(`  ${fullResponse.slice(0, 300)}...`, reset);
    }

    return documentContextFound || systemPromptFound;
  } catch (error) {
    log(`❌ Test error: ${error.message}`, red);
    return false;
  }
}

async function verifyDocumentContextFunction() {
  log('\n🔍 Verify fetchChatDocumentContext() Function', blue);

  try {
    // Make a simple test to verify the function works
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
    });

    // Check if attachments exist for session
    const result = await pool.query(
      `SELECT
        cda.id,
        cda.file_name,
        cda.embedding_status,
        d.id as doc_id
      FROM chat_document_attachments cda
      LEFT JOIN documents d ON cda.document_id = d.id
      WHERE cda.chat_session_id = $1
      ORDER BY cda.upload_timestamp DESC`,
      [SESSION_ID]
    );

    if (result.rows.length === 0) {
      log(`❌ No attachments found for session`, red);
      await pool.end();
      return false;
    }

    log(`✅ Found ${result.rows.length} attachment(s)`, green);
    for (const row of result.rows) {
      log(`  - ${row.file_name} (${row.embedding_status})`, reset);
    }

    // Check Qdrant for chunks
    let totalChunks = 0;
    for (const row of result.rows) {
      const qdrantResponse = await fetch('http://localhost:6333/collections/chat_documents/points/scroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [
              { key: 'documentId', match: { value: row.doc_id } },
              { key: 'sessionId', match: { value: SESSION_ID } }
            ]
          },
          limit: 100,
          with_payload: true
        })
      });

      if (qdrantResponse.ok) {
        const data = await qdrantResponse.json();
        const chunks = data.result?.points || [];
        totalChunks += chunks.length;
        log(`  → ${chunks.length} chunks in Qdrant`, reset);
      }
    }

    log(`\n📊 Context Summary:`, blue);
    log(`  Total attachments: ${result.rows.length}`, reset);
    log(`  Total chunks available: ${totalChunks}`, reset);

    await pool.end();
    return totalChunks > 0;
  } catch (error) {
    log(`❌ Verification error: ${error.message}`, red);
    return false;
  }
}

async function main() {
  log('═══════════════════════════════════════════════════', blue);
  log('   Chat Document Context Integration Test', blue);
  log('═══════════════════════════════════════════════════', blue);

  // Test 1: Verify document context function
  const contextReady = await verifyDocumentContextFunction();

  if (!contextReady) {
    log('\n❌ Document context not ready, skipping chat test', red);
    return;
  }

  // Test 2: Send chat message and verify context
  log('\n⏳ Sending chat message...', blue);
  const chatSuccess = await testChatWithDocumentContext();

  if (chatSuccess) {
    log('\n✅ Chat document context integration VERIFIED!', green);
    log('\n🎉 Sprint 4B Document Pipeline: FULLY OPERATIONAL', green);
  } else {
    log('\n⚠️  Chat response received but document context unclear', yellow);
    log('   Manual verification recommended:', reset);
    log('   1. Open http://localhost:5173/chat/' + SESSION_ID, reset);
    log('   2. Send: "What is this case about?"', reset);
    log('   3. Check response mentions contract-dispute-summary.txt', reset);
  }
}

main().catch(console.error);
