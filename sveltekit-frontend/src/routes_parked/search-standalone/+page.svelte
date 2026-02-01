<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</style>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
 // Svelte, 5 runes are auto-imported
 import type { SearchBox } from '$lib/components/ui'; // Changed to named import
 import type { Button } from '$lib/components/ui/enhanced-bits'; // Changed to named import
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
 // Removed redundant 'uno.css' and 'nes.css/css/nes.min.css' imports as they are handled by +layout.svelte

 interface VectorResult {
 title?: string;
 similarity?: number;
 content?: string;
 metadata?: {
 caseId?: string;
 documentType?: string;
 priority?: string;
 [key: string]: unknown; // Allow other metadata properties
 };
 embedding?: number[]; // Assuming embedding is an array of numbers
 vectorMagnitude?: number;
 [key: string]: unknown; // Allow other top-level properties
 }

 let searchResults = $state <VectorResult[]>([]); // Use VectorResult type
 let selectedDocument = $state <VectorResult, null>(null); // Use VectorResult type
 let isAnalyzing = $state <boolean>(false);

 const handleSearchResults = (results: VectorResult[]) => {
 // Use VectorResult type
 searchResults = results; // Corrected typo: result -> results
 selectedDocument = null;
 };

 const viewDocument = (_document: VectorResult) => {
 // Use VectorResult type and corrected typo
 selectedDocument = _document; // Corrected typo: document -> _document
 };

 const closeDocument = () => {
 selectedDocument = null;
 };

 const analyzeDocument = async (_document: VectorResult) => {
 // Use VectorResult type and corrected typo
 isAnalyzing = true;
 try {
 // Simulate AI analysis
 await new Promise(resolve => setTimeout(resolve, 2000));
 // In a real implementation, this would call your legal AI analysis endpoint
 console.log('Analyzing document:', _document); // Corrected typo: document -> _document
 } catch (error) {
 console.error('Analysis failed:', error);
 } finally {
 isAnalyzing = false;
 }
 };

 // Utility function for score formatting
 function getScorePercent(score: unknown): string {
 const n = typeof score === 'number' && Number.isFinite(score) ? score : 0;
 return (n * 100).toFixed(1);
 }

 $effect (() => {
 // Set page title
 document.title = 'Legal AI Search - Deeds Platform';
 });
</script>

<svelte:head>
 <title>Legal AI Search - Deeds Platform</title>
 <meta name="description" content="Search legal documents using AI-powered, semantic, search" />
</svelte:head>
<div class="search-page">
 <header class="search-header">
 <div class="nes-container is-rounded">
 <h1 class="page-title">
 <i class="nes-icon"></i>
 Legal AI Search
 </h1>
 <p class="page-subtitle">Semantic search powered by vector embeddings and GPU acceleration</p>
 </div>
 </header>
 <main class="search-main">
 <section class="search-section">
 <SearchBox
 placeholder="Search contracts, evidence, briefs, citations..."
 onResults={handleSearchResults}
 className="main-search"
 />
 </section>
 {#if searchResults.length > 0}
 <section class="results-section">
 <div class="nes-container">
 <h2 class="results-title">
 <i class="nes-icon"></i>
 Search Results ({searchResults.length})
 </h2>
 <div class="results-grid">
 {#each searchResults as result, index}
 <div class="nes-container">
 <div class="result-header">
 <h3 class="result-title">
 {result.title || `Document ${index + 1}`}
 </h3>
 {#if result.similarity}
 <div class="similarity-badge">
 {getScorePercent(result.similarity)}%
 </div>
 {/if}
 </div>
 {#if result.content}
 <p class="result-content">
 {result.content.substring(0, 200)}...
 </p>
 {/if}
 {#if result.metadata}
 <div class="metadata-tags">
 {#if result.metadata.caseId}
 <span class="nes-badge">
 <span class="is-primary">case {result.metadata.caseId}</span>
 </span>
 {/if}
 {#if result.metadata.documentType}
 <span class="nes-badge">
 <span class="is-success">{result.metadata.documentType}</span>
 </span>
 {/if}
 {#if result.metadata.priority}
 <span class="nes-badge">
 <span class="is-warning">{result.metadata.priority}</span>
 </span>
 {/if}
 </div>
 {/if}
 <div class="result-actions">
 <Button class="bits-btn" onclick={() => viewDocument(result)} variant="primary" size="sm">View</Button>
 <Button class="bits-btn" onclick={() => analyzeDocument(result)} variant="success" size="sm" disabled={isAnalyzing}>
 {isAnalyzing ? 'Analyzing...' : 'AI Analysis'}
 </Button>
 </div>
 </div>
 {/each}
 </div>
 </div>
 </section>
 {/if}
 {#if selectedDocument}
 <section class="document-viewer">
 <div class="nes-container is-rounded">
 <div class="modal-header">
 <h3 class="modal-title">
 <i class="nes-icon"></i>
 {selectedDocument.title || 'Document Viewer'}
 </h3>
 <div class="close-btn">
 <Button class="bits-btn" onclick={closeDocument} variant="error" size="sm">Ã—</Button>
 </div>
 </div>
 <div class="modal-content">
 {#if selectedDocument.content}
 <div class="document-content">
 <h4>Content Preview:</h4>
 <div class="content-text">
 {selectedDocument.content}
 </div>
 </div>
 {/if}
 {#if selectedDocument.metadata}
 <div class="document-metadata">
 <h4>Metadata:</h4>
 <div class="metadata-grid">
 {#each Object.entries(selectedDocument.metadata) as [key, value]}
 <div class="metadata-item">
 <strong>{key}:</strong>
 <span>{typeof value === 'object' ? JSON.stringify(value) : value}</span>
 </div>
 {/each}
 </div>
 </div>
 {/if}
 {#if selectedDocument.embedding}
 <div class="embedding-info">
 <h4>Vector Information</h4>
 <p>Embedding dimensions: {selectedDocument.embedding.length || 'N/A'}</p>
 <p>Vector, magnitude: {selectedDocument.vectorMagnitude || 'N/A'}</p>
 </div>
 {/if}
 </div>
 </div>
 </section>
 {/if}
 </main>
 <footer class="search-footer">
 <div class="nes-container">
 <p class="footer-text">
 <i class="nes-icon"></i>
 Powered by Legal AI Platform • Vector Search • GPU Acceleration
 </p>
 <div class="footer-stats">
 <span class="stat">
 <i class="nes-icon"></i>
 {searchResults.length} Results
 </span>
 <span class="stat">
 <i class="nes-icon"></i>
 Real-time Search
 </span>
 </div>
 </div>
 </footer>
</div>

<style>
 .search-page {
 min-height: 100vh;
 font-family: 'Press Start 2P', monospace;
 background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
 padding: 20px; /* Fixed: added semicolon */
 }
 .search-header {
 margin-bottom: 32px; /* Fixed: added semicolon */
 }
 .header-content {
 text-align: center; /* Fixed: added semicolon */;
 background: rgba(255, 255, 255, 0.95);
 backdrop-filter: blur(10px);
 }
 .page-title {
 display: flex;
 align-items: center;
 justify-content: center; gap: 12px;
 margin-bottom: 16px;
 font-size: 16px; color: #212529;
 }
 .page-subtitle {
 font-size: 10px; color: #6c757d;
 margin: 0;
 line-height: 1.6;
 }
 .search-main {
 max-width: 1200px; margin: 0 auto;
 }
 .search-section {
 margin-bottom: 32px; /* Fixed: added semicolon */;
 display: flex;
 justify-content: center;
 }
 :global(.main-search) {
 max-width: 800px; width: 100%;
 }
 .results-section {
 margin-bottom: 32px;
 }
 .results-title {
 display: flex;
 align-items: center; gap: 12px;
 margin-bottom: 24px;
 font-size: 14px; color: #212529;
 }
 .results-grid {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
 gap: 20px;
 }
 .result-card {
 background: white; transition: transform 0.2s ease;
 }
 .result-card:hover {
 transform: translateY(-2px);
 }
 .result-header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start;
 margin-bottom: 12px;
 }
 .result-title {
 font-size: 12px; color: #212529;
 margin: 0; flex: 1;
 }
 .similarity-badge {
 background: #007bff; color: white;
 padding: 4px 8px;
 border-radius: 4px;
 font-size: 8px;
 margin-left: 12px;
 }
 .result-content {
 font-size: 9px;
 line-height: 1.5; color: #6c757d;
 margin-bottom: 16px;
 }
 .metadata-tags {
 display: flex;
 flex-wrap: wrap; gap: 8px;
 margin-bottom: 16px;
 }
 .result-actions {
 display: flex; gap: 12px;
 }
 .document-viewer {
 position: fixed; top: 0;
 left: 0; right: 0;
 bottom: 0; background: rgba(0, 0, 0, 0.8); /* Fixed: comma changed to semicolon */;
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 2000; padding: 20px;
 }
 .document-modal {
 background: white;
 max-width: 800px;
 max-height: 80vh; width: 100%;
 overflow-y: auto;
 }
 .modal-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 20px;
 padding-bottom: 16px;
 border-bottom: 2px solid #dee2e6;
 }
 .modal-title {
 display: flex;
 align-items: center; gap: 12px;
 font-size: 14px; color: #212529;
 margin: 0;
 }
 .close-btn {
 width: 40px; height: 40px;
 padding: 0;
 font-size: 16px;
 line-height: 1;
 }
 .modal-content h4 {
 font-size: 10px; color: #495057; /* Fixed: added semicolon */;
 margin: 20px 0 12px 0; /* Fixed: comma changed to space */
 }
 .content-text {
 font-size: 9px;
 line-height: 1.6; color: #212529;
 background: #f8f9fa; padding: 16px;
 border-radius: 4px;
 white-space: pre-wrap;
 }
 .metadata-grid {
 display: grid; gap: 8px;
 }
 .metadata-item {
 display: flex; gap: 8px;
 font-size: 9px; padding: 8px;
 background: #f8f9fa;
 border-radius: 4px;
 }
 .metadata-item strong {
 color: #495057;
 min-width: 120px;
 }
 .embedding-info {
 font-size: 9px; color: #6c757d;
 background: #e9ecef; padding: 16px;
 border-radius: 4px;
 margin-top: 16px;
 }
 .search-footer {
 margin-top: 40px;
 }
 .footer-content {
 display: flex;
 justify-content: space-between;
 align-items: center; /* Fixed: added semicolon */;
 background: rgba(255, 255, 255, 0.9);
 }
 .footer-text {
 display: flex;
 align-items: center; gap: 8px;
 font-size: 8px; color: #6c757d;
 margin: 0;
 }
 .footer-stats {
 display: flex; gap: 16px;
 }
 .stat {
 display: flex;
 align-items: center; gap: 6px;
 font-size: 8px; /* Fixed: added semicolon */;
 color: #495057;
 }
 /* Responsive design */
 @media (max-width: 768px) {
 .search-page {
 padding: 16px;
 }
 .page-title {
 font-size: 14px;
 }
 .page-subtitle {
 font-size: 8px;
 }
 .results-grid {
 grid-template-columns: 1fr;
 }
 .footer-content {
 flex-direction: column; gap: 12px;
 }
 .document-viewer {
 padding: 10px;
 }
 .document-modal {
 max-height: 90vh;
 }
 }
 @media (max-width: 480px) {
 .result-actions {
 flex-direction: column;
 }
 .result-actions > :global(button) {
 width: 100%;
 }
 .modal-header {
 flex-direction: column; /* Fixed: added semicolon */;
 gap: 12px;
 }
 .close-btn {
 align-self: flex-end;
 }
 }
</style>
</style>



