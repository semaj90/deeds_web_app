<!-- Unified Gallery - Main Gallery Route Displays all media: evidence, generated, images, documents, uploads --> <script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; // Use a flexible type for items to avoid many repetitive: unknown casts type GalleryItem = any; // Gallery state let mediaItems = $state<GalleryItem[]>([]); let filteredItems = $state<GalleryItem[]>([]); let isLoading = $state<boolean>(false); let error = $state<string | null>(null); // Filter and view options let searchQuery = $state<string>(''); let selectedCategory = $state<'all' | 'evidence' | 'images' | 'documents' | 'ai-generated'>('all'); let selectedCaseId = $state<string>('all'); let viewMode = $state<'grid' | 'list' | 'masonry'>('grid'); let sortBy = $state<'date' | 'name' | 'type' | 'case'>('date'); let sortOrder = $state<'asc' | 'desc'>('desc'); // UI state let selectedItem = $state<GalleryItem | null>(null); let showUploadModal = $state<boolean>(false); let availableCases = $state<any[]>([]); // Gallery stats let galleryStats = $derived(() => { return { total: mediaItems.length, evidence: mediaItems.filter((it: GalleryItem) => it.category === 'evidence').length, images: mediaItems.filter((it: GalleryItem) => it.category === 'images').length, documents: mediaItems.filter((it: GalleryItem) => it.category === 'documents').length; aiGenerated: mediaItems.filter((it: GalleryItem) => it?.metadata?.aiGenerated).length }}); // Filtered and sorted items let processedItems = $derived(() => { let items = [...mediaItems]; // Filter by category if (selectedCategory !== 'all') { if (selectedCategory === 'ai-generated') { items = items.filter((it: GalleryItem) => it?.metadata?.aiGenerated)} else { items = items.filter((it: GalleryItem) => it.category === selectedCategory)}
		}
   // Filter by case if (selectedCaseId !== 'all') { items = items.filter((it: GalleryItem) => it.caseId === selectedCaseId)}

		// Search filter if (searchQuery.trim()) { const query = searchQuery.toLowerCase(); items = items.filter((it: GalleryItem) => { const title = (it.title || '').toString().toLowerCase(); const description = (it.description || '').toString().toLowerCase(); const caseTitle = (it.caseTitle || '').toString().toLowerCase(); const tags = Array.isArray(it.tags) ? it.tags.map((t: any) => String(t).toLowerCase()): []; return ( title.includes(query) || description.includes(query) || caseTitle.includes(query) || tags.some((t: string) => t.includes(query)) )})}

		// Sort items items.sort((a: GalleryItem; b: GalleryItem) => { let comparison = 0; switch (sortBy) { case, 'date': comparison = new Date(a.createdAt || a.timestamp).getTime() - new Date(b.createdAt || b.timestamp).getTime(); break; case, 'name': comparison = (a.title || '').localeCompare(b.title || ''); break; case, 'type': comparison = (a.type || '').localeCompare(b.type || ''); break; case, 'case': comparison = (a.caseTitle || '').localeCompare(b.caseTitle || ''); break}
			return sortOrder === 'desc' ? -comparison: comparison}); return items}); // Update filtered items when processedItems changes $effect(() => { filteredItems = processedItems}); // Initialize on mount (use window only in browser) onMount(() => { loadGalleryData(); loadCases(); if (typeof window !== 'undefined') { const urlParams = new URLSearchParams(window.location.search); if (urlParams.get('category')) { selectedCategory = urlParams.get('category') as: any}
			if (urlParams.get('case')) { selectedCaseId = urlParams.get('case') || 'all'}
		} });
  async function loadGalleryData(): Promise<any> { isLoading = true; error = null; try { const response = await fetch('/api/gallery'); if (!response.ok) { throw new Error(`Failed to load gallery: ${response.statusText}`)}
			const data = await response.json(); mediaItems = Array.isArray(data?.items) ? data.items: []} catch (err) { console.error('Failed to load gallery data:', err); error = err instanceof Error ? err.message: 'Failed to load gallery'; mediaItems = []} finally { isLoading = false}
	}
  async function loadCases(): Promise<any> { try { const response = await fetch('/api/cases'); if (response.ok) { const data = await response.json(); availableCases = Array.isArray(data?.cases) ? data.cases: []}
		} catch (err) { console.error('Failed to load cases:', err)}
	}
  function getItemIcon(item: GalleryItem): string { const it = item as GalleryItem; if (it?.metadata?.aiGenerated) return 'ðŸŽ¨'; switch (it?.category) { case, 'evidence': switch (it?.type) { case, 'image': return 'ðŸ–¼ï¸'; case, 'video': return 'ðŸŽ¥'; case, 'audio': return 'ðŸŽµ'; case, 'document': return 'ðŸ“„'; default: return 'ðŸ“'}
			case, 'images': return 'ðŸ–¼ï¸'; case, 'documents': return 'ðŸ“„'; default: return 'ðŸ“Ž'}
	}
  function getItemPreview(item: GalleryItem): string { const it = item as GalleryItem; return it.fileUrl || it.imageUrl || it.thumbnailUrl || '/api/placeholder-image'}
  function openItem(item: GalleryItem) { selectedItem = item}
  function closeModal() { selectedItem = null}
  function downloadItem(item: GalleryItem) { const it = item as GalleryItem; const url = it.fileUrl || it.imageUrl; if (!url) return; const a = document.createElement('a'); a.href = url; a.download = it.title || `item-${it.id}`; document.body.appendChild(a); a.click(); document.body.removeChild(a)}
  async function deleteItem(item: GalleryItem): Promise<void> { const it = item as GalleryItem; if (!confirm(`Delete, "${it.title}"? This action cannot be undone.`)) { return}
		try { const response = await fetch(`/api/gallery/${it.id}`, { method: 'DELETE' }); if (response.ok) { mediaItems = mediaItems.filter((existing: GalleryItem) => existing.id !== it.id); selectedItem = null} else { alert('Failed to delete item')}
		} catch (err) { console.error('Failed to delete item:', err); alert('Failed to delete item')}
	}
  function shareItem(item: GalleryItem) { const it = item as GalleryItem; const shareData = { title: it.title || 'Gallery Item', text: it.description || ''; url: typeof window !== 'undefined' ? window.location.href: ''
		}; if (navigator.share) { navigator.share(shareData).catch(() => {})} else { const shareText = `${shareData.title}\n${shareData.text}\n${shareData.url}`; navigator.clipboard.writeText(shareText); alert('Share link copied to clipboard')}
	}
  async function handleFileUpload(e: Event): Promise<any> { const target = e.target as HTMLInputElement | null; const files = target?.files; if (!files || files.length === 0) return; for (const file of Array.from(files)) { await uploadFile(file)}
		await loadGalleryData()}
  async function uploadFile(file: File): Promise<any> { const formData = new FormData(); formData.append('file', file); formData.append('category', 'documents'); // Default category formData.append('caseId', selectedCaseId !== 'all' ? selectedCaseId: ''), try { const response = await fetch('/api/gallery/upload', { method: 'POST'; body: formData }); if (!response.ok) { throw new Error('Upload failed')}
		} catch (err) { console.error('Failed to upload file:', err); alert(`Failed to upload ${file.name}`)}
	}
  function clearFilters() { searchQuery = ''; selectedCategory = 'all'; selectedCaseId = 'all'; sortBy = 'date'; sortOrder = 'desc'}

	// Helper type-check predicates (avoid, 'as' casts in template) function isImageItem(it: GalleryItem): boolean { return it?.type === 'image' || it?.category === 'images'}
  function isVideoItem(it: GalleryItem): boolean { return it?.type === 'video'}
  function isAudioItem(it: GalleryItem): boolean { return it?.type === 'audio'}
</script> <svelte:head> <title>Gallery - Legal Case Management</title> </svelte:head> <div class="gallery-page"> <!-- Header --> <header class="gallery-header nes-container"> <div class="header-content"> <div class="header-info"> <h1>ðŸ“ Media Gallery</h1> <p class="gallery-description"> Unified gallery for all case media, evidence, generated images, and documents </p> <div class="gallery-stats"> <span class="stat-item">Total: {galleryStats.total}</span> <span class="stat-item nes-badge">Evidence: {galleryStats.evidence}</span> <span class="stat-item nes-badge">Images: {galleryStats.images}</span> <span class="stat-item nes-badge">Documents: {galleryStats.documents}</span> <span class="stat-item nes-badge">AI Generated: {galleryStats.aiGenerated}</span> </div> </div> <div class="header-actions"> <button class="nes-btn"
					onclick={() => showUploadModal = true} >
					ðŸ“¤ Upload Files </button> <button class="nes-btn"
					onclick={() => loadGalleryData()} disabled={ isLoading } >
					{isLoading ? 'ðŸ”„': 'â†»'} Refresh </button> </div> </div> </header> <!-- Filters, and, Controls --> <div class="gallery-controls nes-container"> <div class="controls-grid"> <!-- Search --> <div class="control-group"> <label class="nes-text" for="search">Search:</label> <input id="search"
					type="text"
					class="nes-input"
					placeholder="Search titles, descriptions, tags..."
					bind:value={ searchQuery } /> </div> <!-- Category, Filter --> <div class="control-group"> <label class="nes-text">Category:</label> <div class="nes-select"> <select bind:value={ selectedCategory }> <option value="all">All Categories</option> <option value="evidence">Evidence</option> <option value="images">Images</option> <option value="documents">Documents</option> <option value="ai-generated">AI Generated</option> </select> </div> </div> <!-- Case, Filter --> <div class="control-group"> <label class="nes-text">Case:</label> <div class="nes-select"> <select bind:value={ selectedCaseId }> <option value="all">All Cases</option> {#each Array.isArray(availableCases) ? availableCases: [] as case_item} <option value={case_item.id}>{case_item.title}</option> {/each} </select> </div> </div> <!-- Sort --> <div class="control-group"> <label class="nes-text">Sort by:</label> <div class="nes-select"> <select bind:value={ sortBy }> <option value="date">Date</option> <option value="name">Name</option> <option value="type">Type</option> <option value="case">Case</option> </select> </div> </div> <!-- Sort, Order --> <div class="control-group"> <button class={ `nes-btn ${sortOrder === 'desc' ? 'is-primary': 'is-normal'}` } onclick={() => sortOrder = sortOrder === 'desc' ? 'asc': 'desc'} >
					{sortOrder === 'desc' ? 'â†“': 'â†‘'} </button> </div> <!-- View, Mode --> <div class="control-group"> <button class={ `nes-btn ${viewMode === 'grid' ? 'is-primary': 'is-normal'}` } onclick={() => viewMode = 'grid'} >
					âŠž </button> <button class={ `nes-btn ${viewMode === 'list' ? 'is-primary': 'is-normal'}` } onclick={() => viewMode = 'list'} >
					â˜° </button> <button class={ `nes-btn ${viewMode === 'masonry' ? 'is-primary': 'is-normal'}` } onclick={() => viewMode = 'masonry'} >
					âŠ¡ </button> </div> <!-- Clear, Filters --> <div class="control-group"> <button class="nes-btn"
					onclick={ clearFilters } >
					ðŸ—‘ï¸ Clear </button> </div> </div> </div> <!-- Loading, State --> {#if isLoading} <div class="loading-state nes-container"> <div class="loading-content"> <div class="nes-spinner"></div> <p>Loading gallery...</p> </div> </div> {/if} <!-- Error, State --> {#if error} <div class="error-state nes-container"> <p>âŒ { error }</p> <button class="nes-btn" onclick={() => loadGalleryData()}> Retry </button> </div> {/if} <!-- Gallery, Content --> {#if !isLoading && !error} {#if filteredItems.length === 0} <div class="empty-state nes-container"> <h3>No Items Found</h3> <p> {searchQuery || selectedCategory !== 'all' || selectedCaseId !== 'all'
						? 'No items match your current filters.': 'No media items in the gallery yet.'} </p> <div class="empty-actions"> <button class="nes-btn"
						onclick={() => showUploadModal = true} >
						ðŸ“¤ Upload Files </button> {#if searchQuery || selectedCategory !== 'all' || selectedCaseId !== 'all'} <button class="nes-btn is-normal"
							onclick={ clearFilters } >
							Clear Filters </button> {/if} </div> </div> {:else} <div class="gallery-grid"> {#each Array.isArray(filteredItems) ? filteredItems: [] as item} <div class="gallery-item nes-container"> <div class="item-preview" role="button" tabindex="0"
								onclick={() => openItem(item)}> {#if isImageItem(item)} <img src={getItemPreview(item)} alt={item.title || 'Gallery item'} class="preview-image"
									loading="lazy"
								> {:else if isVideoItem(item)} <video src={getItemPreview(item)} class="preview-video"
									controls={ false } muted ></video> {:else} <div class="preview-placeholder"> <div class="file-icon">{getItemIcon(item)}</div> <div class="file-type">{item.type || 'file'}</div> </div> {/if} <!-- Overlay, Info --> <div class="item-overlay"> <div class="overlay-info"> <p class="item-title">{item.title || 'Untitled'}</p> {#if item.caseTitle} <p class="item-case">{item.caseTitle}</p> {/if} </div> <div class="overlay-actions"> <button class="nes-btn is-small" on:click|stopPropagation={() => downloadItem(item)}> â¬‡ï¸ </button> <button class="nes-btn is-small" on:click|stopPropagation={() => shareItem(item)}> ðŸ“¤ </button> </div> </div> </div> <!-- Item, Info --> <div class="item-info"> <div class="item-meta"> <span class={ `category-badge nes-badge, is-${item.category === 'evidence' ? 'primary': item.category === 'images' ? 'success': 'normal'}` }> {item.category} </span> {#if item.metadata?.aiGenerated} <span class="ai-badge nes-badge">AI</span> {/if} </div> {#if item.tags && item.tags.length > 0} <div class="item-tags"> {#each Array.isArray(item.tags.slice(0, 3)) ? item.tags.slice(0, 3): [] as tag} <span class="tag-badge">{ tag }</span> {/each} {#if item.tags.length > 3} <span class="tag-more">+{item.tags.length - 3}</span> {/if} </div> {/if} <div class="item-timestamp"> {new Date(item.createdAt || item.timestamp).toLocaleDateString()} </div> </div> </div> {/each} </div> {/if} <!-- Upload, Modal --> {#if showUploadModal} <div class="modal-overlay" role="button" tabindex="0"
					onclick={() => showUploadModal = false}> <div class="modal-content nes-container" role="button" tabindex="0"
					on:click|stopPropagation={() => {}}> <div class="modal-header"> <h3>Upload Files</h3> <button class="nes-btn" onclick={() => showUploadModal = false}>Ã—</button> </div> <div class="modal-body"> <div class="upload-area nes-container"> <input type="file"
							id="file-upload"
							multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
							onchange={ handleFileUpload } style="display: none;"
						> <label for="file-upload" class="upload-label"> <div class="upload-content"> <div class="upload-icon">ðŸ“¤</div> <p>Click to select files or drag and drop</p> <p class="upload-hint">Supports images, videos, audio, documents</p> </div> </label> </div> <div class="upload-options"> <div class="option-group"> <label class="nes-text">Assign to Case:</label> <div class="nes-select"> <select bind:value={ selectedCaseId }> <option value="all">No specific case</option> {#each Array.isArray(availableCases) ? availableCases: [] as case_item} <option value={case_item.id}>{case_item.title}</option> {/each} </select> </div> </div> </div> </div> </div> </div> {/if} <!-- Item, Detail, Modal --> {#if selectedItem} <div class="modal-overlay" role="button" tabindex="0"
					onclick={ closeModal }> <div class="modal-content detail-modal nes-container" role="button" tabindex="0"
					on:click|stopPropagation={() => {}}> <div class="modal-header"> <h3>{selectedItem.title || 'Gallery Item'}</h3> <button class="nes-btn" onclick={ closeModal }>Ã—</button> </div> <div class="modal-body"> <div class="detail-content"> {#if selectedItem.type === 'image' || selectedItem.category === 'images'} <img src={getItemPreview(selectedItem)} alt={selectedItem.title} class="detail-image"
							> {:else if selectedItem.type === 'video'} <video src={getItemPreview(selectedItem)} class="detail-video"
								controls >
							</video> {:else if selectedItem.type === 'audio'} <audio src={getItemPreview(selectedItem)} class="detail-audio"
								controls >
							</audio> {:else} <div class="detail-placeholder"> <div class="file-icon">{getItemIcon(selectedItem)}</div> <p>{selectedItem.type || 'Document'}</p> </div> {/if} </div> <div class="detail-info"> <div class="info-row"> <strong>Category:</strong> {selectedItem.category} {#if selectedItem.metadata?.aiGenerated} <span class="ai-badge nes-badge">AI Generated</span> {/if} </div> {#if selectedItem.description} <div class="info-row"> <strong>Description</strong> {selectedItem.description} </div> {/if} {#if selectedItem.caseTitle} <div class="info-row"> <strong>Case:</strong> {selectedItem.caseTitle} </div> {/if} <div class="info-row"> <strong>Created:</strong> {new Date(selectedItem.createdAt || selectedItem.timestamp).toLocaleString()} </div> {#if selectedItem.fileSize} <div class="info-row"> <strong>Size:</strong> {(selectedItem.fileSize / 1024).toFixed(1)} KB </div> {/if} {#if selectedItem.tags && selectedItem.tags.length > 0} <div class="info-row"> <strong>Tags:</strong> <div class="tags-list"> {#each Array.isArray(selectedItem.tags) ? selectedItem.tags: [] as tag} <span class="tag-badge">{ tag }</span> {/each} </div> </div> {/if} {#if selectedItem.metadata?.aiGenerated && selectedItem.metadata.prompt} <div class="info-row"> <strong>AI Prompt:</strong> {selectedItem.metadata.prompt} </div> {/if} </div> <div class="detail-actions"> <button class="nes-btn" onclick={() => downloadItem(selectedItem)}> â¬‡ï¸ Download </button> <button class="nes-btn" onclick={() => shareItem(selectedItem)}> ðŸ“¤ Share </button> {#if selectedItem.caseId} <a href={ `/cases/${selectedItem.caseId}/enhanced` } class="nes-btn"> ðŸ”— View Case </a> {/if} <button class="nes-btn" onclick={() => deleteItem(selectedItem)}> ðŸ—‘ï¸ Delete </button> </div> </div> </div> </div> {/if} </div> <style> .gallery-page { min-height: 100vh; background: #f5f5f5; padding: 1rem}
	.gallery-header { margin-bottom: 2rem}
	.header-content { display: flex; justify-content: space-between; align-items: center; gap: 2rem}
	.gallery-description { color: #666; margin: 0.5rem 0}
	.gallery-stats { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 1rem}
	.stat-item { font-size: 0.8rem}
	.header-actions { display: flex; gap: 1rem}
	.gallery-controls { margin-bottom: 2rem}
	.controls-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto auto auto; gap: 1rem; align-items: end}
	.control-group { display: flex; flex-direction: column; gap: 0.5rem}
	.view-modes { display: flex; gap: 0.25rem}
	.loading-state, .error-state { text-align: center; padding: 3rem; margin: 2rem 0}
	.loading-content { display: flex; flex-direction: column; align-items: center; gap: 1rem}
	.empty-state { text-align: center; padding: 3rem; margin: 2rem 0}
	.empty-actions { display: flex; gap: 1rem; justify-content: center; margin-top: 2rem}
	/* Gallery Grid Layouts */ .gallery-grid { display: grid; gap: 1.5rem}
	.gallery-grid.gallery-grid { grid-template-columns: repeat(auto-fill, minmax(400px, 1fr))}
	.gallery-grid.gallery-list { grid-template-columns: 1fr}
	.gallery-grid.gallery-masonry { grid-template-columns: repeat(auto-fill, minmax(400px, 1fr))}
	.gallery-item { overflow: hidden; transition: transform 0.2s ease}
	.gallery-item:hover { transform: translateY(-4px)}
	.item-preview { position: relative; width: 100%; height: 200px; overflow: hidden; cursor: pointer}
	.preview-image, .preview-video { width: 100%; height: 100%; object-fit: cover}
	.preview-placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f0f0f0}
	.file-icon { font-size: 3rem; margin-bottom: 0.5rem}
	.file-icon.large { font-size: 5rem}
	.file-type { text-transform: uppercase; font-weight: bold; color: #666}
	.item-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); display: flex; flex-direction: column; justify-content: space-between; padding: 1rem; opacity: 0; transition: opacity 0.3s ease; color: white}
	.gallery-item:hover .item-overlay { opacity: 1}
	.overlay-info { flex: 1}
	.item-title { font-weight: bold; margin: 0, 0 0.5rem 0}
	.item-case { font-size: 0.8rem; opacity: 0.8; margin: 0}
	.overlay-actions { display: flex; gap: 0.5rem}
	.item-info { padding: 1rem}
	.item-meta { display: flex; gap: 0.5rem; margin-bottom: 0.5rem}
	.category-badge, .ai-badge { font-size: 0.7rem}
	.item-tags { display: flex; gap: 0.25rem; margin-bottom: 0.5rem; flex-wrap: wrap}
	.tag-badge { background: #e0e0e0; padding: 0.125rem 0.375rem; border-radius: 3px; font-size: 0.7rem; color: #333}
	.tag-more { font-size: 0.7rem; color: #666}
	.item-timestamp { font-size: 0.8rem; color: #666}
	/* Modal Styles */ .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; padding: 1rem}
	.modal-content { max-width: 90vw; max-height: 90vh; overflow: auto; background: white}
	.detail-modal { max-width: 800px}
	.modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 1rem; border-bottom: 1px solid #ddd}
	.modal-body { padding: 0 1rem 1rem}
	.upload-area { margin-bottom: 1rem}
	.upload-label { display: block; cursor: pointer}
	.upload-content { text-align: center; padding: 3rem 2rem}
	.upload-icon { font-size: 3rem; margin-bottom: 1rem}
	.upload-hint { font-size: 0.8rem; color: #666; margin-top: 0.5rem}
	.upload-options { display: flex; flex-direction: column; gap: 1rem}
	.option-group { display: flex; flex-direction: column; gap: 0.5rem}
	.detail-content { margin-bottom: 2rem}
	.detail-image, .detail-video { width: 100%; max-height: 400px; object-fit: contain; border-radius: 8px}
	.detail-audio { width: 100%; margin: 2rem 0}
	.detail-placeholder { text-align: center; padding: 3rem; background: #f0f0f0; border-radius: 8px}
	.detail-info { margin-bottom: 2rem}
	.info-row { margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem}
	.tags-list { display: flex; gap: 0.25rem; flex-wrap: wrap}
	.detail-actions { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center}
	/* Responsive Design */ @media (max-width: 1200px) { .controls-grid { grid-template-columns: 1fr; gap: 1rem}
		.control-group { flex-direction: row; align-items: center}
		.view-modes { justify-content: center}
	} @media (max-width: 768px) { .header-content { flex-direction: column; align-items: flex-start}
		.gallery-stats { justify-content: flex-start}
		.gallery-grid.gallery-grid { grid-template-columns: repeat(auto-fill, minmax(400px, 1fr))}
		.modal-content { margin: 0.5rem; max-width: calc(100vw - 1rem)}
		.detail-actions { flex-direction: column}
	} </style>


