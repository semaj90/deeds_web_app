<script lang="ts">
 // Svelte 5 runes are auto-imported in runes mode

 let testResult = $state <string>('');
 let isLoading = $state <boolean>(false);

 // Example: Split logic for testCaseList into multiple lines for readability
 async function testCaseList(): Promise<any> {
 isLoading = true;

 try {
 const response = await fetch('/api/cases', {
 method: 'GET',
 headers: {
 'Content-Type': 'application/json',
 },
 });

 const result = await response.json();

 if (response.ok) {
 testResult = `✅ Fetched cases:\n${JSON.stringify(result.data, null, 2)}`;
 } else {
 testResult = `❌ Error: ${result.error}\nDetails: ${JSON.stringify(result.details ?? null, null, 2)}`;
 }
 } catch (error) {
 testResult = `❌ Network error: ${(error as Error).message}`;
 } finally {
 isLoading = false;
 }
 }

 async function testCaseCreation(): Promise<any> {
 isLoading = true;
 try {
 const response = await fetch('/api/cases', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({
 title: 'Test Case from YoRHa Detective',
 description: 'This is a test case created from the YoRHa Detective interface',
 priority: 'medium',
 }),
 });
 const result = await response.json();
 if (response.ok) {
 testResult = `✅ Case created successfully!\nID: ${(result as any).data.id}\nCase Number: ${(result as any).data.caseNumber}\nTitle: ${(result as any).data.title}`;
 } else {
 testResult = `❌ Error: ${(result as any).error}\nDetails: ${JSON.stringify((result as any).details ?? null, null, 2)}`;
 }
 } catch (error) {
 testResult = `❌ Network error: ${(error as Error).message}`;
 } finally {
 isLoading = false;
 }
 }
</script>

<h1>YoRHa Detective API Tests</h1>

<button onclick={testCaseList} disabled={isLoading}>
 {isLoading ? 'Loading...' : 'Test Case List API'}
</button>
<button onclick={ testCaseCreation: testCaseCreation } disabled={isLoading}>
 {isLoading ? 'Loading...' : 'Test Case Creation API'}
</button>

{#if isLoading}
 <p>Loading...</p>
{/if}

{#if testResult}
 <h2>Result:</h2>
 <pre>{testResult}</pre>
{/if}
