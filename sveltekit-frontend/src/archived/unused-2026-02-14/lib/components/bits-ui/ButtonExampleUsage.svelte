<script lang="ts">
  /**
   * Legal AI Platform - Button Usage Examples
   * Demonstrates bits-ui Button with Superforms v2 + Drizzle ORM 0.44
   * Database: legal_ai_db (PostgreSQL)
   */
  import ButtonExample from './ButtonExample.svelte';

  // Svelte 5 runes state
  let isLoading = $state(false);
  let isSavingCase = $state(false);
  let isUploadingEvidence = $state(false);
  let activeAction = $state<string | null>(null);

  // Mock case data matching schema-postgres.ts cases table
  let currentCase = $state<{
    id: string;
    title: string;
    caseNumber: string;
    status: 'open' | 'in_progress' | 'pending_review' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'critical';
    jurisdiction: string;
    practiceArea: string;
  }>({
    id: crypto.randomUUID(),
    title: 'State v. Johnson - Financial Fraud',
    caseNumber: 'CAS-2026-482910',
    status: 'open',
    priority: 'high',
    jurisdiction: 'Federal',
    practiceArea: 'Criminal Law'
  });

  // Mock evidence items matching schema-postgres.ts evidence table
  type EvidenceType = 'document' | 'video' | 'witness_statement' | 'forensic';
  let evidenceItems = $state<Array<{ id: string; title: string; evidenceType: EvidenceType; fileType: string }>>([
    { id: crypto.randomUUID(), title: 'Bank Statement Q4 2025', evidenceType: 'document', fileType: 'application/pdf' },
    { id: crypto.randomUUID(), title: 'Security Camera Footage', evidenceType: 'video', fileType: 'video/mp4' },
    { id: crypto.randomUUID(), title: 'Witness Deposition - M. Chen', evidenceType: 'witness_statement', fileType: 'application/pdf' }
  ]);

  let evidenceCount = $derived(evidenceItems.length);

  // Simulated Superforms submit handler
  async function handleCaseSubmit() {
    isSavingCase = true;
    activeAction = 'case-submit';
    // In production: superForm POST to /api/cases with zod(caseFormSchema)
    await new Promise(resolve => setTimeout(resolve, 1500));
    isSavingCase = false;
    activeAction = null;
    console.log('Case saved via Superforms → Drizzle → legal_ai_db.cases');
  }

  // Simulated evidence upload
  async function handleEvidenceUpload() {
    isUploadingEvidence = true;
    activeAction = 'evidence-upload';
    // In production: superForm with dataType: 'form' + fileProxy → MinIO → legal_ai_db.evidence
    await new Promise(resolve => setTimeout(resolve, 2000));
    evidenceItems = [...evidenceItems, {
      id: crypto.randomUUID(),
      title: 'New Forensic Report',
      evidenceType: 'forensic' as const,
      fileType: 'application/pdf'
    }];
    isUploadingEvidence = false;
    activeAction = null;
    console.log('Evidence uploaded → MinIO → legal_ai_db.evidence');
  }

  // AI analysis trigger
  async function handleAIAnalysis() {
    isLoading = true;
    activeAction = 'ai-analysis';
    // In production: POST /api/ai/analyze → Ollama gemma3-legal → embeddinggemma → Qdrant
    await new Promise(resolve => setTimeout(resolve, 3000));
    isLoading = false;
    activeAction = null;
    console.log('AI analysis complete → gemma3-legal + embeddinggemma → Qdrant vectors stored');
  }

  // Case status transition
  async function handleStatusTransition(newStatus: string) {
    activeAction = `status-${newStatus}`;
    // In production: Drizzle update cases SET status = newStatus WHERE id = currentCase.id
    await new Promise(resolve => setTimeout(resolve, 500));
    currentCase.status = newStatus as typeof currentCase.status;
    activeAction = null;
    console.log(`Case status → ${newStatus} (Drizzle → legal_ai_db.cases)`);
  }

  function handleDeleteEvidence(id: string) {
    evidenceItems = evidenceItems.filter(e => e.id !== id);
    console.log(`Evidence ${id} deleted from legal_ai_db.evidence`);
  }
</script>

<div class="space-y-6 p-8">
  <div class="space-y-4">
    <h2 class="text-2xl font-bold">Legal AI Platform - Button Integration</h2>
    <p class="text-sm opacity-70">
      Superforms v2 + Drizzle ORM 0.44 + legal_ai_db (PostgreSQL)
    </p>

    <!-- Case Management Actions -->
    <div class="section">
      <h3 class="section-title">Case Management</h3>
      <p class="text-xs opacity-60 mb-2">
        {currentCase.caseNumber} — {currentCase.title}
      </p>
      <div class="flex gap-3 flex-wrap">
        <ButtonExample
          variant="default"
          loading={isSavingCase}
          onclick={handleCaseSubmit}
        >
          {isSavingCase ? 'Saving...' : 'Save Case'}
        </ButtonExample>

        <ButtonExample
          variant="outline"
          onclick={() => handleStatusTransition('in_progress')}
          disabled={currentCase.status === 'in_progress'}
        >
          Begin Investigation
        </ButtonExample>

        <ButtonExample
          variant="secondary"
          onclick={() => handleStatusTransition('pending_review')}
          disabled={currentCase.status === 'pending_review'}
        >
          Send for Review
        </ButtonExample>

        <ButtonExample
          variant="destructive"
          onclick={() => handleStatusTransition('closed')}
          disabled={currentCase.status === 'closed'}
        >
          Close Case
        </ButtonExample>
      </div>
      <div class="status-badge mt-2">
        Status: <span class="font-bold">{currentCase.status}</span>
        | Priority: <span class="font-bold">{currentCase.priority}</span>
        | Jurisdiction: <span class="font-bold">{currentCase.jurisdiction}</span>
      </div>
    </div>

    <!-- Evidence Upload Actions -->
    <div class="section">
      <h3 class="section-title">Evidence Management ({evidenceCount} items)</h3>
      <div class="flex gap-3 flex-wrap">
        <ButtonExample
          variant="default"
          loading={isUploadingEvidence}
          onclick={handleEvidenceUpload}
        >
          {isUploadingEvidence ? 'Uploading...' : 'Upload Evidence'}
        </ButtonExample>

        <ButtonExample variant="outline" onclick={() => console.log('Browse evidence')}>
          Browse All
        </ButtonExample>

        <ButtonExample variant="ghost" onclick={() => console.log('Evidence chain of custody')}>
          Chain of Custody
        </ButtonExample>
      </div>

      <!-- Evidence list with delete buttons -->
      {#if evidenceItems.length > 0}
        <ul class="evidence-list mt-3">
          {#each evidenceItems as item (item.id)}
            <li class="evidence-item">
              <span class="evidence-type">{item.evidenceType}</span>
              <span class="evidence-title">{item.title}</span>
              <ButtonExample
                variant="ghost"
                size="sm"
                onclick={() => handleDeleteEvidence(item.id)}
              >
                Remove
              </ButtonExample>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- AI Analysis Actions -->
    <div class="section">
      <h3 class="section-title">AI-Powered Analysis</h3>
      <p class="text-xs opacity-60 mb-2">
        Ollama: gemma3-legal + embeddinggemma → Qdrant + pgvector
      </p>
      <div class="flex gap-3 flex-wrap">
        <ButtonExample
          variant="nier"
          loading={isLoading}
          onclick={handleAIAnalysis}
        >
          {isLoading ? 'Analyzing...' : 'Run Legal AI Analysis'}
        </ButtonExample>

        <ButtonExample variant="outline" onclick={() => console.log('Semantic search')}>
          Semantic Search
        </ButtonExample>

        <ButtonExample variant="secondary" onclick={() => console.log('Generate summary')}>
          Generate Brief
        </ButtonExample>

        <ButtonExample variant="ghost" onclick={() => console.log('Citation check')}>
          Citation Check
        </ButtonExample>
      </div>
    </div>

    <!-- Size Variants -->
    <div class="section">
      <h3 class="section-title">Button Sizes</h3>
      <div class="flex gap-3 items-center flex-wrap">
        <ButtonExample size="sm" variant="outline">Small</ButtonExample>
        <ButtonExample size="default" variant="outline">Default</ButtonExample>
        <ButtonExample size="lg" variant="outline">Large</ButtonExample>
        <ButtonExample size="icon" variant="outline">
          <span class="i-lucide-search h-4 w-4"></span>
        </ButtonExample>
      </div>
    </div>

    <!-- All Variants -->
    <div class="section">
      <h3 class="section-title">All Variants</h3>
      <div class="flex gap-3 flex-wrap">
        <ButtonExample variant="default">Default</ButtonExample>
        <ButtonExample variant="destructive">Destructive</ButtonExample>
        <ButtonExample variant="outline">Outline</ButtonExample>
        <ButtonExample variant="secondary">Secondary</ButtonExample>
        <ButtonExample variant="ghost">Ghost</ButtonExample>
        <ButtonExample variant="link">Link</ButtonExample>
        <ButtonExample variant="nier">YoRHa</ButtonExample>
      </div>
    </div>

    <!-- Disabled States -->
    <div class="section">
      <h3 class="section-title">Disabled & Loading States</h3>
      <div class="flex gap-3 flex-wrap">
        <ButtonExample disabled>Disabled</ButtonExample>
        <ButtonExample loading={true}>Loading</ButtonExample>
        <ButtonExample disabled variant="destructive">Cannot Delete</ButtonExample>
      </div>
    </div>
  </div>

  <!-- Active Action Indicator -->
  {#if activeAction}
    <div class="action-indicator">
      Processing: {activeAction}
    </div>
  {/if}
</div>

<style>
  .section {
    padding: 1rem;
    background: var(--color-nier-bg-secondary, #1a1a2e);
    border: 1px solid var(--color-nier-border-primary, #333);
    border-radius: 0.5rem;
  }

  .section-title {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: var(--color-nier-text-primary, #fff);
  }

  .status-badge {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 0.25rem;
    color: var(--color-nier-text-primary, #ccc);
  }

  .evidence-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .evidence-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.375rem 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 0.25rem;
    font-size: 0.85rem;
  }

  .evidence-type {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.125rem 0.375rem;
    background: rgba(0, 212, 255, 0.15);
    color: #00d4ff;
    border-radius: 0.25rem;
    min-width: 5rem;
    text-align: center;
  }

  .evidence-title {
    flex: 1;
    color: var(--color-nier-text-primary, #ddd);
  }

  .action-indicator {
    padding: 0.5rem 1rem;
    background: rgba(0, 212, 255, 0.1);
    border: 1px solid rgba(0, 212, 255, 0.3);
    border-radius: 0.375rem;
    font-size: 0.8rem;
    color: #00d4ff;
    text-align: center;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
  }
</style>
