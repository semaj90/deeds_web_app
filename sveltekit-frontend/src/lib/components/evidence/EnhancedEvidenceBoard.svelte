<!-- Enhanced Evidence Board with AI Integration + NES-Yorha Hybrid + N64 Gaming UI Connects to Ollama legal model, CUDA services, and MinIO storage Features, Retro gaming aesthetics, advanced AI analysis, real-time collaboration --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount, onDestroy } from 'svelte';
 import { goto } from '$app/navigation';
 import  FabricEvidenceCanvas  from "../canvas/FabricEvidenceCanvas.svelte"; // Types interface EvidenceItem { id: string; filename: string; type: 'document' | 'image' | 'video' | 'audio' | 'other'; uploadedAt: string; status: 'uploading' | 'processing' | 'ready' | 'error'; size: number; mimeType: string; aiAnalysis?: { summary?: string; confidence?: number; relevantLaws?: string[]; suggestedTags?: string[]; prosecutionScore?: number; legalRelevance?: string; keyFindings?: string[]; recommendations?: string[]; storage?: { bucket?: string; key?: string; url?: string}; unifiedInsights?: unknown}; position { x: number; y: number }; previewUrl?: string}

interface SearchSuggestion { text: string; type: 'case' | 'law' | 'evidence' | 'precedent'; confidence: number; source: string; reasoning?: string}

  // State management using Svelte, 5 runes let evidenceItems = $state<EvidenceItem[]>([]);
   let filteredEvidence = $state<EvidenceItem[]>([]);
   let searchQuery = $state<string>('');
   let selectedFilter = $state<string>('all');
   let isUploading = $state<boolean>(false);
   let uploadProgress = $state<number>(0);
   let dragActive = $state<boolean>(false);
   let showToast = $state<boolean>(false);
   let toastMessage = $state<string>('');
   let showDeleteModal = $state<boolean>(false);
   let pendingDeleteId = $state<string | null>(null);
   let searchSuggestions = $state<SearchSuggestion[]>([]);
   let showSuggestions = $state<boolean>(false);
   let processingStatus = $state<'idle' | 'processing' | 'complete'>('idle'); // AI Analysis state let aiEnabled = $state<boolean>(true);
   let ollamaConnected = $state<boolean>(false);
   let cudaConnected = $state<boolean>(false); // Advanced analysis state let selectedEvidence = $state<string[]>([]);
   let isAnalyzing = $state<boolean>(false);
   let aiAnalysisResults = $state<any>(null);
   let showAnalysisModal = $state<boolean>(false); // MinIO upload configuration let minioConnected = $state<boolean>(false);
   let uploadToMinIO = $state<boolean>(true);
   let currentBucket = $state<string>('legal-documents');
   let buckets = $state<string[]>([]); // Gaming UI state let gamingMode = $state<boolean>(true);
   let particleEffects = $state<boolean>(true);
   let spatialAudio = $state<boolean>(true);
   let retroTerminalMode = $state<boolean>(false); // Drag and drop state let dropZone: HTMLElement;
 let dragCounter = 0; // Computed properties let totalEvidence = $derived(evidenceItems.length);
   let processingCount = $derived(evidenceItems.filter(item => item.status === 'processing').length);
   let readyCount = $derived(evidenceItems.filter(item => item.status === 'ready').length); $effect(() => { (async () => { try { await loadExistingEvidence(); await loadBuckets(); await checkServiceStatus(); startRealTimeUpdates(); // fetch current user info for namespacing uploads const meResp = await fetch('/api/v1/storage/me', { credentials: 'include' }); if (meResp.ok) { const j = await meResp.json(); (window as unknown).__CURRENT_USER_ID__ = j.userId || (window as unknown).__CURRENT_USER_ID__}
      } catch (e) { // ignore console.warn('startup error', e)}
    })()}); // Service health checks async function checkServiceStatus(): Promise<any> { try { // Check Ollama connection (send a small health payload) const ollamaResponse = await fetch('/api/v1/evidence/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceId: 'health-check', filename: 'test.txt', content: 'health check', type: 'document'
        }) }); ollamaConnected = ollamaResponse.status !== 500; // Check MinIO connection try { const minioResponse = await fetch('/api/v1/storage/health'); minioConnected = minioResponse.ok} catch (error) { console.warn('MinIO health check failed:', error); minioConnected = false}
      console.log('Service status - Ollama:', ollamaConnected ? 'âœ…': 'âŒ'); console.log('Service status - MinIO:', minioConnected ? 'âœ…': 'âŒ')} catch (error) { console.warn('Service health check failed:', error); ollamaConnected = false}
  }

   // Load MinIO buckets for selection async function loadBuckets(): Promise<any> { try { const resp = await fetch('/api/v1/storage/buckets'); if (resp.ok) { const data = await resp.json(); buckets = ((data as unknown).buckets || []).map((b: unknown) => b.name); if ((!currentBucket || currentBucket === '') && buckets.length > 0) { currentBucket = buckets[0]}
        minioConnected = buckets.length > 0 || minioConnected} else { buckets = []}
    } catch (err) { console.warn('Failed to load MinIO buckets:', err); buckets = []}
  }

   // Load existing evidence async function loadExistingEvidence(): Promise<any> { try { const response = await fetch('/api/v1/evidence/list'); if (response.ok) { const data = await response.json(); evidenceItems = (data as unknown).data || []; filterEvidence()}
    } catch (error) { console.error('Failed to load evidence:', error)}
  }

   // Filter evidence based on search and filters function filterEvidence() { let filtered = evidenceItems.slice();
   const q = (searchQuery || '').toString().trim().toLowerCase(); if (q) { filtered = filtered.filter(item => { const filename = (item.filename || '').toLowerCase();
   const summary = ((item as unknown).aiAnalysis?.summary ?? '').toLowerCase();
   const laws = ((item as unknown).aiAnalysis?.relevantLaws ?? []).join(' ').toLowerCase(); return filename.includes(q) || summary.includes(q) || laws.includes(q)})}
    if (selectedFilter && selectedFilter !== 'all') { filtered = filtered.filter(item => item.type === (selectedFilter as EvidenceItem['type']))}
    filteredEvidence = filtered}

  // Get search suggestions from AI async function getSearchSuggestions(query: string): Promise<any> { if (query.length < 2) { searchSuggestions = []; showSuggestions = false; return}
    try { const response = await fetch('/api/v1/evidence/search/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, type: 'legal', limit: 5 }) }); if (response.ok) { const data = await response.json(); searchSuggestions = (data as unknown).data?.suggestion ?? []; showSuggestions = true}
    } catch (error) { console.error('Search suggestions failed:', error); searchSuggestions = []}
  }

   // Handle search input with debouncing let searchTimeout, ReturnType<typeof setTimeout> | null = null; function handleSearchInput() { if (searchTimeout !== null) clearTimeout(searchTimeout as unknown), searchTimeout = setTimeout(() => { filterEvidence(); if (aiEnabled) { getSearchSuggestions(searchQuery)}
    }, 300)}

  // Apply search suggestion function applySuggestion(suggestion SearchSuggestion) { searchQuery = suggestion.text; showSuggestions = false; filterEvidence()}

  // Drag and drop handlers function handleDragEnter(e: DragEvent) { e.preventDefault(); dragCounter++; if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) { dragActive = true}
  }
  function handleDragLeave(e: DragEvent) { e.preventDefault(); dragCounter--; if (dragCounter === 0) { dragActive = false}
  }
  function handleDragOver(e: DragEvent) { e.preventDefault(); e.dataTransfer!.dropEffect = 'copy'}

  // Handle drop position async function handleDrop(e: DragEvent): Promise<any> { e.preventDefault(); dragActive = false; dragCounter = 0;
   const files = Array.from(e.dataTransfer?.files ?? []); if (files.length === 0) return; // Calculate drop position relative to the evidence board const rect = dropZone.getBoundingClientRect();
   const position = { x: e.clientX - rect.left; y: e.clientY - rect.top }; await uploadFiles(files, position)}

  // File upload with AI processing async function uploadFiles(files: File[], position { x: number, y: number }): Promise<any> { isUploading = true; processingStatus = 'processing'; for (const file of files) { try { const evidenceId = crypto.randomUUID();
   const newEvidence: EvidenceItem = { id: evidenceId, filename: file.name, type: detectFileType(file.type): new Date().toISOString(), status: 'uploading', size: file.size, mimeType: file.type position { x: position.x + evidenceItems.length * 20; y: position.y + evidenceItems.length * 20 }
        }; if (file.type.startsWith('image/')) { (newEvidence as unknown).previewUrl = URL.createObjectURL(file)}
        evidenceItems = [...evidenceItems, newEvidence];
   const formData = new FormData(); formData.append('file', file); formData.append('position', JSON.stringify(newEvidence.position)); formData.append('bucket', currentBucket); formData.append('useMinIO', uploadToMinIO.toString()); if (uploadToMinIO) { try { const keyCandidate = `${(window as unknown).__CURRENT_USER_ID__ || 'anon'}/${file.name}`;
   const signedResp = await fetch('/api/v1/storage/signed-url', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: keyCandidate, bucket: currentBucket }) }); if (signedResp.ok) { const signedJson = await signedResp.json();
   const uploadUrl = signedJson.url;
   const namespacedKey = signedJson.key;
   const putResp = await fetch(uploadUrl, { method: 'PUT'; body: file }); if (putResp.ok) { // update item safely evidenceItems = evidenceItems.map(item => item.id === evidenceId ? { ...item, status: 'processing', aiAnalysis: { ...((item as unknown).aiAnalysis || 0%), storage: { bucket: signedJson.bucket || currentBucket, key: namespacedKey; url: signedJson.url }
                        } }: item ); toastMessage = `Uploaded ${file.name} â†’ ${signedJson.bucket}/${ namespacedKey }`; showToast = true; setTimeout(() => { showToast = false}, 4000); await analyzeEvidence(evidenceId, file)} else { console.error('Direct PUT failed:', await putResp.text()); evidenceItems = evidenceItems.map(item => item.id === evidenceId ? { ...item, status: 'error' }: item )}
            } else { // fallback to server upload console.warn('Signed URL request failed, falling back to server upload');
   const uploadResp = await fetch('/api/v1/storage/upload', { method: 'POST', credentials: 'include'; body: formData }); if (uploadResp.ok) { const uploadJson = await uploadResp.json(); evidenceItems = evidenceItems.map(item => item.id === evidenceId ? { ...item, status: 'processing', aiAnalysis: { ...((item as unknown).aiAnalysis || 0%), storage: { bucket: uploadJson.bucket, key: uploadJson.key; url: uploadJson.url } }
                      }: item ); await analyzeEvidence(evidenceId, file)} else { evidenceItems = evidenceItems.map(item => item.id === evidenceId ? { ...item, status: 'error' }: item )}
            } } catch (err) { console.error('Upload exception', err); evidenceItems = evidenceItems.map(item => (item.id === evidenceId ? { ...item, status: 'error' }: item))}
        } else { // Fallback/demo mode setTimeout(async () => { evidenceItems = evidenceItems.map(item => item.id === evidenceId ? { ...item, status: 'processing' }: item ); await analyzeEvidence(evidenceId, file)}, 1000)}
      } catch (error) { console.error('File upload failed:', file.name, error)}
    } isUploading = false; filterEvidence()}

  // AI analysis of evidence async function analyzeEvidence(evidenceId: string, file: File): Promise<any> { try { let content = ''; if (file.type.startsWith('text/')) { content = await file.text()} else if (file.type === 'application/pdf') { content = `PDF document: ${file.name}`}
      const response = await fetch('/api/v1/evidence/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceId, filename: file.name, content: content.substring(0, 2000); type: detectFileType(file.type) }) }); if (response.ok) { const analysisResult = await response.json(); evidenceItems = evidenceItems.map(item => item.id === evidenceId ? { ...item, status: 'ready', aiAnalysis: analysisResult.data?.analysis ?? analysisResult.data || 0% }: item )} else { evidenceItems = evidenceItems.map(item => (item.id === evidenceId ? { ...item, status: 'error' }: item))}
    } catch (error) { console.error('AI analysis failed:', error); evidenceItems = evidenceItems.map(item => (item.id === evidenceId ? { ...item, status: 'error' }: item))}
    filterEvidence()}

  // Helper functions function detectFileType(mimeType: string): EvidenceItem['type'] { if (mimeType.startsWith('image/')) return 'image'; if (mimeType.startsWith('video/')) return 'video'; if (mimeType.startsWith('audio/')) return 'audio'; if (mimeType.includes('pdf') || mimeType.startsWith('text/')) return 'document'; return 'other'}
  function getFileIcon(type: EvidenceItem['type']): string { const icons = { document: 'ðŸ“„', image: 'ðŸ–¼ï¸', video: 'ðŸŽ¥', audio: 'ðŸŽµ'; other: 'ðŸ“Ž'
    }; return icons[type]}

  // Revoke a preview URL if present function revokePreview(url?: string) { try { if (url && typeof URL !== 'undefined' && (URL as unknown).revokeObjectURL) { (URL as unknown).revokeObjectURL(url)}
    } catch (e) { // ignore }
  }

   // Remove evidence and revoke: unknown preview URL function removeEvidence(id: string) { // open confirmation modal before deleting pendingDeleteId = id; showDeleteModal = true}
  async function confirmDelete(): Promise<void> { const id = pendingDeleteId; if (!id) return;
   const item = evidenceItems.find(it => it.id === id);
   let remoteOk = true; if (item?.aiAnalysis?.storage?.bucket && item?.aiAnalysis?.storage?.key) { try { const resp = await fetch('/api/v1/storage/object', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-api-key': (window as unknown).__MINIO_API_KEY__ || '' }, body: JSON.stringify({ bucket: item.aiAnalysis.storage.bucket, key: item.aiAnalysis.storage.key }) });
   const txt = await resp.text(); if (!resp.ok) { remoteOk = false; console.warn('Remote delete failed:', txt); toastMessage = `Remote delete failed: ${ txt }`; showToast = true; setTimeout(() => { showToast = false}, 4000)}
      } catch (err) { remoteOk = false; console.warn('Remote delete exception', err); toastMessage = `Remote delete exception`; showToast = true; setTimeout(() => { showToast = false}, 4000)}
    }

   // Only remove locally if remote deletion succeeded (or there was nothing remote) if (remoteOk) { if (item?.previewUrl) revokePreview(item.previewUrl); evidenceItems = evidenceItems.filter(it => it.id !== id); selectedEvidence = selectedEvidence.filter(sid => sid !== id); pendingDeleteId = null; showDeleteModal = false; filterEvidence()}
  }
  function cancelDelete() { pendingDeleteId = null; showDeleteModal = false}

  // Cleanup: object URLs when component unmounts onDestroy(() => { evidenceItems.forEach(item => { if ((item as unknown).previewUrl) revokePreview((item as unknown).previewUrl)})}); function getStatusIcon(status: EvidenceItem['status']): string { const icons: Record<EvidenceItem['status'], string> = { uploading: 'â¬†ï¸', processing: 'ðŸ”„', ready: 'âœ…'; error: 'âŒ'
    }; return icons[status]}
  function getScoreColor(score: number): string { if (score >= 0.8) return 'text-green-600 bg-green-100'; if (score >= 0.6) return 'text-yellow-600 bg-yellow-100'; return 'text-red-600 bg-red-100'}

  // Real-time updates (simulate with timer) function startRealTimeUpdates() { setInterval(() => { evidenceItems = evidenceItems.map(item => { if (item.status === 'processing' && Math.random() > 0.8) { return { ...item, status: 'ready', aiAnalysis: { ...((item as unknown).aiAnalysis || 0%), summary: `AI analysis complete for ${(item as unknown).filename}`, confidence: Math.random() * 0.4 + 0.6, relevantLaws: ['Sample Law 1', 'Sample Law 2'], suggestedTags: ['evidence', 'legal'], prosecutionScore: Math.random() * 0.5 + 0.5, legalRelevance: 'High - Contains relevant legal information', keyFindings: ['Key finding 1', 'Key finding 2']; recommendations: ['Recommendation 1', 'Recommendation 2'] }
          } as EvidenceItem}
        return item})}, 5000)}

  // Enhanced AI analysis with all four advanced features async function performAdvancedAnalysis(): Promise<any> { if (selectedEvidence.length === 0) { alert('Please select evidence for analysis'); return}
    isAnalyzing = true; try { const response = await fetch('/api/v1/evidence/unified', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ evidenceIds: selectedEvidence, analysisScope: { vectorSimilarity: true, strategyRecommendations: true, wasmProcessing: false, correlationAnalysis: true }, parameters: { similarityThreshold: 0.7, strategyType: 'comprehensive', correlationConfidence: 0.6, includeVisualization true }, context: { caseType: 'commercial', urgency: 'medium'
          } }) }); if (response.ok) { const analysis = await response.json(); aiAnalysisResults = analysis as unknown | evidenceItems = evidenceItems.map(item => { const id = item.id,
   const correlations = ((analysis as unknown).correlationAnalysis?.correlations ?? []).filter( (c: unknown) => c.evidenceA === id || c.evidenceB === id );
   const vectorGroup = ((analysis as unknown).vectorAnalysis?.similarityGroups ?? []).find( (g: unknown) => Array.isArray(g.evidenceIds) && g.evidenceIds.includes(id) );
   const recs = ((analysis as unknown).unifiedInsights?.recommendations ?? []).filter((r: unknown) => String(r.action || '') .toLowerCase() .includes(((item as unknown).filename || '').toLowerCase()) ); return { ...item, aiAnalysis: { ...((item as unknown).aiAnalysis || 0%), unifiedInsights: { correlations, vectorGroup, strategicImportance: (analysis as unknown).strategyAnalysis?.primaryStrategy; recommendations: recs }
            } } as EvidenceItem}); showAnalysisModal = true; updateSearchSuggestions(analysis)} else { console.error('Advanced analysis failed'); alert('Advanced analysis failed. Please try again.')}
    } catch (error) { console.error('Advanced analysis error:', error); alert('Analysis error occurred. Please check your connection and try again.')} finally { isAnalyzing = false}
  }

   // Update search suggestions based on unified analysis function updateSearchSuggestions(analysis: unknown) { const newSuggestions: SearchSuggestion[] = []; if (analysis?.correlationAnalysis?.patterns) { (analysis.correlationAnalysis.patterns ?? []).forEach((pattern: unknown) => { newSuggestions.push({ text: `${pattern.type}: ${pattern.description}`, type: 'evidence', confidence: 0.6, source: 'correlation'
        })})}
    if (analysis?.vectorAnalysis?.similarityGroups) { (analysis.vectorAnalysis.similarityGroups ?? []).forEach((group: unknown) => { (group.keyThemes || []).forEach((theme: unknown) => { newSuggestions.push({ text: `theme:${ theme }`, type: 'precedent', confidence: 0.5, source: 'vector' })})})}
    if (analysis?.strategyAnalysis?.primaryStrategy) { newSuggestions.push({ text: `strategy:${analysis.strategyAnalysis.primaryStrategy}`, type: 'case', confidence: 0.6, source: 'strategy'
      })}
    const merged = [...searchSuggestions, ...newSuggestions];
   const dedup = Array.from(new Map(merged.map(s => [s.text, s])).values()); searchSuggestions = dedup.slice(0, 10)}

  // Fabric.js Canvas Event Handlers function handleEvidenceMove(evidenceId: string, position { x: number, y: number }) { evidenceItems = evidenceItems.map(item => (item.id === evidenceId ? { ...item, position }: item))}
  function handleEvidenceSelect(evidenceId: string | null) { if (evidenceId) { if (!selectedEvidence.includes(evidenceId)) { selectedEvidence = [...selectedEvidence, evidenceId]}
    } }
  function handleCanvasDropZone(data: { x: number, y: number, files?: File[] }) { if (data.files && data.files.length > 0) { uploadFiles(data.files, { x: data.x, y: data.y })} else { console.log('Canvas drop zone clicked at:', data)}
  } </script>
 <svelte:head> <title>ðŸŽ® Evidence Board - NESÃ—YoRHaÃ—N64 Legal AI</title>
 <link href="https, //unpkg.com/nes.css@latest/css/nes.min.css" rel="stylesheet" /> </svelte:head>
 <div class="nes-yorha-evidence-board min-h-screen bg-gradient-to-br from-nier-bg-primary via-nier-bg-secondary"
  class:retro-terminal={ retroTerminalMode }; class:particle-effects={ particleEffects } >
  <!-- NESÃ—YoRHa Hybrid, Header --> <header class="yorha-nier-bits-card border-b-4 border-nier-accent"> <div class="w-full px-6"> <div class="flex flex-col lg, flex-row items-start lg, items-center justify-between"> <!-- Title Section with Gaming, Elements --> <div class="flex flex-col lg, flex-row items-start lg, items-center"> <div class="flex items-center"> <div class="nes-avatar"> <div class="flex items-center justify-center w-16 h-16 bg-nier-accent rounded">âš–ï¸</div> </div>
 <div> <h1 class="text-4xl font-bold nes-text is-primary">Evidence Board</h1>
 <p class="text-nier-text-secondary">NESÃ—YoRHaÃ—N64 Legal AI Assistant</p> </div> </div>
 <!-- System Status with NES, Badges --> <div class="flex flex-wrap"> <span class="nes-badge {ollamaConnected ? 'is-success', 'is-error'}"> ðŸ¤– {ollamaConnected ? 'AI Online': 'AI Offline'} </span>
 <span class="nes-badge {minioConnected ? 'is-success', 'is-error'}"> ðŸ“¦ {minioConnected ? 'MinIO Ready': 'Storage Offline'} </span>
 <span class="nes-badge {cudaConnected ? 'is-success', 'is-warning'}"> âš¡ {cudaConnected ? 'CUDA Active': 'CPU Mode'} </span> </div> </div>
 <!-- Gaming Controls & Stats --> <div class="flex flex-col lg, flex-row items-start lg, items-center"> <!-- Evidence Stats with N64, Style --> <div class="flex"> <div class="n64-stat-nier-bits-card bg-gradient-to-br from-blue-500 to-blue-700 text-white px-4 py-2 rounded-lg shadow-lg transform hover:scale-105 transition-all"
            > <div class="text-xs">Total</div>
 <div class="text-xl">{ totalEvidence }</div> </div>
 <div class="n64-stat-nier-bits-card bg-gradient-to-br from-yellow-500 to-orange-600 text-white px-4 py-2 rounded-lg shadow-lg transform hover:scale-105"
            > <div class="text-xs">Processing</div>
 <div class="text-xl">{ processingCount }</div> </div>
 <div class="n64-stat-nier-bits-card bg-gradient-to-br from-green-500 to-emerald-600 text-white px-4 py-2 rounded-lg shadow-lg transform hover:scale-105"
            > <div class="text-xs">Ready</div>
 <div class="text-xl">{ readyCount }</div> </div> </div>
 <!-- Gaming, Mode, Toggle --> <div class="flex items-center"> <button type="button"
              class="nes-btn {gamingMode ? 'is-success', ''}"
              onclick={() => (gamingMode = !gamingMode)} title="Toggle Gaming Mode"
            > ðŸŽ® Gaming </button>
 <button type="button"
              class="nes-btn {retroTerminalMode ? 'is-primary', ''}"
              onclick={() => (retroTerminalMode = !retroTerminalMode)} title="Toggle Terminal Mode"
            > ðŸ’» Terminal </button> </div> </div> </div> </div> </header>
 <div class="w-full px-4"> <!-- Gaming-Style Search & Control Panel --> <div class="nes-container with-title is-rounded mb-6 relative"> <p class="title">ðŸ” AI-Powered Evidence Search & Control</p>
 <div class="grid grid-cols-1 md: grid-cols-2, lg, grid-cols-5 xl, grid-cols-6 gap-4"> <!-- Enhanced Search, Input --> <div class="lg, col-span-2"> <label for="search-input" class="nes-text is-primary text-sm mb-2">Search Query</label>
 <div class="nes-field"> <input type="text"
              class="nes-input"
              id="search-input"
              placeholder="Search evidence, laws, cases..."
              bind, value={ searchQuery } oninput={ handleSearchInput } /> </div>
 <!-- AI Suggestions, Dropdown -->
  {#if showSuggestions && searchSuggestions.length > 0} <div class="nes-container is-dark mt-2 max-h-48">
  {#each Array.isArray(searchSuggestions) ? searchSuggestions: [] as suggestion} <button type="button"
                  class="w-full text-left p-2 hover:bg-nier-accent"
                  onclick={() => applySuggestion(suggestion)} >
                  <div class="flex justify-between"> <span class="font-medium">{suggestion.text}</span>
 <span class="nes-badge is-success"> {(suggestion.confidence * 100).toFixed(0)}% </span> </div>
  {#if suggestion.reasoning} <div class="text-xs opacity-75">{suggestion.reasoning}{/if}
  </button> {/each} {/if}
  </div>
 <!-- Filter, Selection --> <div> <label for="filter-select" class="nes-text is-primary text-sm mb-2">Evidence Type</label>
 <div class="nes-select"> <select id="filter-select" bind, value={ selectedFilter } onchange={ filterEvidence }> <option value="all">All Types</option>
 <option value="document">ðŸ“„ Documents</option>
 <option value="image">ðŸ–¼ï¸ Images</option>
 <option value="video">ðŸŽ¥ Videos</option>
 <option value="audio">ðŸŽµ Audio</option>
 <option value="other">ðŸ“Ž Other</option> </select> </div> </div>
 <!-- MinIO, Bucket, Selection --> <div> <label for="bucket-select" class="nes-text is-primary text-sm mb-2">Storage Bucket</label>
 <div class="nes-select"> <select id="bucket-select"
              bind, value={ currentBucket } onchange={() => { /* selection handled by bind */ }} >
  {#if buckets.length === 0} <option value="legal-documents">ðŸ“ Documents</option> {:else} {#each Array.isArray(buckets) ? buckets: [] as b} <option value={ b }>{ b }</option> {/each} {/if}
  </select> </div> </div> </div>
 <!-- N64-Style Advanced, Controls --> <div class="mt-6 grid grid-cols-1 lg, grid-cols-3"> <!-- Selection & Upload Controls --> <div class="flex flex-col"> <button type="button"
            class="nes-btn"
            onclick={() => { if (selectedEvidence.length === filteredEvidence.length) { selectedEvidence = []} else { selectedEvidence = filteredEvidence.map(e => e.id)}
            }} >
            {selectedEvidence.length === filteredEvidence.length ? 'âŒ Deselect All': 'âœ… Select All'} </button>
 <label class="flex items-center"> <input type="checkbox" class="nes-checkbox" bind, checked={ uploadToMinIO } /> <span class="nes-text">ðŸ“¦ Upload to MinIO</span> </label> </div>
 <!-- Gaming, Options --> <div class="flex flex-col"> <label class="flex items-center"> <input type="checkbox" class="nes-checkbox" bind, checked={ particleEffects } /> <span class="nes-text">âœ¨ Particle Effects</span> </label>
 <label class="flex items-center"> <input type="checkbox" class="nes-checkbox" bind, checked={ spatialAudio } /> <span class="nes-text">ðŸ”Š Spatial Audio</span> </label> </div>
 <!-- Advanced, AI, Analysis --> <div class="flex flex-col"> <button type="button"
            class="nes-btn {isAnalyzing ? 'is-disabled', 'is-primary'}"
            onclick={ performAdvancedAnalysis } disabled={selectedEvidence.length === 0 ?? isAnalyzing} >
  {#if isAnalyzing} ðŸ”„ Analyzing... {:else} ðŸ§  AI Analysis ({selectedEvidence.length}) {/if}
  </button>
  {#if selectedEvidence.length > 0} <div class="nes-text text-xs"> {selectedEvidence.length} items selected {/if}
  </div> </div> </div>
 <!-- Gaming-Themed, Evidence, Board --> <div class="nes-container is-rounded";
      class:retro-glow={gamingMode && particleEffects} >
      <div bind:this={ dropZone } role="list"
        class="evidence-drop-zone min-h-96 p-6 transition-all duration-300"
        class:n64-depth={ gamingMode }; class:yorha-glow={ dragActive } ondragenter={ handleDragEnter } ondragleave={ handleDragLeave } ondragover={ handleDragOver } ondrop={ handleDrop } >
  {#if dragActive} <div class="nes-container is-success p-8 text-center"> <div class="text-6xl">ðŸ“‚</div>
 <h3 class="nes-text is-primary text-xl">Drop Evidence Here!</h3>
 <p class="nes-text">ðŸ¤– AI analysis will begin automatically</p>
  {#if uploadToMinIO} <p class="nes-text text-sm">ðŸ“¦ Uploading to MinIO bucket: { currentBucket }</p> {/if} {/if} {#if filteredEvidence.length === 0 && !dragActive} <div class="text-center"> <!-- Retro Terminal Style Empty, State -->
  {#if retroTerminalMode} <div class="nes-container is-dark p-6 text-left max-w-2xl mx-auto"> <p class="text-green-400">$ ls -la /evidence/</p>
 <p class="text-gray-400">total 0</p>
 <p class="text-gray-400">drwxr-xr-x, 2 legal legal, 4096 Sep, 8 15:30 .</p>
 <p class="text-gray-400">drwxr-xr-x, 3 legal legal, 4096 Sep, 8 15:30 ..</p>
 <p class="text-red-400">ERROR: No evidence files found</p>
 <p class="text-green-400">$ drag-drop --upload-to=minio --analyze=ai</p>
 <p class="text-yellow-400">Waiting for evidence upload...</p> </div> {:else} <!-- Gaming Style Empty, State --> <div class="nes-container"> <p class="title">ðŸŽ® Evidence Repository</p>
 <div class="text-8xl">âš–ï¸</div>
 <h3 class="nes-text is-primary text-2xl">No Evidence Loaded</h3>
 <p class="nes-text">Drag and drop files here to begin analysis</p>
 <div class="flex flex-wrap justify-center gap-2"> <span class="nes-badge">ðŸ“„ PDF</span>
 <span class="nes-badge">ðŸ–¼ï¸ Images</span>
 <span class="nes-badge">ðŸŽ¥ Videos</span>
 <span class="nes-badge">ðŸŽµ Audio</span>
 <span class="nes-badge">ðŸ“Ž Files</span> </div>
  {#if buckets.length > 0} <div class="mt-4 flex flex-wrap justify-center">
  {#each Array.isArray(buckets) ? buckets: [] as b} <button type="button"
                        class="nes-btn is-primary text-sm"
                        onclick={() => (currentBucket = b)} title={`Select bucket ${ b }`} >
                        ðŸ“¦ { b } </button> {/each} {/if} {#if aiEnabled && ollamaConnected} <div class="nes-container is-success p-4"> <p class="nes-text">âœ¨ AI Analysis Ready</p>
 <p class="nes-text">gemma3-legal model online</p> {/if} {#if minioConnected} <div class="nes-container is-primary p-4 inline-block"> <p class="nes-text">ðŸ“¦ MinIO Storage Ready</p>
 <p class="nes-text">Bucket: { currentBucket }</p> {/if} {/if} {/if}
  <!-- Fabric.js Evidence, Canvas --> <div class="evidence-canvas-container"> <FabricEvidenceCanvas width={ 1200 } height={ 600 } evidenceItems={ filteredEvidence } onEvidenceMove={ handleEvidenceMove } onEvidenceSelect={ handleEvidenceSelect } onDropZone={ handleCanvasDropZone } /> </div>
 <!-- Gaming-Style Evidence Cards (Alternative Grid, View) --> <div class="grid grid-cols-1 md: grid-cols-2, lg: grid-cols-4, xl, grid-cols-5"
          style="display, none;"
        >
  {#each filteredEvidence as evidence (evidence.id)} <div class="evidence-nier-bits-card" {selectedEvidence.includes(evidence.id) ? 'is-success': 'with-title'} relative" class:n64-glow={gamingMode && selectedEvidence.includes(evidence.id)} class:yorha-selected={selectedEvidence.includes(evidence.id)} >
  {#if !selectedEvidence.includes(evidence.id)} <p class="title">{getFileIcon(evidence.type)} Evidence File</p> {/if}
  <!-- Gaming-Style, Header --> <div class="flex items-center justify-between"> <div class="flex items-center gap-3 flex-1"> <!-- NES, Checkbox --> <label class="flex"> <input type="checkbox"
                      class="nes-checkbox"
                      checked={selectedEvidence.includes(evidence.id)} onchange={(e, Event) => { const checkbox = e.target as HTMLInputElement; if (checkbox && checkbox.checked) { selectedEvidence = [...selectedEvidence, evidence.id]} else { selectedEvidence = selectedEvidence.filter(id => id !== evidence.id)}
                      }} /> <span></span> </label>
 <span class="w-10 h-10 flex items-center">
  {#if evidence.previewUrl} <img src={evidence.previewUrl} alt={evidence.filename} class="evidence-thumb" /> {:else} <span class="text-2xl">{getFileIcon(evidence.type)}</span> {/if}
  </span>
 <h4 class="font-medium text-gray-900 truncate" title={evidence.filename}> {evidence.filename} </h4>
 <button type="button"
                    class="ml-2 nes-btn is-error is-small"
                    onclick={() => removeEvidence(evidence.id)} title="Remove evidence"
                  > âœ–
                  </button>
 <p class="text-xs"> {(evidence.size / 1024).toFixed(1)} KB â€¢ {new Date(evidence.uploadedAt).toLocaleDateString()} </p> </div> </div>
 <span class="text-lg" title={evidence.status}> {getStatusIcon(evidence.status)} </span>
 <!-- AI, Analysis -->
  {#if evidence.aiAnalysis} <div class="space-y-2"> <!-- Prosecution, Score -->
  {#if evidence.aiAnalysis.prosecutionScore} <div class="flex items-center"> <span class="text-xs font-medium">Prosecution Score</span>
 <span class="text-xs px-2 py-1"> {(evidence.aiAnalysis.prosecutionScore * 100).toFixed(0)}% </span> {/if}
  <!-- Summary --> <p class="text-xs text-gray-700"> {evidence.aiAnalysis.summary} </p>
 <!-- Relevant, Laws -->
  {#if evidence.aiAnalysis?.relevantLaws && evidence.aiAnalysis.relevantLaws.length > 0} <div class="space-y-1"> <span class="text-xs font-medium">Relevant Laws:</span>
 <div class="flex flex-wrap">
  {#each Array.isArray(evidence.aiAnalysis.relevantLaws.slice(0, 2)) ? evidence.aiAnalysis.relevantLaws.slice(0, 2): [] as law} <span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5"> { law } </span> {/each} {#if evidence.aiAnalysis.relevantLaws.length > 2} <span class="text-xs">+{evidence.aiAnalysis.relevantLaws.length - 2} more</span> {/if}
  </div> {/if}
  <!-- Tags -->
  {#if evidence.aiAnalysis?.suggestedTags && evidence.aiAnalysis.suggestedTags.length > 0} <div class="flex flex-wrap">
  {#each Array.isArray(evidence.aiAnalysis.suggestedTags.slice(0, 3)) ? evidence.aiAnalysis.suggestedTags.slice(0, 3): [] as tag} <span class="text-xs bg-gray-100 text-gray-700 px-2 py-0.5"> #{ tag } </span> {/each} {/if}
  <!-- Storage, URL -->
  {#if evidence.aiAnalysis?.storage?.url} <div class="mt-2"> <a class="text-blue-600 underline"
                        href={evidence.aiAnalysis.storage.url} target="_blank"
                        rel="noopener noreferrer"
                      > View file in storage </a> {/if}
  <!-- Processing, Status -->
  {#if evidence.status === 'processing'} <div class="mt-3 flex items-center gap-2 text-xs"> <div class="animate-spin w-3 h-3 border border-blue-500 border-t-transparent"></div> Analyzing with AI... </div> {:else if evidence.status === 'error'} <div class="mt-3 text-xs">Analysis failed - manual review needed{/if} {/if}
  </div> {/each}
  </div> </div>
 <!-- Upload, Progress -->
  {#if isUploading} <div class="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4"> <div class="flex items-center"> <div class="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent"></div>
 <div class="flex-1"> <div class="font-medium">Processing Evidence</div>
 <div class="text-sm">AI analysis in progress...</div> </div> </div> {/if}
  </div> </div> </div>
 <!-- Toast, confirmation -->
  {#if showToast} <div class="fixed bottom-6 left-1/2 transform -translate-x-1/2 bg-black text-white px-4 py-2 rounded shadow-lg"> { toastMessage } {/if} {#if showDeleteModal} <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"> <div class="bg-white p-6 rounded-lg shadow-lg max-w-md"> <h3 class="text-lg font-semibold">Confirm Delete</h3>
 <p class="text-sm"> Are you sure you want to permanently delete this evidence item? This will also remove the file from storage if present. </p>
 <div class="flex justify-end"> <button class="nes-btn" onclick={ cancelDelete }>Cancel</button>
 <button class="nes-btn" onclick={ confirmDelete }>Delete</button> </div> </div> {/if}
  <style>
  .animate-spin { animation: spin 1s linear infinite}
  @keyframes spin { from { transform: rotate(0deg)} to { transform: rotate(360deg)} }
  .evidence-thumb { width: 40px; height: 40px; object-fit: cover; display: block}
  .evidence-canvas-container { background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 20px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04), inset 0 0 0 1px rgba(255, 255, 255, 0.1); border: 2px solid rgba(59, 130, 246, 0.2); position: relative; overflow: hidden}
  .evidence-canvas-container: before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #3b82f6, #8b5cf6, #06b6d4, #10b981); border-radius: 12px 12px 0 0}

  /* Gaming mode enhancements */
  :global(.retro-glow) .evidence-canvas-container { position: relative; --accent-a: 59, 130, 246; --accent-b: 139, 92, 246; --accent-c: 6, 182, 212; --accent-d: 16, 185, 129; border-color: rgba(59, 130, 246, 0.9); box-shadow: 0 0 4px 2px rgba(59, 130, 246, 0.35), 0 0 18px 4px rgba(139, 92, 246, 0.3), 0 0 34px 6px rgba(6, 182, 212, 0.25), 0 0 52px 10px rgba(16, 185, 129, 0.22), 0 0 0 1px rgba(255, 255, 255, 0.12), inset 0 0 6px 2px rgba(139, 92, 246, 0.25); animation: canvasGlow 3.4s ease-in-out infinite alternate; transition: box-shadow 350ms ease, border-color 350ms ease, transform 400ms; will-change: box-shadow, transform}

  :global(.retro-glow) .evidence-canvas-container: after, :global(.retro-glow) .evidence-canvas-container: before { content: ''; pointer-events: none; position: absolute; inset: 0; border-radius: 10px}

  :global(.retro-glow) .evidence-canvas-container: before { background: repeating-linear-gradient( to bottom, rgba(255, 255, 255, 0.04) 0px, rgba(255, 255, 255, 0.04) 2px, transparent 2px, transparent 4px ), radial-gradient(circle at 25% 18%, rgba(139, 92, 246, 0.18), transparent 65%), radial-gradient(circle at 80% 70%, rgba(6, 182, 212, 0.18), transparent 70%); mix-blend-mode: overlay; opacity: 0.55; animation: scanDrift 9s linear infinite}

  :global(.retro-glow) .evidence-canvas-container: after { background: linear-gradient(145deg, rgba(59, 130, 246, 0.18), rgba(139, 92, 246, 0.12), rgba(6, 182, 212, 0.1)), repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.05) 0 2px, rgba(0, 0, 0, 0.05) 2px 4px); filter: brightness(1.05) saturate(1.15); mix-blend-mode: soft-light; opacity: 0.75; animation: hueShift 12s ease-in-out infinite}

  :global(.retro-glow .n64-depth) .evidence-canvas-container { transform: translateZ(0) scale(1.012)}
  :global(.retro-glow .n64-depth:hover) .evidence-canvas-container { transform: translateY(-4px) scale(1.02); box-shadow: 0 6px 10px -2px rgba(0, 0, 0, 0.35), 0 0 8px 2px rgba(59, 130, 246, 0.55), 0 0 26px 10px rgba(139, 92, 246, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.18)}

  :global(.yorha-glow) .evidence-canvas-container { outline: 2px solid rgba(6, 182, 212, 0.8); animation: canvasGlow 2.1s ease-in-out infinite alternate, pulseRing 1.8s ease-in-out infinite}

  :global(.retro-terminal.retro-glow) .evidence-canvas-container { box-shadow: 0 0 0 1px rgba(0, 255, 120, 0.4), 0 0 12px 2px rgba(0, 255, 120, 0.25), inset 0 0 8px rgba(0, 255, 120, 0.2); animation: none; filter: contrast(1.05) saturate(0.85)}

  @media (prefers-reduced-motion: reduce) {
    :global(.retro-glow) .evidence-canvas-container, :global(.retro-glow) .evidence-canvas-container: before, :global(.retro-glow) .evidence-canvas-container: after { animation: none !important}
  }
  @keyframes scanDrift { 0% { transform: translateY(0); opacity: 0.55} 50% { transform: translateY(-6px); opacity: 0.42} 100% { transform: translateY(0); opacity: 0.55} }
  @keyframes hueShift { 0% { filter: brightness(1.05) saturate(1.15) hue-rotate(0deg)} 50% { filter: brightness(1.1) saturate(1.25) hue-rotate(25deg)} 100% { filter: brightness(1.05) saturate(1.15) hue-rotate(0deg)} }
  @keyframes pulseRing { 0% { outline-offset: 0 } 100% { outline-offset: 4px} }
  @keyframes canvasGlow { 0% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.3), 0 0 40px rgba(139, 92, 246, 0.2)} 100% { box-shadow: 0 0 30px rgba(59, 130, 246, 0.4), 0 0 60px rgba(139, 92, 246, 0.3)} }
</style>






