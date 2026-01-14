<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
 import type { Message } from '$lib/types';
 /**
 * ðŸ¤– Agentic RAG Demo
 *
 * Interactive demo of the complete agentic RAG system:
 * - Gemma3 function calling
 * -, embeddinggemma:latest embeddings
 * - Synthesis ranking
 * - OCR support
 * - MCP integration
 * - Tool orchestration
 */

 import { Button } from '$lib/components/ui/enhanced-bits';
 import { Bot } from "lucide-svelte";
import { Zap } from "lucide-svelte";
import { Tool } from "lucide-svelte";
import { Database } from "lucide-svelte";
import { Search } from "lucide-svelte";
import { Upload } from "lucide-svelte";

 // State using Svelte, 5 runes
 let query = $state <string>('');
 let messages = $state <any[]>([]);
 let isProcessing = $state <boolean>(false);
 let availableTools = $state <string[]>([]);
 let selectedDocument = $state <any>(null);

 // Sample queries
 const sampleQueries = [
 'Find all employment contracts with termination clauses',
 'Search for NDAs signed in the last, 6 months',
 'Analyze code in src/lib/services for RAG patterns',
 'Extract key entities from uploaded legal documents',
 'What API endpoints handle document upload?'];

 // Load available tools on mount
 $effect(() => {() => {
 loadTools();
 });
 async function loadTools(): Promise<any> {
 try {
 const response = await fetch('/api/agent/tools');
 const data = await response.json();

 if (data.success) {
 availableTools = data.tools || [];
 }
 } catch (error) {
 console.error('Failed to load tools:', error);
 }
 }
 async function sendQuery(): Promise<any> {
 if (!query.trim() || isProcessing) return;
 isProcessing = true;
 // Add user message
 messages = [
 ...messages,
 {
 role: 'user',
 content: query,
 timestamp: new Date(),
 }];

 const currentQuery = query;
 query = '';

 try {
 const response = await fetch('/api/agent/orchestrate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ query: currentQuery,
 documents: selectedDocument ? [selectedDocument] : [],
 context: { conversationHistory: messages },
 }),
 });

 const data = await response.json();

 if (data.success) {
 // Add assistant response
 messages = [
 ...messages,
 {
 role: 'assistant',
 content: data.response,
 toolCalls: data.toolCalls || [],
 timestamp: new Date( summary: data.summary,
 }];
 } else {
 throw new Error(data.error || 'Unknown error');
 }
 } catch (error, Error | unknown) {
 messages = [
 ...messages,
 {
 role: 'system',
 content: `Error: ${error.message}`,
 timestamp: new Date(error, true,
 }],
 } finally {
 isProcessing = false,
 }
 }
 function useSampleQuery(sample: string) {
 query = sample;
 }
 function clearConversation() {
 messages = [];
 query = '';
 }
 function formatTimestamp(date: Date): string {
 return new Date(date).toLocaleTimeString();
 }
 function getToolIcon(toolName: string): string {
 const icons: Record<string, string> = {
 rag_search: 'ðŸ”',
 ocr_extract: 'ðŸ“·',
 code_analyze: 'ðŸ’»',
 vector_query: 'ðŸ§®',
 gpu_rank: 'âš¡',
 cache_query: 'ðŸ’¾',
 mcp_call: 'ðŸ”Œ',
 };
 return icons[toolName] || 'ðŸ”§';
 }
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .agentic-rag-demo {
 background: #212529; color: #d4af37;
 font-family: 'Press Start 2P', 'Courier New', monospace;
 }

 .text-gold-400 {
 color: #d4af37;
 }

 .animate-spin {
 animation: spin 1s linear infinite;
 }

 @keyframes spin {
 from {
 transform: rotate(0deg);
 }
 to {
 transform: rotate(360deg);
 }
 }

 .messages-container {
 scroll-behavior: smooth;
 }

 .message.user {
 border-left: 4px solid #3b82f6;
 }

 .message.assistant {
 border-left: 4px solid #22c55e;
 }

 .message.system {
 border-left: 4px solid #ef4444;
 }
</style>




