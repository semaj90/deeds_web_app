<script lang="ts">
  /**
   * Legal Case Form - Svelte 5 Component
   * Multi-step form for creating new legal cases
   * Phase 107 - Clean regeneration
   */
  import { Card } from '$lib/components/ui/enhanced-bits';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

  // Form state using Svelte 5 runes
  let formData = $state({
    caseTitle: '',
    caseNumber: '',
    clientName: '',
    practiceArea: '',
    jurisdiction: '',
    courtLevel: '',
    priority: '',
    description: '',
    assignedAttorney: '',
    estimatedHours: '',
    budget: '',
    deadline: ''
  });

  let formErrors = $state<Record<string, string>>({});
  let isSubmitting = $state<boolean>(false);
  let activeTab = $state<string>('basic');

  // Form validation
  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (!formData.caseTitle.trim()) {
      errors.caseTitle = 'Case title is required';
    }
    if (!formData.clientName.trim()) {
      errors.clientName = 'Client name is required';
    }
    if (!formData.practiceArea) {
      errors.practiceArea = 'Practice area must be selected';
    }
    if (!formData.jurisdiction) {
      errors.jurisdiction = 'Jurisdiction must be selected';
    }
    if (!formData.deadline) {
      errors.deadline = 'Deadline is required';
    }

    formErrors = errors;
    return Object.keys(errors).length === 0;
  }

  // Form submission
  async function handleSubmit(): Promise<void> {
    if (!validateForm()) {
      console.warn('Validation failed');
      return;
    }

    isSubmitting = true;

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(formData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create case');
      }

      const result = await response.json();
      console.log('Case created:', result);

      // Reset form
      resetForm();

    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      isSubmitting = false;
    }
  }

  function resetForm() {
    formData = {
      caseTitle: '',
      caseNumber: '',
      clientName: '',
      practiceArea: '',
      jurisdiction: '',
      courtLevel: '',
      priority: '',
      description: '',
      assignedAttorney: '',
      estimatedHours: '',
      budget: '',
      deadline: ''
    };
    formErrors = {};
    activeTab = 'basic';
  }

  // Select options
  const practiceAreas = [
    { value: 'corporate', label: '🏢 Corporate Law' },
	{ value: 'litigation', label: '⚖️ Litigation' },
	{ value: 'intellectual-property', label: '🧠 Intellectual Property' },
	{ value: 'real-estate', label: '🏠 Real Estate' },
	{ value: 'employment', label: '👥 Employment Law' },
	{ value: 'criminal', label: '🚔 Criminal Law' },
	{ value: 'family', label: '👨‍👩‍👧‍👦 Family Law' },
	{ value: 'tax', label: '💰 Tax Law' }
  ];

  const jurisdictions = [
    { value: 'federal', label: '🇺🇸 Federal' },
	{ value: 'state-ca', label: '🐻 California' },
	{ value: 'state-ny', label: '🗽 New York' },
	{ value: 'state-tx', label: '🤠 Texas' },
	{ value: 'state-fl', label: '🌴 Florida' },
	{ value: 'international', label: '🌐 International' }
  ];

  const priorities = [
    { value: 'low', label: '🟢 Low Priority' },
	{ value: 'medium', label: '🟡 Medium Priority' },
	{ value: 'high', label: '🟠 High Priority' },
	{ value: 'urgent', label: '🔴 Urgent' }
  ];

  const tabs = [
    { value: 'basic', label: '📋 Basic Info' },
	{ value: 'details', label: '📝 Case Details' },
	{ value: 'assignment', label: '👥 Assignment' },
	{ value: 'review', label: '✅ Review' }
  ];

  // Computed values
  let isFormValid = $derived(
    formData.caseTitle.trim() !== '' &&
    formData.clientName.trim() !== '' &&
    formData.practiceArea !== '' &&
    formData.jurisdiction !== '' &&
    formData.deadline !== ''
  );

  let formProgress = $derived.by(() => {
    const requiredFields = [
      formData.caseTitle,
      formData.clientName,
      formData.practiceArea,
      formData.jurisdiction,
      formData.deadline
    ];
    const completed = requiredFields.filter(f => f && f.trim() !== '').length;
    return Math.floor((completed / requiredFields.length) * 100);
  });
</script>

<Card>
  <div class="legal-case-form">
    <div class="form-header">
      <h2 class="form-title">⚖️ Create New Legal Case</h2>
      <div class="form-progress">
        <div class="progress-bar">
          <div class="progress-fill" style="width: {formProgress}%"></div>
        </div>
        <span class="progress-text">{formProgress}% Complete</span>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="tab-nav">
      {#each tabs as tab}
        <button
          class="tab-btn"
          class:active={activeTab === tab.value}
          onclick={() => activeTab = tab.value}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- Basic Info Tab -->
    {#if activeTab === 'basic'}
      <div class="tab-content">
        <div class="form-grid">
          <div class="form-field">
            <label for="caseTitle">📋 Case Title *</label>
            <input
              id="caseTitle"
              type="text"
              bind:value={formData.caseTitle}
              placeholder="Enter case title..."
              class:error={formErrors.caseTitle}
            />
            {#if formErrors.caseTitle}
              <span class="error-msg">{formErrors.caseTitle}</span>
            {/if}
          </div>

          <div class="form-field">
            <label for="caseNumber">🔢 Case Number</label>
            <input
              id="caseNumber"
              type="text"
              bind:value={formData.caseNumber}
              placeholder="CASE-2024-001"
            />
          </div>

          <div class="form-field">
            <label for="clientName">👤 Client Name *</label>
            <input
              id="clientName"
              type="text"
              bind:value={formData.clientName}
              placeholder="Enter client name..."
              class:error={formErrors.clientName}
            />
            {#if formErrors.clientName}
              <span class="error-msg">{formErrors.clientName}</span>
            {/if}
          </div>

          <div class="form-field">
            <label for="practiceArea">⚖️ Practice Area *</label>
            <select
              id="practiceArea"
              bind:value={formData.practiceArea}
              class:error={formErrors.practiceArea}
            >
              <option value="">Select practice area...</option>
              {#each practiceAreas as area}
                <option value={area.value}>{area.label}</option>
              {/each}
            </select>
            {#if formErrors.practiceArea}
              <span class="error-msg">{formErrors.practiceArea}</span>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Details Tab -->
    {#if activeTab === 'details'}
      <div class="tab-content">
        <div class="form-grid">
          <div class="form-field">
            <label for="jurisdiction">🏛️ Jurisdiction *</label>
            <select
              id="jurisdiction"
              bind:value={formData.jurisdiction}
              class:error={formErrors.jurisdiction}
            >
              <option value="">Select jurisdiction...</option>
              {#each jurisdictions as jur}
                <option value={jur.value}>{jur.label}</option>
              {/each}
            </select>
            {#if formErrors.jurisdiction}
              <span class="error-msg">{formErrors.jurisdiction}</span>
            {/if}
          </div>

          <div class="form-field">
            <label for="priority">🚨 Priority</label>
            <select id="priority" bind:value={formData.priority}>
              <option value="">Select priority...</option>
              {#each priorities as p}
                <option value={p.value}>{p.label}</option>
              {/each}
            </select>
          </div>

          <div class="form-field full-width">
            <label for="description">📄 Case Description</label>
            <textarea
              id="description"
              bind:value={formData.description}
              placeholder="Provide a detailed description of the case..."
              rows="4"
            ></textarea>
          </div>
        </div>
      </div>
    {/if}

    <!-- Assignment Tab -->
    {#if activeTab === 'assignment'}
      <div class="tab-content">
        <div class="form-grid">
          <div class="form-field">
            <label for="assignedAttorney">👨‍💼 Assigned Attorney</label>
            <input
              id="assignedAttorney"
              type="text"
              bind:value={formData.assignedAttorney}
              placeholder="Enter attorney name..."
            />
          </div>

          <div class="form-field">
            <label for="estimatedHours">⏱️ Estimated Hours</label>
            <input
              id="estimatedHours"
              type="number"
              bind:value={formData.estimatedHours}
              placeholder="0"
            />
          </div>

          <div class="form-field">
            <label for="budget">💰 Budget</label>
            <input
              id="budget"
              type="number"
              bind:value={formData.budget}
              placeholder="0.00"
            />
          </div>

          <div class="form-field">
            <label for="deadline">📅 Deadline *</label>
            <input
              id="deadline"
              type="date"
              bind:value={formData.deadline}
              class:error={formErrors.deadline}
            />
            {#if formErrors.deadline}
              <span class="error-msg">{formErrors.deadline}</span>
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Review Tab -->
    {#if activeTab === 'review'}
      <div class="tab-content">
        <div class="review-section">
          <h3>📋 Case Summary</h3>
          <div class="review-grid">
            <div class="review-item">
              <strong>Case Title:</strong>
              <span>{formData.caseTitle || 'Not specified'}</span>
            </div>
            <div class="review-item">
              <strong>Client:</strong>
              <span>{formData.clientName || 'Not specified'}</span>
            </div>
            <div class="review-item">
              <strong>Practice Area:</strong>
              <span>{practiceAreas.find(a => a.value === formData.practiceArea)?.label || 'Not selected'}</span>
            </div>
            <div class="review-item">
              <strong>Jurisdiction:</strong>
              <span>{jurisdictions.find(j => j.value === formData.jurisdiction)?.label || 'Not selected'}</span>
            </div>
            <div class="review-item">
              <strong>Priority:</strong>
              <span>{priorities.find(p => p.value === formData.priority)?.label || 'Not selected'}</span>
            </div>
            <div class="review-item">
              <strong>Deadline:</strong>
              <span>{formData.deadline || 'Not specified'}</span>
            </div>
          </div>

          <div class="validation-status" class:valid={isFormValid} class:invalid={!isFormValid}>
            {#if isFormValid}
              ✅ Form is complete and ready for submission
            {:else}
              ⚠️ Please complete all required fields before submitting
            {/if}
          </div>
        </div>
      </div>
    {/if}

    <!-- Form Actions -->
    <div class="form-actions">
      <button type="button" class="btn-secondary" onclick={resetForm}>
        🗑️ Clear Form
      </button>
      <button
        type="button"
        class="btn-primary"
        disabled={!isFormValid || isSubmitting}
        onclick={handleSubmit}
      >
        {isSubmitting ? '⏳ Creating Case...' : '⚖️ Create Case'}
      </button>
    </div>
  </div>
</Card>

<style>
  .legal-case-form {
    max-width: 800px;
    margin: 0 auto;
    padding: 1.5rem;
  }

  .form-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .form-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #f1f5f9;
    margin: 0;
  }

  .form-progress {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .progress-bar {
    width: 120px;
    height: 8px;
    background: #334155;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #f59e0b, #d97706);
    transition: width 0.3s ease;
  }

  .progress-text {
    font-size: 0.875rem;
    color: #94a3b8;
    font-weight: 500;
  }

  .tab-nav {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #475569;
    padding-bottom: 0.5rem;
  }

  .tab-btn {
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    border-radius: 0.25rem;
    transition: all 0.2s;
  }

  .tab-btn:hover {
    background: #1e293b;
    color: #f1f5f9;
  }

  .tab-btn.active {
    background: #f59e0b;
    color: #0f172a;
    font-weight: 600;
  }

  .tab-content {
    padding: 1rem 0;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-field.full-width {
    grid-column: 1 / -1;
  }

  .form-field label {
    font-size: 0.875rem;
    font-weight: 600;
    color: #f1f5f9;
  }

  .form-field input,
  .form-field select,
  .form-field textarea {
    padding: 0.75rem;
    border: 2px solid #475569;
    border-radius: 0.5rem;
    background: #1e293b;
    color: #f1f5f9;
    font-size: 0.875rem;
    transition: border-color 0.2s;
  }

  .form-field input:focus,
  .form-field select:focus,
  .form-field textarea:focus {
    outline: none;
    border-color: #f59e0b;
  }

  .form-field input.error,
  .form-field select.error {
    border-color: #ef4444;
  }

  .error-msg {
    font-size: 0.75rem;
    color: #ef4444;
  }

  .review-section h3 {
    font-size: 1.25rem;
    color: #f1f5f9;
    margin-bottom: 1rem;
  }

  .review-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .review-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    background: #1e293b;
    border-radius: 0.5rem;
    border-left: 3px solid #f59e0b;
  }

  .review-item strong {
    font-size: 0.75rem;
    color: #94a3b8;
    text-transform: uppercase;
  }

  .review-item span {
    color: #f1f5f9;
    font-weight: 500;
  }

  .validation-status {
    padding: 1rem;
    border-radius: 0.5rem;
    text-align: center;
    font-weight: 500;
  }

  .validation-status.valid {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.2);
  }

  .validation-status.invalid {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 1.5rem;
    border-top: 1px solid #475569;
  }

  .btn-primary,
  .btn-secondary {
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-primary {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    color: #0f172a;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #334155;
    color: #f1f5f9;
  }

  .btn-secondary:hover {
    background: #475569;
  }

  @media (max-width: 640px) {
    .form-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .tab-nav {
      flex-wrap: wrap;
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-actions {
      flex-direction: column;
    }

    .btn-primary,
    .btn-secondary {
      width: 100%;
    }
  }
</style>
