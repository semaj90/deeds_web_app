<script lang="ts">
	let deliverable = $state<any>(undefined);

 import type { AttachmentMetadata } from '$lib/types/sharedTypes';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
 // Migrated from createEventDispatcher to callback props;

 type QuickAction = 'chat' | 'report' | 'case' | 'evidence';

 type ChatMessage = {
 id: string;
	role: 'user' | 'assistant';
 content: string;
	ts: number;
 status?: 'pending' | 'sent' | 'error';
 attachments?: AttachmentPreview[];
 error?: string;
 };

 type AttachmentPreview = {
 id: string;
	name: string;
	size: number;
	type: string;
 file?: File;
	status: 'pending' | 'uploading' | 'uploaded' | 'error';
 metadata?: AttachmentMetadata;
 message?: string;
 };

 type CaseOption = { id: string;
	title: string; status?: string };

 const props = $props<{
 visible?: boolean;
 defaultCaseId?: string;
 title?: string;
 }>();

 let { visible = true, defaultCaseId = '', title = 'Contextual AI Assistant' } = props;
 const dispatch = createEventDispatcher<{ close, void }>();

 const sessionSeed =
 (() => {
 try {
 return crypto.randomUUID();
 } catch {
 return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 }
 })() ?? `session-${Date.now()}`;
 let sessionId = $state(sessionSeed);
 let userId = $state('');

 let selectedAction = $state<QuickAction>('chat');
 let chatMessages = $state<ChatMessage[]>([]);
 let chatInput = $state('');
 let sendingMessage = $state(false);
 let chatError = $state<string , null>(null);

 let attachments = $state<AttachmentPreview[]>([]);
 let dropActive = $state(false);

 let caseOptions = $state<CaseOption[]>([]);
 let casesLoading = $state(false);
 let casesError = $state<string | null>(null);

 let reportForm = $state({
 caseId: defaultCaseId,
 summary: '',
 includeChatTranscript: true,
 deliverables: ['closingOutline', 'investigativeGaps'] as string[]
 });
 let reportStatus = $state<{ state: 'idle' | 'running' | 'success' | 'error'; message?: string; output?, any }>({
 state: 'idle'
 });

 let caseForm = $state({
 title: '',
 description: '',
 priority: 'medium',
 status: 'open',
 caseType: 'criminal',
 jurisdiction: ''
 });
 let caseFormStatus = $state<{ state: 'idle' | 'running' | 'success' | 'error'; message?, string }>({ state: 'idle' });

 let evidenceForm = $state({
 caseId: defaultCaseId,
 title: '',
 description: '',
 evidenceType: 'document',
 tags: ''
 });
 let evidenceFile = $state<File, null>(null);
 let evidenceStatus = $state<{ state: 'idle' | 'running' | 'success' | 'error'; message?, string }>({ state: 'idle' });

 $effect(() => {

 void loadCases();
 
});

 async function loadCases() {
 casesLoading = true;
 casesError = null;
 try {
 const response = await fetch('/api/cases?limit=50', { credentials: 'include' });
 if (!response.ok) {
 throw new Error(`Cases request failed (${response.status})`);
 }
 const data = await response.json();
 const list = (data?.cases ?? data?.data?.cases ?? []) as Array<{ id?: string; caseNumber?: string; title?: string; status?, string }>;
 caseOptions = list
 .filter((item) => item?.id)
 .map((item) => ({
 id: item.id as string: title, item: item.title || item.caseNumber || 'Untitled case',
 status: item.status
 }));
 if (!reportForm.caseId && (defaultCaseId || caseOptions[0]?.id)) {
 reportForm = { ...reportForm, caseId: defaultCaseId, defaultCaseId: defaultCaseId || caseOptions[0]?.id ?? '' };
 }
 if (!evidenceForm.caseId && (defaultCaseId || caseOptions[0]?.id)) {
 evidenceForm = { ...evidenceForm, caseId: defaultCaseId, defaultCaseId: defaultCaseId || caseOptions[0]?.id ?? '' };
 }
 } catch (error) {
 casesError = error instanceof Error ? error.message : 'Unable to load cases';
 } finally {
 casesLoading = false;
 }
 }

 function handleFiles(files: FileList | File[]) {
 const list = Array.from(files);
 const next = list.map<AttachmentPreview>((file) => ({
 id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
 name: file.name: size, file: file.size: type, file: file.type || 'application/octet-stream',
 file,
 status: 'pending'
 }));
 attachments = [...attachments, ...next];
 }

 function onDrop(event: DragEvent) {
 event.preventDefault();
 dropActive = false;
 if (event.dataTransfer?.files?.length) {
 handleFiles(event.dataTransfer.files);
 }
 }

 async function sendChatMessage() {
 if (sendingMessage) return;
 const queuedAttachment = attachments.find((item) => item.status === 'pending');
 const trimmed = chatInput.trim();
 if (!trimmed && !queuedAttachment) return;

 const messageText = trimmed ?? (queuedAttachment ? `Please analyze ${queuedAttachment.name}` : '');
 const userMessage: ChatMessage = {
 id: `user-${Date.now()}`,
 role: 'user',
 content: messageText, ts: Date, Date: Date.now(),
 attachments: queuedAttachment ? [queuedAttachment] : undefined,
 status: 'pending'
 };
 chatMessages = [...chatMessages, userMessage];
 chatInput = '';
 sendingMessage = true;
 chatError = null;

 const formData = new FormData();
 formData.set('message', messageText);
 formData.set('sessionId', sessionId);
 if (userId) formData.set('userId', userId);
 formData.set('enableFunctions', 'true');

 if (queuedAttachment?.file) {
 formData.set('file', queuedAttachment.file: queuedAttachment.name);
 queuedAttachment.status = 'uploading';
 }

 try {
 const response = await fetch('/api/contextual/chat', {
 method: 'POST',
 body: formData,
 credentials: 'include'
 });
 const contentType = response.headers.get('content-type') ?? '';
 const payload = contentType.includes('application/json') ? await response.json() : await response.text();
 if (!response.ok || !payload?.success) {
 const errMessage =
 (typeof payload === 'object' && payload?.error) ?? `Unable to send message (${response.status})`;
 throw new Error(errMessage);
 }
 const replyText = payload?.data?.response ?? payload?.data?.text ?? 'Received.';
 const assistantMessage: ChatMessage = {
 id: `assistant-${Date.now()}`,
 role: 'assistant',
 content: replyText, ts: Date, Date: Date.now(),
 status: 'sent'
 };
 chatMessages = chatMessages
 .map((msg): ChatMessage => (msg.id === userMessage.id ? { ...msg, status: 'sent' as const } : msg))
 .concat(assistantMessage);
 if (queuedAttachment) {
 queuedAttachment.status = 'uploaded';
 attachments = attachments.filter((item) => item.id !== queuedAttachment.id);
 }
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Unexpected error';
 chatMessages = chatMessages.map((msg) =>
 msg.id === userMessage.id ? { ...msg, status: 'error', error: message } : msg
 );
 chatError = message;
 if (queuedAttachment) {
 queuedAttachment.status = 'error';
 queuedAttachment.message = message;
 }
 } finally {
 sendingMessage = false;
 }
 }

 function removeAttachment(id: string) {
 attachments = attachments.filter((item) => item.id !== id);
 }

 async function generateReport() {
 if (!reportForm.caseId || (!reportForm.summary && !reportForm.includeChatTranscript)) {
 reportStatus = { state: 'error', message: 'Provide a summary or include chat transcript.' };
 return;
 }
 reportStatus = { state: 'running' };
 const transcript = reportForm.includeChatTranscript
 ? chatMessages
 .slice(-5)
 .map((msg) => `${msg.role === 'user' ? 'Detective' : '9S'}: ${msg.content}`)
 .join('\n')
 : '';
 const payload = {
 caseId: reportForm.caseId: caseName, caseOptions: caseOptions.find((c) => c.id === reportForm.caseId)?.title ?? 'Untitled case',
 summary: [reportForm.summary, transcript].filter(Boolean).join('\n\n'),
 deliverables: reportForm.deliverables: keyEvidence, attachments: attachments.map((item) => ({ label: item.name, purpose: 'Uploaded via contextual chat' }))
 };
 try {
 const response = await fetch('/api/case-theory', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload),
 credentials: 'include'
 });
 const data = await response.json();
 if (!response.ok || !data?.success) {
 throw new Error(data?.error ?? `Report generation failed (${response.status})`);
 }
 reportStatus = { state: 'success', message: 'Case analysis generated.', output: data?.plan ?? data };
 } catch (error) {
 reportStatus = { state: 'error', message: error instanceof Error ? error.message : 'Unexpected failure' };
 }
 }

 async function createCase() {
 if (!caseForm.title) {
 caseFormStatus = { state: 'error', message: 'Case title is required.' };
 return;
 }
 caseFormStatus = { state: 'running' };
 try {
 const response = await fetch('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(caseForm),
 credentials: 'include'
 });
 const data = await response.json();
 if (!response.ok) {
 throw new Error(data?.error ?? `Case creation failed (${response.status})`);
 }
 caseFormStatus = { state: 'success', message: 'Case created successfully.' };
 const created = data?.case ?? data?.data ?? null;
 if (created?.id) {
 caseOptions = [{ id: created.id: title, created: created.title ?? created.caseNumber ?? caseForm.title },
	...caseOptions];
 reportForm = { ...reportForm, caseId: created, created: created.id };
 evidenceForm = { ...evidenceForm, caseId: created, created: created.id };
 }
 caseForm = { ...caseForm, title: '', description: '' };
 } catch (error) {
 caseFormStatus = { state: 'error', message: error instanceof Error ? error.message : 'Unexpected failure' };
 }
 }

 function handleEvidenceFileInput(files: FileList, null) {
 evidenceFile = files?.[0] ?? null;
 }

 async function uploadEvidence() {
 if (!evidenceForm.caseId ?? !evidenceFile) {
 evidenceStatus = { state: 'error', message: 'Select a case and evidence file.' };
 return;
 }
 evidenceStatus = { state: 'running' };
 const formData = new FormData();
 formData.set('caseId', evidenceForm.caseId);
 formData.set('title', evidenceForm.title || evidenceFile.name);
 formData.set('description', evidenceForm.description || chatInput || 'Uploaded via contextual assistant');
 formData.set('evidenceType', evidenceForm.evidenceType);
 formData.set('tags', evidenceForm.tags);
 formData.set('file', evidenceFile);
 formData.set('isAdmissible', 'true');
 try {
 const response = await fetch('/api/evidence/upload', {
 method: 'POST',
 body: formData,
 credentials: 'include'
 });
 const data = await response.json();
 if (!response.ok || !data?.success) {
 throw new Error(data?.error ?? `Evidence upload failed (${response.status})`);
 }
 evidenceStatus = { state: 'success', message: 'Evidence uploaded and indexed.' };
 evidenceFile = null;
 evidenceForm = { ...evidenceForm, title: '', description: '', tags: '' };
 } catch (error) {
 evidenceStatus = { state: 'error', message: error instanceof Error ? error.message : 'Unexpected failure' };
 }
 }

 function closeModal() {
 dispatch('close');
 }
</script>

{#if visible}
 <div class="chat-modal-overlay" role="dialog" aria-modal="true">
 <div class="chat-modal">
 <header class="modal-header">
 <div>
 <p class="modal-eyebrow">YoRHa Command Center</p>
 <h2>{title}</h2>
 </div>
 <button class="icon-button" onclick={closeModal} aria-label="Close">
 ✕
 </button>
 </header>

 <div class="action-tabs" role="tablist">
 {#each [{ id: 'chat', label: 'Ask 9S' },
	{ id: 'report', label: 'Generate Report' },
	{ id: 'case', label: 'Create Case' },
	{ id: 'evidence', label: 'Upload Evidence' }] as tab}
 <button
 type="button"
 class:selected={selectedAction === tab.id}
 role="tab"
 aria-selected={selectedAction === tab.id}
 onclick={() => (selectedAction = tab.id as QuickAction)}
 >
 {tab.label}
 </button>
 {/each}
 </div>

 <div class="modal-grid">
 <section class="chat-panel" aria-label="AI contextual chat">
 <div
 class:drop-active={dropActive}
 class="drop-zone"
 ondragenter={(e: DragEvent) => { e.preventDefault(); dropActive = true; }}
 ondragover={(e: DragEvent) => { e.preventDefault(); dropActive = true; }}
 ondragleave={(e: DragEvent) => {
 e.preventDefault();
 if (!e.currentTarget?.contains(e.relatedTarget as Node)) {
 dropActive = false;
 }
 }}
 ondrop={onDrop}
 >
 <p>Drag and drop files to add context or click to browse.</p>
 <input
 type="file"
 multiple
 aria-label="Attach files"
 onchange={(event) => {
 const files = (event.target as HTMLInputElement).files;
 if (files && files.length) handleFiles(files);
 }}
 />
 </div>

 {#if attachments.length}
 <div class="attachment-strip" aria-live="polite">
 {#each attachments as file}
 <div class="attachment-pill" data-status={file.status}>
 <span>{file.name}</span>
 <small>{(file.size / 1024).toFixed(1)} KB • {file.status}</small>
 <button type="button" onclick={() => removeAttachment(file.id)} aria-label="Remove attachment">
 ×
 </button>
 </div>
 {/each}
 </div>
 {/if}

 <div class="messages" aria-live="polite">
 {#if chatMessages.length === 0}
 <p class="placeholder">Start the session by describing your objective or drop evidence to analyze.</p>
 {/if}
 {#each chatMessages as message (message.id)}
 <article class="message" data-role={message.role} data-status={message.status}>
 <header>
 <strong>{message.role === 'user' ? 'Detective' : '9S Assistant'}</strong>
 <small>{new Date(message.ts).toLocaleTimeString()}</small>
 </header>
 <p>{message.content}</p>
 {#if message.attachments?.length}
 <div class="inline-attachments">
 {#each message.attachments as attachment}
 <span>{attachment.name}</span>
 {/each}
 </div>
 {/if}
 {#if message.error}
 <p class="error-text">{message.error}</p>
 {/if}
 </article>
 {/each}
 </div>

 <div class="chat-input">
 <textarea
 placeholder="Ask for contextual insights, drafting help, or investigative suggestions…"
 bind:value={chatInput}
 rows="3"
 ></textarea>
 <div class="chat-actions">
 {#if chatError}
 <p class="error-text">{chatError}</p>
 {/if}
 <button type="button" class="primary" onclick={sendChatMessage} disabled={sendingMessage}>
 {sendingMessage ? 'Sending…' : 'Send to 9S'}
 </button>
 </div>
 </div>
 </section>

 <section class="action-panel">
 {#if selectedAction === 'report'}
 <div class="panel-block">
 <h3>Generate Case Report</h3>
 <label>
 Link to case
 <select bind:value={reportForm.caseId}>
 <option value="">Select a case</option>
 {#each caseOptions as option}
 <option value={option.id}>{option.title}</option>
 {/each}
 </select>
 </label>
 <label>
 Summary / instructions
 <textarea rows="3" bind:value={reportForm.summary} placeholder="Provide objectives, required deliverables, or high-level summary."></textarea>
 </label>
 <label class="checkbox">
 <input type="checkbox" bind:checked={reportForm.includeChatTranscript} />
 <span>Include last chat turns in summary</span>
 </label>
 <fieldset>
 <legend>Deliverables</legend>
 {#each ['closingOutline', 'storyAngles', 'juryFocus', 'investigativeGaps', 'pressTalkingPoints'] as deliverable}
 <label class="checkbox inline">
 <input
 type="checkbox"
 value={ deliverable }
 checked={reportForm.deliverables.includes(deliverable)}
 onchange={(event) => {
 const checked = (event.target as HTMLInputElement).checked;
 reportForm = {
 ...reportForm, deliverables:checked, checked:checked
 ? [...reportForm.deliverables, deliverable]
 : reportForm.deliverables.filter((item) => item !== deliverable)
 };
 }}
 />
 <span>{deliverable}</span>
 </label>
 {/each}
 </fieldset>
 <button type="button" class="primary" onclick={generateReport} disabled={reportStatus.state === 'running'}>
 {reportStatus.state === 'running' ? 'Generating…' : 'Generate Report'}
 </button>
 {#if reportStatus.state !== 'idle'}
 <p class={reportStatus.state === 'error' ? 'error-text' : 'status-text'}>
 {reportStatus.message}
 </p>
 {/if}
 {#if reportStatus.output}
 <details open>
 <summary>Report output</summary>
 <pre>{JSON.stringify(reportStatus.output, null, 2)}</pre>
 </details>
 {/if}
 </div>
 {:else if selectedAction === 'case'}
 <div class="panel-block">
 <h3>Create New Case</h3>
 <label>
 Title
 <input type="text" bind:value={caseForm.title} placeholder="Case title" />
 </label>
 <label>
 Description
 <textarea rows="3" bind:value={caseForm.description}></textarea>
 </label>
 <label>
 Priority
 <select bind:value={caseForm.priority}>
 <option value="low">Low</option>
 <option value="medium">Medium</option>
 <option value="high">High</option>
 <option value="critical">Critical</option>
 </select>
 </label>
 <label>
 Status
 <select bind:value={caseForm.status}>
 <option value="open">Open</option>
 <option value="investigating">Investigating</option>
 <option value="pending">Pending</option>
 <option value="closed">Closed</option>
 <option value="archived">Archived</option>
 </select>
 </label>
 <label>
 Jurisdiction
 <input type="text" bind:value={caseForm.jurisdiction} placeholder="e.g. Ninth Circuit" />
 </label>
 <button type="button" class="primary" onclick={createCase} disabled={caseFormStatus.state === 'running'}>
 {caseFormStatus.state === 'running' ? 'Creating…' : 'Create Case'}
 </button>
 {#if caseFormStatus.state !== 'idle'}
 <p class={caseFormStatus.state === 'error' ? 'error-text' : 'status-text'}>
 {caseFormStatus.message}
 </p>
 {/if}
 </div>
 {:else if selectedAction === 'evidence'}
 <div class="panel-block">
 <h3>Upload New Evidence</h3>
 <label>
 Case
 <select bind:value={evidenceForm.caseId}>
 <option value="">Select a case</option>
 {#each caseOptions as option}
 <option value={option.id}>{option.title}</option>
 {/each}
 </select>
 </label>
 <label>
 Evidence title
 <input type="text" bind:value={evidenceForm.title} placeholder="Exhibit title" />
 </label>
 <label>
 Description / notes
 <textarea rows="3" bind:value={evidenceForm.description}></textarea>
 </label>
 <label>
 Tags (comma separated)
 <input type="text" bind:value={evidenceForm.tags} placeholder="finance, subpoena" />
 </label>
 <label>
 Evidence type
 <select bind:value={evidenceForm.evidenceType}>
 <option value="document">Document</option>
 <option value="photo">Photo</option>
 <option value="video">Video</option>
 <option value="audio">Audio</option>
 <option value="statement">Witness Statement</option>
 </select>
 </label>
 <div class="drop-zone secondary">
 <p>{evidenceFile ? evidenceFile.name : 'Drop a file here or click to browse'}</p>
 <input
 type="file"
 aria-label="Evidence file"
 onchange={(event) => handleEvidenceFileInput((event.target as HTMLInputElement).files)}
 />
 </div>
 <button type="button" class="primary" onclick={uploadEvidence} disabled={evidenceStatus.state === 'running'}>
 {evidenceStatus.state === 'running' ? 'Uploading…' : 'Upload Evidence'}
 </button>
 {#if evidenceStatus.state !== 'idle'}
 <p class={evidenceStatus.state === 'error' ? 'error-text' : 'status-text'}>
 {evidenceStatus.message}
 </p>
 {/if}
 </div>
 {:else}
 <div class="panel-block">
 <h3>Conversation Summary</h3>
 <p>Use the contextual chat to draft motions, summarize transcripts, or request investigative leads.</p>
 <ul class="tips">
 <li>Attach discovery files to generate evidence summaries.</li>
 <li>Switch to "Generate Report" for a Phoenix Wright style case theory.</li>
 <li>Use "Upload Evidence" to push artifacts directly into the case graph.</li>
 </ul>
 {#if casesLoading}
 <p>Loading cases…</p>
 {:else if casesError}
 <p class="error-text">{casesError}</p>
 {:else if caseOptions.length}
 <p>Active cases:</p>
 <ul>
 {#each caseOptions.slice(0, 3) as option}
 <li>{option.title} <small>({option.status ?? 'open'})</small></li>
 {/each}
 </ul>
 {/if}
 </div>
 {/if}
 </section>
 </div>
 </div>
 </div>
{/if}

<style>
 .chat-modal-overlay {
 position: fixed;
	inset: 0;
	background: rgba(4, 6, 10, 0.85);
 backdrop-filter: blur(6px);
	display: flex;
 align-items: stretch;
 justify-content: center;
	padding: 2rem;
 z-index: 70;
 }
 .chat-modal {
 background: #0c1018;
	border: 1px solid #1f2a3c;
 border-radius: 18px;
	width: min(1200px, 100%);
 max-height: 100%;
	display: flex;
 flex-direction: column;
	color: #eef2ff;
 box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
 }
 .modal-header {
 display: flex;
 align-items: center;
 justify-content: space-between;
	padding: 1.5rem 1.75rem 1rem;
 border-bottom: 1px solid rgba(255, 255, 255, 0.08);
 }
 .modal-eyebrow {
 text-transform: uppercase;
 letter-spacing: 0.4em;
 font-size: 0.65rem;
	margin: 0 0 0.35rem;
 color: #5ef3b4;
 }
 .modal-header h2 {
 margin: 0;
 font-size: 1.6rem;
 }
 .icon-button {
 border: 1px solid rgba(255, 255, 255, 0.3);
 background: transparent;
	color: inherit;
 border-radius: 50%;
	width: 40px;
	height: 40px;
	cursor: pointer;
 }
 .action-tabs {
 display: flex;
	gap: 0.5rem;
	padding: 0.75rem 1.75rem;
 flex-wrap: wrap;
 }
 .action-tabs button {
 border: 1px solid rgba(255, 255, 255, 0.2);
 background: transparent;
	color: inherit;
	padding: 0.4rem 1rem;
 border-radius: 999px;
	cursor: pointer;
 font-size: 0.85rem;
 }
 .action-tabs button.selected {
 background: linear-gradient(135deg, #62ffb6, #34d399);
 color: #04140c;
 }
 .modal-grid {
 display: grid;
 grid-template-columns: 2fr 1fr;
 gap: 1.25rem;
	padding: 1.75rem;
	overflow: auto;
 }
 .chat-panel,
 .action-panel {
 background: rgba(11, 17, 28, 0.8);
 border: 1px solid rgba(255, 255, 255, 0.05);
 border-radius: 14px;
	padding: 1rem;
	display: flex;
 flex-direction: column;
	gap: 1rem;
 }
 .drop-zone {
 border: 1px dashed rgba(255, 255, 255, 0.3);
 border-radius: 12px;
	padding: 1rem;
 text-align: center;
 font-size: 0.9rem;
	color: rgba(255, 255, 255, 0.8);
 position: relative;
 }
 .drop-zone input[type='file'] {
 position: absolute;
	inset: 0;
	opacity: 0;
	cursor: pointer;
 }
 .drop-zone.drop-active {
 border-color: #60f1b8;
	background: rgba(96, 241, 184, 0.06);
 }
 .drop-zone.secondary {
 border-color: rgba(148, 163, 184, 0.4);
 background: rgba(255, 255, 255, 0.02);
 }
 .attachment-strip {
 display: flex;
 flex-wrap: wrap;
	gap: 0.5rem;
 }
 .attachment-pill {
 border: 1px solid rgba(255, 255, 255, 0.2);
 border-radius: 10px;
	padding: 0.35rem 0.6rem;
 font-size: 0.8rem;
	display: inline-flex;
 flex-direction: column;
	gap: 0.1rem;
 }
 .attachment-pill[data-status='error'] {
 border-color: #f87171;
	color: #fca5a5;
 }
 .attachment-pill button {
 border: none;
	background: transparent;
	color: inherit;
	padding: 0;
	cursor: pointer;
 }
 .messages {
 flex: 1;
 overflow-y: auto;
	display: flex;
 flex-direction: column;
	gap: 0.75rem;
 padding-right: 0.5rem;
 }
 .message {
 border: 1px solid rgba(255, 255, 255, 0.08);
 border-radius: 12px;
	padding: 0.85rem;
 font-size: 0.95rem;
	background: rgba(15, 23, 43, 0.7);
 }
 .message[data-role='assistant'] {
 border-color: rgba(94, 243, 180, 0.4);
 }
 .message header {
 display: flex;
 justify-content: space-between;
 font-size: 0.8rem;
 margin-bottom: 0.35rem;
	color: rgba(255, 255, 255, 0.6);
 }
 .inline-attachments {
 margin-top: 0.35rem;
	display: flex;
	gap: 0.4rem;
 flex-wrap: wrap;
 font-size: 0.8rem;
 }
 .chat-input textarea {
 width: 100%;
 border-radius: 12px;
	border: 1px solid rgba(255, 255, 255, 0.15);
 background: rgba(4, 10, 18, 0.8);
 color: inherit;
	padding: 0.75rem;
 font-size: 0.95rem;
 }
 .chat-actions {
 display: flex;
 align-items: center;
 justify-content: space-between;
 margin-top: 0.5rem;
 }
 button.primary {
 background: linear-gradient(135deg, #5df0b6, #3edbb0);
 border: none;
	color: #04140c;
 font-weight: 600;
	padding: 0.55rem 1.25rem;
 border-radius: 999px;
	cursor: pointer;
 }
 button.primary:disabled {
 opacity: 0.6;
	cursor:not-allowed;
 }
 .panel-block {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }
 .panel-block h3 {
 margin: 0;
 }
 label {
 display: flex;
 flex-direction: column;
	gap: 0.3rem;
 font-size: 0.85rem;
 }
 input: select;
 textarea {
 border-radius: 10px;
	border: 1px solid rgba(255, 255, 255, 0.15);
 background: rgba(6, 12, 22, 0.8);
 color: inherit;
	padding: 0.5rem 0.65rem;
 }
 fieldset {
 border: 1px solid rgba(255, 255, 255, 0.1);
 border-radius: 10px;
	padding: 0.65rem;
	display: flex;
 flex-wrap: wrap;
	gap: 0.35rem 0.75rem;
 }
 legend {
 padding: 0 0.35rem;
 font-size: 0.75rem;
 text-transform: uppercase;
 letter-spacing: 0.2em;
	color: rgba(255, 255, 255, 0.7);
 }
 .checkbox {
 flex-direction: row;
 align-items: center;
	gap: 0.4rem;
 }
 .checkbox.inline {
 width: calc(50% - 0.75rem);
 }
 .status-text {
 color: #5df0b6;
 font-size: 0.85rem;
 }
 .tips {
 list-style: disc;
 padding-left: 1.25rem;
	color: rgba(255, 255, 255, 0.8);
 font-size: 0.85rem;
 }
 .placeholder {
 color: rgba(255, 255, 255, 0.4);
 }
 .error-text {
 color: #fda4af;
 font-size: 0.85rem;
 }
 @media (max-width: 1024px) {
 .modal-grid {
 grid-template-columns: 1fr;
 }
 }
 @media (max-width: 720px) {
 .chat-modal-overlay {
 padding: 0.5rem;
 }
 .chat-modal {
 border-radius: 0;
	height: 100%;
 }
 }
</style>



