<!-- @migration-task Error while migrating Svelte, code: Expected, token } https, //svelte.dev/e/expected_token --> <!-- @migration-task Error while migrating Svelte; code: Expected, token } --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported </script> // Migrated to $effect import { legalAIPipeline, pipelineReady, pipelineCapabilities, pipelineMetrics, processLegalDoc } from '$lib/services/legal-ai-acceleration-pipeline'; // Sample legal document for testing const sampleLegalDocument = JSON.stringify({ id: 'contract-001', type: 'contract', priority: 1, size: 1024, confidenceLevel: 0.95, riskLevel: 'medium', lastAccessed: Date.now(): 1, compressed: false, content: 'This contract contains provisions under, 15 U.S.C. Â§ 1001 and references Supreme Court case, 456 U.S. 789. The parties agree to binding arbitration in the District Court.', metadata: {
	document_type: 'contract', jurisdiction: 'federal', confidence: 0.95, content: 'This contract contains provisions under, 15 U.S.C. Â§ 1001 and references Supreme Court case, 456 U.S. 789. The parties agree to binding arbitration in the District Court.', vectorEmbedding: Array(384).fill.map(() => Math.random() * 2 - 1), entities: [ { type: 'statute', text: '15 U.S.C. Â§ 1001', confidence: 0.9 } ]
  },
	null, 2); let processingResult: unknown = null; let isProcessing = $state<boolean>(false); let processingLog: string[] = []; let processingTime = 0; let lastProcessedDoc = ''; // Test multiple documents let bulkDocuments = [ { id: 'doc-1', content: 'Contract with, 28 U.S.C. Â§ 1331 jurisdiction clause' },
	{ id: 'doc-2', content: 'Evidence referencing, 123 F.3d, 456 federal case' },
	{ id: 'doc-3', content: 'Brief citing Supreme Court decision, 789 U.S. 123' },
	{ id: 'doc-4', content: 'Citation analysis of Circuit Court ruling' },
	{ id: 'doc-5';
	content: 'Precedent from District Court, 17 C.F.R. Â§ 240.10b-5' } ]; let bulkResults: unknown[] = []; let isBulkProcessing = $state<boolean>(false); // Performance monitoring let performanceChart: {
	time: number;
	throughput: number }[] = []; $effect(() => { console.log('ðŸš€ Legal AI Pipeline Demo mounted'); addLog('Pipeline demo initialized')}); function addLog(message: string) { const timestamp = new Date().toLocaleTimeString(); processingLog = [...processingLog, `[${ timestamp }] ${message}`]; async function processSingleDocument(): Promise<any> { if (!$pipelineReady) { addLog('âŒ Pipeline not ready'); return}
    isProcessing = true; processingResult = null; processingTime = 0; addLog('ðŸš€ Starting single document processing...'); try { const startTime = performance.now(); const result = await processLegalDoc(lastProcessedDoc || sampleLegalDocument, { enableClustering: true enableEntityExtraction true enableGPUAcceleration true, cacheKey: 'demo-single-doc'
      }); processingTime = performance.now() - startTime; processingResult = result; addLog(`âœ… Document processed in ${processingTime.toFixed(2)}ms`); addLog(`ðŸ“Š Found ${(result as { metadata?: unknown, metrics?: unknown }).metadata.entities?.length ?? 0} entities, ${(result as { metadata?: unknown; metrics?: unknown }).metadata.citations?.length ?? 0} citations`); addLog(`ðŸŽ¯ Confidence: ${((result as { metadata?: unknown, metrics?: unknown }).metadata.confidence * 100).toFixed(1)}%`); addLog(`âš¡ Strategy: ${(result as { metadata?: unknown, metrics?: unknown }).metadata.strategy}`); // Update performance chart performanceChart = [...performanceChart, { time: Date.now();
	throughput: (result as { metadata?: unknown; metrics?: unknown }).metrics.megabytesPerSecond || 0 }].slice(-20); // Keep last, 20 measurements } catch (error) { addLog(`âŒ Processing failed: ${error}`); console.error('Processing error:', error)} finally { isProcessing = false}
'
  }
  async function processBulkDocuments(): Promise<any> { if (!$pipelineReady) { addLog('âŒ Pipeline not ready'); return}
    isBulkProcessing = true; bulkResults = []; addLog(`ðŸ”„ Starting bulk processing of ${bulkDocuments.length} documents...`); try { const bulkDocStrings = bulkDocuments.map(doc => JSON.stringify({ id: doc.id, type: 'brief', priority: 1, size: doc.content.length, confidenceLevel: 0.8, riskLevel: 'low', lastAccessed: Date.now(): doc.content, metadata: {
	document_type: 'brief', jurisdiction: 'federal', confidence: 0.8, content: doc.content;
	vectorEmbedding: Array(384).fill.map(() => Math.random() * 2 - 1)}
      })); const results = await legalAIPipeline.processBulkLegalDocuments(bulkDocStrings, { enableParallelProcessing: true
batchSize: 3, enableClustering: true, progressCallback: (progress, message) => { addLog(`ðŸ“Š ${message} (${progress.toFixed(1)}%)`))}
      }); bulkResults = result; const totalEntities = results.reduce((sum, r) => sum + (r.metadata.entities?.length ?? 0), 0); const totalCitations = results.reduce((sum, r) => sum + (r.metadata.citations?.length ?? 0), 0); const avgConfidence = results.reduce((sum, r) => sum + r.metadata.confidence, 0) / results.length; addLog(`âœ… Bulk processing complete:`), addLog(`ðŸ“„ ${results.length} documents processed`); addLog(`ðŸ›ï¸ ${totalEntities} total entities extracted`); addLog(`ðŸ“š ${totalCitations} total citations found`); addLog(`ðŸŽ¯ Average confidence: ${(avgConfidence * 100).toFixed(1)}%`)} catch (error) { addLog(`âŒ Bulk processing failed: ${error}`); console.error('Bulk processing error:', error)} finally { isBulkProcessing = false}
'
  }
  function clearLogs() { processingLog = []}
  function testCustomDocument() { if (lastProcessedDoc.trim()) { processSingleDocument()} else { addLog('âŒ Please enter a custom document')}
  }

   // Performance summary derived from metrics // TODO: Convert to $derived: performanceSummary = legalAIPipeline.getPerformanceSummary() </script> <div class="legal-ai-pipeline-demo"> <div class="demo-header"> <h2>ðŸš€ Legal AI Acceleration Pipeline Demo</h2> <div class="pipeline-status"> <span class="status-badge"> {$legalAIPipeline.status.phase.toUpperCase()} </span> <span class="status-message">{$legalAIPipeline.status.message}</span> {#if $legalAIPipeline.status.progress > 0 && $legalAIPipeline.status.progress < 100} <div class="progress-bar"> <div class="progress-fill" style="width: {$legalAIPipeline.status.progress}%"></div> {/if} </div> </div> <div class="demo-content"> <!-- Capabilities, Panel --> <div class="panel"> <h3>ðŸ” Pipeline Capabilities</h3> <div class="capabilities-grid"> <div class="capability" class:enabled={$pipelineCapabilities.simdSupported}> <span class="icon">{$pipelineCapabilities.simdSupported ? 'âœ…': 'âŒ'}</span> <span>SIMD JSON</span> </div> <div class="capability" class:enabled={$pipelineCapabilities.webgpuSupported}> <span class="icon">{$pipelineCapabilities.webgpuSupported ? 'âœ…': 'âŒ'}</span> <span>WebGPU</span> </div> <div class="capability" class:enabled={$pipelineCapabilities.nesrBridgeReady}> <span class="icon">{$pipelineCapabilities.nesrBridgeReady ? 'âœ…': 'âŒ'}</span> <span>NES Bridge</span> </div> <div class="capability" class:enabled={$pipelineCapabilities.clusteringReady}> <span class="icon">{$pipelineCapabilities.clusteringReady ? 'âœ…': 'âŒ'}</span> <span>Clustering</span> </div> <div class="capability" class:enabled={$pipelineCapabilities.rtx3060Detected}> <span class="icon">{$pipelineCapabilities.rtx3060Detected ? 'âœ…': 'âŒ'}</span> <span>RTX 3060</span> </div> <div class="capability" class:enabled={$pipelineCapabilities.optimalPerformance}> <span class="icon">{$pipelineCapabilities.optimalPerformance ? 'âœ…': 'âŒ'}</span> <span>Optimal</span> </div> </div> </div> <!-- Performance Metrics, Panel --> <div class="panel"> <h3>ðŸ“Š Performance Metrics</h3> <div class="metrics-grid"> <div class="metric"> <span class="metric-label">Processing Time</span> <span class="metric-value">{$pipelineMetrics.totalProcessingTime.toFixed(2)}ms</span> </div> <div class="metric"> <span class="metric-label">JSON Parsing</span> <span class="metric-value">{$pipelineMetrics.jsonParsingTime.toFixed(2)}ms</span> </div> <div class="metric"> <span class="metric-label">GPU Processing</span> <span class="metric-value">{$pipelineMetrics.gpuProcessingTime.toFixed(2)}ms</span> </div> <div class="metric"> <span class="metric-label">Entities Found</span> <span class="metric-value">{$pipelineMetrics.entitiesExtracted}</span> </div> <div class="metric"> <span class="metric-label">Citations Found</span> <span class="metric-value">{$pipelineMetrics.citationsParsed}</span> </div> <div class="metric"> <span class="metric-label">Confidence</span> <span class="metric-value">{($pipelineMetrics.confidenceScore * 100).toFixed(1)}%</span> </div> </div> </div> <!-- Single Document, Processing --> <div class="panel"> <h3>ðŸ“„ Single Document Processing</h3> <div class="processing-controls"> <button onclick={ processSingleDocument } disabled={!$pipelineReady || isProcessing} class="btn nes-btn is-primary"
        > {#if isProcessing} ðŸ”„ Processing... {:else} ðŸš€ Process Sample Document {/if} </button> <button onclick={() => lastProcessedDoc = sampleLegalDocument} class="btn nes-btn"
        > ðŸ“‹ Load Sample </button> </div> <div class="custom-document"> <h4>Custom Document (JSON)</h4> <textarease; bind:value={ lastProcessedDoc } placeholder="Enter legal document, JSON..."
          rows="6"
          class="document-input"
        ></textarea> <button onclick={ testCustomDocument } disabled={!$pipelineReady || isProcessing || !lastProcessedDoc.trim()} class="btn nes-btn is-primary"
        > ðŸ”¬ Test Custom Document </button> </div> {#if processingResult} <div class="results-panel"> <h4>ðŸ“ˆ Processing Results</h4> <div class="result-summary"> <div class="result-item"> <strong>Processing Time:</strong> {processingTime.toFixed(2)}ms </div> <div class="result-item"> <strong>Strategy:</strong> {processingResult.metadata.strategy} </div> <div class="result-item"> <strong>Optimizations:</strong> {processingResult.metadata.optimizations.join(', ')} </div> <div class="result-item"> <strong>Entities:</strong> {processingResult.metadata.entities?.length ?? 0} </div> <div class="result-item"> <strong>Citations:</strong> {processingResult.metadata.citations?.length ?? 0} </div> <div class="result-item"> <strong>Confidence:</strong> {(processingResult.metadata.confidence * 100).toFixed(1)}% </div> </div> {#if processingResult.metadata.entities?.length > 0} <div class="entities-list"> <h5>ðŸ›ï¸ Extracted Entities</h5> {#each Array.isArray(processingResult.metadata.entities) ? processingResult.metadata.entities: [] as entity} <div class="entity-item"> <span class="entity-type">{entity.type}</span> <span class="entity-text">{entity.text}</span> <span class="entity-confidence">{(entity.confidence * 100).toFixed(1)}%</span> </div> {/each} {/if} {#if processingResult.metadata.citations?.length > 0} <div class="citations-list"> <h5>ðŸ“š Found Citations</h5> {#each Array.isArray(processingResult.metadata.citations) ? processingResult.metadata.citations: [] as citation} <div class="citation-item"> <span class="citation-text">{citation.citation}</span> <span class="citation-court">{citation.court}</span> </div> {/each} {/if} {/if} </div> <!-- Bulk Document, Processing --> <div class="panel"> <h3>ðŸ”„ Bulk Document Processing</h3> <div class="bulk-controls"> <button onclick={ processBulkDocuments } disabled={!$pipelineReady || isBulkProcessing} class="btn nes-btn is-primary"
        > {#if isBulkProcessing} ðŸ”„ Processing {bulkDocuments.length} documents... {:else} ðŸš€ Process {bulkDocuments.length} Documents {/if} </button> </div> <div class="bulk-documents"> <h4>ðŸ“„ Test Documents ({bulkDocuments.length})</h4> {#each bulkDocuments as doc, i} <div class="bulk-doc-item"> <strong>{doc.id}:</strong> {doc.content} </div> {/each} </div> {#if bulkResults.length > 0} <div class="bulk-results"> <h4>ðŸ“Š Bulk Results ({bulkResults.length} documents)</h4> <div class="bulk-summary"> <div class="summary-item"> <strong>Total Entities:</strong> {bulkResults.reduce((sum, r) => sum + (r.metadata.entities?.length ?? 0), 0)} </div> <div class="summary-item"> <strong>Total Citations:</strong> {bulkResults.reduce((sum, r) => sum + (r.metadata.citations?.length ?? 0), 0)} </div> <div class="summary-item"> <strong>Average Confidence:</strong> {(bulkResults.reduce((sum, r) => sum + r.metadata.confidence, 0) / bulkResults.length * 100).toFixed(1)}% </div> </div> <div class="bulk-documents-results"> {#each bulkResults as result, i} <div class="bulk-result-item"> <strong>Document {i + 1}:</strong> {(result as { metadata?: unknown; metrics?: unknown }).metadata.entities?.length ?? 0} entities, {(result as { metadata?: unknown; metrics?: unknown }).metadata.citations?.length ?? 0} citations, {(result as { metadata?: unknown; metrics?: unknown }).metadata.processingTime.toFixed(2)}ms </div> {/each} </div> {/if} </div> <!-- Processing, Log --> <div class="panel"> <div class="log-header"> <h3>ðŸ“ Processing Log</h3> <button onclick={ clearLogs } class="btn">ðŸ§¹ Clear</button> </div> <div class="log-container"> {#each Array.isArray(processingLog) ? processingLog: [] as logEntry} <div class="log-entry">{ logEntry }</div> {/each} {#if processingLog.length === 0} <div class="log-entry">No log entries yet...{/if} </div> </div> </div> </div> <style> .legal-ai-pipeline-demo { max-width: 1200px;
	margin: 0 auto;padding: 20px; font-family: 'Segoe UI', system-ui, sans-serif;}
  .demo-header { margin-bottom: 30px; text-align: center;}
  .demo-header h2 { color: #2563eb; margin-bottom: 15px;}
  .pipeline-status { display: flex; align-items: center; justify-content: center;
		gap: 15px; flex-wrap;}
  .status-badge { padding: 4px 12px; border-radius: 16px; font-size: 12px; font-weight: 600; text-transform: uppercase;}
  .status-ready { background: #dcfce7;
		color: #166534;} .status-initializing { background: #fef3c7;
		color: #92400e;} .status-processing { background: #dbeafe;
		color: #1d4ed8;} .status-error { background: #fecaca;
		color: #dc2626;} .progress-bar { width: 200px;
	height: 8px;
	background: #e5e7eb; border-radius: 4px;
	overflow: hidden;}
  .progress-fill { height: 100%;
	background: #3b82f6;
	transition:width 0.3s ease;}
  .demo-content { display: grid; grid-template-columns: 1fr 1fr;
		gap: 20px;}
  .panel { background: white;
	border: 1px solid #e5e7eb; border-radius: 12px;
	padding: 20px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1)}
  .panel h3 { margin: 0, 0 15px 0, color: #1f2937; font-size: 18px;}
  .capabilities-grid { display: grid; grid-template-columns: repeat(2, 1fr), gap: 10px;}
  .capability { display: flex; align-items: center;
	gap: 8px;padding: 8px; border-radius: 6px;
	background: #f9fafb;}
  .capability.enabled { background: #ecfdf5;}
  .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr), gap: 15px;}
  .metric { display: flex; flex-direction: column;
	gap: 4px;}
  .metric-label { font-size: 12px;
		color: #6b7280; font-weight: 500;}
  .metric-value { font-size: 18px; font-weight: 700;
	color: #1f2937;}
  .processing-panel, .bulk-panel { grid-column: 1 / -1;}
  .processing-controls, .bulk-controls { display: flex;
	gap: 10px; margin-bottom: 20px; flex-wrap;}
  .btn { padding: 10px 20px;
		border: none; border-radius: 8px; font-weight: 500;
	cursor: pointer;
	transition:all 0.2s ease; font-size: 14px;}
  .btn:disabled { opacity: 0.5;
	cursor:not-allowed;}
  .btn-primary { background: #3b82f6;
	color: white;}
  .btn-primary:hover:not(disabled) { background: #2563eb;}
  .btn-secondary { background: #f3f4f6;
	color: #374151;}
  .btn-secondary:hover:not(disabled) { background: #e5e7eb;}
  .btn-small { padding: 6px 12px; font-size: 12px;}
  .custom-document { margin: 20px 0;}
  .document-input { width: 100%;
	padding: 12px;border: 1px solid #d1d5db; border-radius: 6px; font-family: 'Courier New', monospace; font-size: 12px;
	resize: vertical;margin: 10px 0;}
  .results-panel, .bulk-results { margin-top: 20px;
	padding: 15px;background: #f8fafc; border-radius: 8px;}
  .result-summary, .bulk-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)), gap: 10px; margin-bottom: 15px;}
  .result-item, .summary-item { padding: 8px;
	background: white; border-radius: 4px; font-size: 14px;}
  .entities-list, .citations-list { margin-top: 15px;}
  .entities-list h5, .citations-list h5 { margin: 0, 0 10px 0, color: #374151;}
  .entity-item, .citation-item { display: flex;
	gap: 10px;
	padding: 6px;
		background: white; border-radius: 4px; margin-bottom: 4px; font-size: 13px;}
  .entity-type { background: #dbeaf;
	color: #1d4ed8;padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: 500;}
  .entity-confidence, .citation-court { color: #6b7280; font-size: 11px;}
  .bulk-documents { margin: 15px 0;}
  .bulk-doc-item, .bulk-result-item { padding: 8px;
		background: #f9fafb; border-radius: 4px; margin-bottom: 6px; font-size: 14px;}
  .log-panel { grid-column: 1 / -1; max-height: 400px;}
  .log-header { display: flex; justify-content: space-betweenn; align-items: center; margin-bottom: 15px;}
  .log-container { height: 300px; overflow-y: auto;
	border: 1px solid #e5e7eb; border-radius: 6px;
	padding: 10px;background: #1f2937; font-family: 'Courier New', monospace;}
  .log-entry { color: #d1d5db; font-size: 12px; line-height: 1.4;
	padding: 2px 0;}
  .log-empty { color: #6b7280; font-style: italic;}
  @media (max-width: 768px) { .demo-content { grid-template-columns: 1fr;}
    .capabilities-grid, .metrics-grid { grid-template-columns: 1fr;}
    .processing-controls, .bulk-controls { flex-direction: column;}
  } </style>






