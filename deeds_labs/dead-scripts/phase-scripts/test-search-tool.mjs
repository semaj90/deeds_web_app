
import AgenticToolCaller from './phase89-agentic-tools.mjs';

async function testLocalDocsSearch() {
    console.log('🧪 Testing search_local_docs tool...');
    const agent = new AgenticToolCaller();

    // Test 1: Simple word
    console.log('\n--- Test 1: Simple Word "Svelte" ---');
    try {
        const result1 = await agent.tools.search_local_docs('Svelte');
        if (result1.success && result1.content.length > 0) {
            console.log('✅ Test 1 PASSED: Found "Svelte"');
        } else {
            console.error('❌ Test 1 FAILED');
        }
    } catch (e) { console.error('❌ Test 1 Error:', e); }

    // Test 2: Special characters (Fixed string check)
    console.log('\n--- Test 2: Special Chars "$state" ---');
    try {
        const result2 = await agent.tools.search_local_docs('$state');
        // $state should be in llms.txt or svelte.txt
        if (result2.success && result2.content.includes('$state')) {
            console.log('✅ Test 2 PASSED: Found "$state"');
        } else {
            console.error('❌ Test 2 FAILED: Content does not contain literal $state or none found');
            console.log('debug content:', result2.content);
        }
    } catch (e) { console.error('❌ Test 2 Error:', e); }

    await agent.pool.end();
    await agent.redis.quit();
}

testLocalDocsSearch();
