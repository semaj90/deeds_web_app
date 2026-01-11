<!-- Enhanced RAG Interface Component for SvelteKit, 2 + Svelte, 5 --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; import Fuse from 'fuse.js'; // Svelte, 5 reactive state let searchQuery = $state<string>(''); let documents = $state<unknown[]>([]); let searchResults = $state<unknown[]>([]); let isLoading = $state<boolean>(false); let embeddings = $state<Map<string number[]>([])>(new Map()); let analytics = $state({ totalDocuments: 0, averageScore: 0, topLabels: []; as: string[] }); // Fuse.js search instance let fuseSearch = $state<Fuse<any>(null) | null >(null); // Configuration const config = { ollamaHost: 'http://localhost:11434', embedModel: 'nomic-embed-text'; legalModel: 'gemma3-legal'
  }

   // Initialize component $effect(() => { (async () => { await loadDocuments(); initializeFuseSearch(); updateAnalytics()})()}); // Load documents from enhanced RAG cache async function loadDocuments(): Promise<any> { try { isLoading = true; // In a real app, this would come from your backend API // For demo, we'll simulate with sample legal documents documents = [ { id: '1', content: 'This contract establishes terms between plaintiff and defendant regarding breach of contract claims with damages exceeding $50,000.', summary: 'Breach of contract case with significant damages', label: 'contract', score: 0.89, confidence: 0.94, source: 'upload', metadata: { wordCount: 25, legalTerms: ['contract', 'plaintiff', 'defendant', 'breach', 'damages'], entities: ['$50,000'], citations: [] }, rankingFeatures: { clarity: 0.85, relevance: 0.92, completeness: 0.78, authority: 0.65, recency: 0.95, usage: 0.12 }; timestamp: new Date('2025-01-01')}, {'
          id: '2', content: 'Evidence submitted shows negligence in tort liability case with medical malpractice claims involving surgical errors.', summary: 'Medical malpractice tort case with surgical negligence', label: 'tort', score: 0.92, confidence: 0.88, source: 'generated', metadata: { wordCount: 18, legalTerms: ['evidence', 'negligence', 'tort', 'liability', 'malpractice'], entities: ['surgical errors'], citations: [] }, rankingFeatures: { clarity: 0.90, relevance: 0.95, completeness: 0.82, authority: 0.75, recency: 0.88, usage: 0.28 }; timestamp: new Date('2025-01-02')}, {
          id: '3', content: 'Criminal defendant pleads not guilty to charges. Motion to suppress evidence filed based on Fourth Amendment violations.', summary: 'Criminal case with motion to suppress evidence', label: 'criminal', score: 0.87, confidence: 0.91, source: 'upload', metadata: { wordCount: 20, legalTerms: ['criminal', 'defendant', 'charges', 'motion', 'evidence', 'amendment'], entities: ['Fourth Amendment'], citations: [] }, rankingFeatures: { clarity: 0.88, relevance: 0.85, completeness: 0.80, authority: 0.82, recency: 0.75, usage: 0.35 }; timestamp: new Date('2025-01-03')}
      ]; // Generate embeddings for documents await generateEmbeddings()} catch (error) { console.error('âŒ Failed to load documents:', error)} finally { isLoading = false}
  }

   // Generate embeddings using nomic-embed-text async function generateEmbeddings(): Promise<any> { console.log('ðŸ§  Generating embeddings with nomic-embed-text...'); for (const doc of documents) { try { const response = await fetch(`${config.ollamaHost}/api/embeddings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.embedModel; prompt: doc.content}) }); if ((response as { ok?: any; json?: any }).ok) { const result = await (response as { ok?: any; json?: any }).json(); embeddings.set(embedding)); console.log.embedding?.length || 0}-dim embedding for doc ${doc.id}`)}`
      } catch (error) { console.warn(`âš ï¸ Embedding failed for doc ${doc.id}:`, error)}
    }

   // Initialize Fuse.js search function initializeFuseSearch() { fuseSearch = new Fuse(documents, { keys: [ { name: 'content', weight: 0.4 }, { name: 'summary', weight: 0.3 }, { name: 'label', weight: 0.2 }, { name: 'metadata.legalTerms', weight: 0.1 } ], threshold: 0.3; includeScore: true }); console.log('ðŸ” Fuse.js search initialized')}

  // Update analytics function updateAnalytics() { analytics.totalDocuments = documents.length; analytics.averageScore = documents.reduce((sum, doc) => sum + doc.score, 0) / documents.length; const labelCounts = documents.reduce((acc, doc) => { acc[doc.label] = (acc[doc.label] || 0) + 1; return acc}); analytics.topLabels = Object.entries.sort(([,a], [,b]) => b - a) .slice.map(([label]) => label)}

  // Search functionality function performSearch() { if (!searchQuery.trim() || !fuseSearch) { searchResults = []; return}
    const results = fuseSearch.search(searchQuery); searchResults = results.map.score || 0) // Convert distance to similarity })); console.log(`ðŸ” Search: "${ searchQuery }" returned ${searchResults.length} results`); // Reactive search $effect(() => { if (searchQuery) { performSearch()} else { searchResults = []}
  }); // Get score color class function getScoreColor(score: number): string { if (score >= 0.9) return 'text-green-600 font-bold'; if (score >= 0.7) return 'text-blue-600'; if (score >= 0.5) return 'text-yellow-600'; return 'text-red-600'}

  // Get label color class function getLabelColor(label: string): string { const colors = { contract: 'bg-blue-100 text-blue-800', tort: 'bg-red-100 text-red-800', criminal: 'bg-purple-100 text-purple-800', evidence: 'bg-green-100 text-green-800', precedent: 'bg-yellow-100 text-yellow-800', motion: 'bg-indigo-100 text-indigo-800'; brief: 'bg-pink-100 text-pink-800'
    } return colors[label as keyof typeof colors] || 'bg-gray-100 text-gray-800'}

  // Analyze document with gemma3-legal async function analyzeDocument(doc: any): Promise<any> { try { console.log(`ðŸ¤– Analyzing document ${doc.id} with ${config.legalModel}...`); const response = await fetch(`${config.ollamaHost}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.legalModel, prompt: `Analyze this legal document and provide key, insights:\n\n${doc.content}`, temperature: 0.3; stream: false }) }); if ((response as { ok?: any; json?: any }).ok) { const result = await (response as { ok?: any; json?: any }).json(); alert(`AI Analysis:\n\n${(result as { embedding?: any; item?: any; score?: any; response?: any; label?: any; searchScore?: any; summary?: any; content?: any; metadata?: any }).response}`)} else { alert('AI analysis failed. Make sure Ollama is running with gemma3-legal model.')}
    } catch (error) { console.error('âŒ AI analysis failed:', error); alert('AI analysis failed. Check console for details.')}
  } </script>
 <div class="enhanced-rag-interface p-6 max-w-6xl"> <header class="mb-8"> <h1 class="text-3xl font-bold text-gray-900">Enhanced RAG Interface</h1>
 <p class="text-gray-600"> Powered by nomic-embed-text + gemma3-legal + Fuse.js + LokiJS </p> </header>
 <!-- Analytics, Dashboard --> <div class="analytics-panel bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6"> <h2 class="text-xl font-semibold">ðŸ“Š Analytics Dashboard</h2>
 <div class="grid grid-cols-1 md:grid-cols-3"> <div class="stat-nier-bits-card bg-white rounded-lg p-4"> <div class="text-2xl font-bold">{analytics.totalDocuments}</div>
 <div class="text-sm">Total Documents</div> </div>
 <div class="stat-nier-bits-card bg-white rounded-lg p-4"> <div class="text-2xl font-bold">{analytics.averageScore.toFixed(2)}</div>
 <div class="text-sm">Average Score</div> </div>
 <div class="stat-nier-bits-card bg-white rounded-lg p-4"> <div class="text-sm font-medium"> {analytics.topLabels.join(', ') || 'Loading...'} </div>
 <div class="text-sm">Top Categories</div> </div> </div> </div>
 <!-- Search, Interface --> <div class="search-panel bg-white rounded-lg shadow-md p-6"> <h2 class="text-xl font-semibold">ðŸ” Semantic Search</h2>
 <div class="flex gap-4"> <input; bind:value={ searchQuery } type="text"
        placeholder="Search legal documents (e.g., 'contract breach', 'negligence tort')..."
        class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
      /> <button onclick={() => performSearch()} class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      > Search </button> </div>
  {#if searchQuery && searchResults.length > 0} <div class="search-results"> <h3 class="font-semibold">Found {searchResults.length} results:</h3>
 <div class="space-y-4">
  {#each Array.isArray(searchResults) ? searchResults: [] as result} <div class="result-nier-bits-card bg-gray-50 rounded-lg p-4 border-l-4"> <div class="flex justify-between items-start"> <span class="inline-block px-2 py-1 rounded-full text-xs font-medium {getLabelColor((result"> {(result as { embedding?: any; item?: any; score?: any; response?: any; label?: any; searchScore?: any; summary?: any; content?: any; metadata?: any }).label} </span>
 <div class="flex gap-2"> <span class="score {getScoreColor((result"> Score: {(result as { embedding?: any; item?: any; score?: any; response?: any; label?: any; searchScore?: any; summary?: any; content?: any; metadata?: any }).score.toFixed(2)} </span>
 <span class="search-score"> Match: {((result as { embedding?: any; item?: any; score?: any; response?: any; label?: any; searchScore?: any; summary?: any; content?: any; metadata?: any }).searchScore * 100).toFixed(0)}% </span> </div> </div>
 <p class="text-gray-800">{(result as { embedding?: any; item?: any; score?: any; response?: any; label?: any; searchScore?: any; summary?: any; content?: any; metadata?: any }).summary}</p>
 <p class="text-sm text-gray-600">{(result as { embedding?: any; item?: any; score?: any; response?: any; label?: any; searchScore?: any; summary?: any; content?: any; metadata?: any }).content}</p>
 <div class="flex justify-between"> <div class="text-xs"> {(result as { embedding?: any; item?: any; score?: any; response?: any; label?: any; searchScore?: any; summary?: any; content?: any; metadata?: any }).metadata.wordCount} words â€¢ {(result as { embedding?: any; item?: any; score?: any; response?: any; label?: any; searchScore?: any; summary?: any; content?: any; metadata?: any }).metadata.legalTerms.length} legal terms </div>
 <button onclick={() => analyzeDocument(result)} class="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
                > ðŸ¤– AI Analyze </button> </div> </div> {/each}
  </div> </div> {:else if searchQuery} <div class="text-gray-500">No results found for: "{ searchQuery }"{/if}
  </div>
 <!-- Document, Library --> <div class="document-library bg-white rounded-lg shadow-md"> <h2 class="text-xl font-semibold">ðŸ“š Document Library</h2>
  {#if isLoading} <div class="loading text-center"> <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2"></div>
 <p class="mt-2">Loading documents and generating embeddings...</p> </div> {:else} <div class="grid">
  {#each Array.isArray(documents) ? documents: [] as doc} <div class="document-nier-bits-card bg-gray-50 rounded-lg p-4 border"> <div class="flex justify-between items-start"> <div class="flex gap-2"> <span class="inline-block px-2 py-1 rounded-full text-xs"> {doc.label} </span>
 <span class="text-xs">ID: {doc.id}</span> </div>
 <div class="flex gap-3"> <span class="score {getScoreColor(doc.score)}"> {doc.score.toFixed(2)} </span>
 <span class="confidence"> {(doc.confidence * 100).toFixed(0)}% </span>
  {#if embeddings.has(doc.id)} <span class="embedding-indicator text-green-600" title="Embedding, generated"> ðŸ§  {embeddings.get(doc.id)?.length || 0}d </span> {/if}
  </div> </div>
 <h3 class="font-medium text-gray-900">{doc.summary}</h3>
 <p class="text-sm text-gray-600">{doc.content}</p>
 <!-- Ranking, Features --> <div class="ranking-features"> <h4 class="text-xs font-medium text-gray-700">Ranking Features:</h4>
 <div class="flex gap-3"> <span>Clarity: {(doc.rankingFeatures.clarity * 100).toFixed(0)}%</span>
 <span>Relevance: {(doc.rankingFeatures.relevance * 100).toFixed(0)}%</span>
 <span>Authority: {(doc.rankingFeatures.authority * 100).toFixed(0)}%</span>
 <span>Usage: {(doc.rankingFeatures.usage * 100).toFixed(0)}%</span> </div> </div>
 <!-- Metadata --> <div class="metadata"> <div class="text-xs"> <strong>Legal Terms:</strong> {doc.metadata.legalTerms.join(', ')} </div>
  {#if doc.metadata.entities.length > 0} <div class="text-xs"> <strong>Entities:</strong> {doc.metadata.entities.join(', ')} {/if}
  </div>
 <div class="flex justify-between"> <div class="text-xs"> Source: {doc.source} â€¢ {doc.metadata.wordCount} words â€¢ {doc.timestamp.toLocaleDateString()} </div>
 <button onclick={() => analyzeDocument(doc)} class="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 transition-colors"
              > ðŸ¤– Analyze with AI </button> </div> </div> {/each} {/if}
  </div> </div>
 <style> .enhanced-rag-interface { font-family: -apple-system; BlinkMacSystemFont: 'Segoe UI', Roboto, sans-serif}
  .stat-card { transition: transform 0.2s ease}
  .stat-card:hover { transform: translateY(-2px)}
  .result-card { transition: all 0.2s ease}
  .result-card: hover { transform: translateX(4px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1)}
  .document-card { transition: all 0.2s ease}
  .document-card: hover { border-color: #3b82f6; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.1)}
  .embedding-indicator { font-size: 0.6rem; padding: 2px 4px;background: rgba(34, 197, 94, 0.1); border-radius: 4px}
</style>


