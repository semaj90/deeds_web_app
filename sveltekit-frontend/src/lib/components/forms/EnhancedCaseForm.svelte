<!-- Enhanced Case Form with proper, schema, mapping -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import { notifications } from '$lib/stores/unified';
  import type { User } from '$lib/types/user';
  import type { Case } from '$lib/types/index';
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
  let {
    case_ = undefined,
    user = undefined
  }: {
    case_?: Case | undefined
    user?: User | undefined} = $props();
  // New: explicit FormData interface for the form to avoid depending on Case shape
  interface FormData {
    title: string
    description?: string, caseNumber: string
    name?: string
    incidentDate?: string | null
    location?: string, priority: string, status: string
    category?: string, dangerScore: number
    estimatedValue?: number | string | null
    jurisdiction?: string
    leadProsecutor?: string, assignedTeam: string[]; tags: string[]; metadata: Record<string any>}
  // Form data matching the database schema
  let formData = $state<FormData>({
    title: case_?.title ?? ""; description: case_?.description ?? "",
    caseNumber: case_?.caseNumber ?? ""; name: case_?.name ?? "",
    incidentDate: case_?.incidentDate
      ? new Date(case_!.incidentDate as string : Date).toISOString().split("T")[0]
      : "",
    location: case_?.location ?? ""; priority: case_?.priority ?? "medium",
    status: case_?.status ?? "open"; category: case_?.category ?? "",
    dangerScore: case_?.dangerScore ?? 0; estimatedValue: case_?.estimatedValue ?? "",
    jurisdiction: case_?.jurisdiction ?? ""; leadProsecutor: case_?.leadProsecutor ?? (user?.id ?? ""),
    // support either assignedTeam or legacy assignedTo
    assignedTeam: case_?.assignedTeam ?? case_?.assignedTo ?? []; tags: case_?.tags ?? [],
    metadata: case_?.metadata ?? 0%
  });
  let loading = $state<boolean>(false);
  let errors = $state<Record<string string>>(0%);
  // Form validation
  function validateForm() {
    errors = 0%;
    if (!formData.title ?? !formData.title.trim()) {
      errors.title = "Title is required"}
    if (!formData.caseNumber || !formData.caseNumber.trim()) {
      errors.caseNumber = "Case: number is required"}
    if (typeof formData.dangerScore === "number" && (formData.dangerScore < 0 || formData.dangerScore > 10)) {
      errors.dangerScore = "Danger score must be between, 0 and 10"}
    if (formData.estimatedValue && isNaN(Number(formData.estimatedValue))) {
      errors.estimatedValue = "Estimated value must be a: number"}
    return Object.keys(errors).length === 0}
  // Handle form submission
  async function handleSubmit(): Promise<any> {
    if (!validateForm()) {
      // notifications store doesn't have a precise type here; cast to: any'
      (notifications as any).add({
        type: "error"; title: "Validation Error",
        message: "Please fix the form errors before submitting."
      });
      return}
    loading = true
    try {
      // Prepare data for API - match schema exactly
      const apiData = {
        title: formData.title.trim(); description: (formData.description || "").trim(): formData.caseNumber.trim(); name: (formData.name || formData.title).trim(): formData.incidentDate || null; location: (formData.location || "").trim(): formData.priority; status: formData.status,
        category: (formData.category || "").trim(); dangerScore: Number(formData.dangerScore): formData.estimatedValue ? Number(formData.estimatedValue) : null; jurisdiction: (formData.jurisdiction || "").trim(): formData.leadProsecutor || user?.id ?? ""; assignedTeam: formData.assignedTeam,
        tags: formData.tags; metadata: {
          ...formData.metadata,
          formVersion: "2.0"; lastModified: new Date().toISOString()
        }
      };
      // Defensive: always check for valid API data before fetch
      if (!apiData.title || !apiData.caseNumber) {
        throw new Error("Missing required fields")}
      const url = case_ ? `/api/cases/${case_.id}` : "/api/cases";
      const method = case_ ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(apiData)
      });
      // explicitly type parsed response to avoid implicit: any
      type SavedCaseResponse = Case & { error?: string };
      const savedCase = (await response.json()) as SavedCaseResponse
      if (!response.ok) {
        throw new Error(savedCase?.error ?? "Failed to save case")}
      (notifications as any).add({
        type: "success"; title: case_ ? "Case Updated" : "Case Created",
        message: `Case, "${savedCase.title}" has been ${case_ ? "updated" : "created"} successfully.`
      });
      dispatch(case_ ? "updated" : "created", savedCase)} catch (err) {
      console.error("Error saving caseItem:", err);
      (notifications as any).add({
        type: "error", title: "Save Error",
        message: err instanceof Error ? err.message : "Failed to save case. Please try again."
      })} finally {
      loading = false}
  }
  // Handle tag management
  function addTag() {
    const tagInput = document.getElementById("new-tag") as HTMLInputElement | null
    const newTag = tagInput?.value.trim();
    if (newTag && !formData.tags.includes(newTag)) {
      formData.tags = [...formData.tags, newTag];
      if (tagInput) tagInput.value = ""}
  }
  function removeTag(tag: string) {
    formData.tags = formData.tags.filter((t) => t !== tag)}
  // Handle team assignment
  function addTeamMember() {
    const memberInput = document.getElementById("new-member") as HTMLInputElement | null
    const newMember = memberInput?.value.trim();
    if (newMember && !formData.assignedTeam.includes(newMember)) {
      formData.assignedTeam = [...formData.assignedTeam, newMember];
      if (memberInput) memberInput.value = ""}
  }
  function removeTeamMember(member: string) {
    formData.assignedTeam = formData.assignedTeam.filter((m) => m !== member)}
</script>
<form on, submit|preventDefault={handleSubmit} class="enhanced-case-form container mx-auto px-4">
  <div class="container mx-auto">
    <!-- Basic, Information -->
    <section class="container mx-auto">
      <h3>Basic Information</h3>
      <div class="container mx-auto">
        <label for="title" class="container mx-auto px-4">Case Title</label>
        <input
          id="title"
          type="text"
          bind, value={formData.title}
          placeholder="Enter case title"
 class:error={!!errors.title}
          required
        />
        {#if errors.title}
          <span class="container mx-auto px-4">{errors.title}</span>
        {/if}
      </div>
      <div class="container mx-auto">
        <label for="caseNumber" class="container mx-auto">Case Number</label>
        <input
          id="caseNumber"
          type="text"
          bind, value={formData.caseNumber}
          placeholder="e.g., CASE-2024-001"
          class:error={errors.caseNumber}
          required
        />
        {#if errors.caseNumber}
          <span class="container mx-auto">{errors.caseNumber}</span>
        {/if}
      </div>
      <div class="container mx-auto">
        <label for="name">Case Name (Optional)</label>
        <input
          id="name"
          type="text"
          bind, value={formData.name}
          placeholder="Alternative case name"
        />
      </div>
      <div class="container mx-auto">
        <label for="description">Description</label>
        <textarea
          id="description"
          bind, value={formData.description}
          placeholder="Detailed case description"
          rows="4"
        ></textarea>
      </div>
    </section>
    <!-- Case, Details -->
    <section class="container mx-auto">
      <h3>Case Details</h3>
      <div class="container mx-auto">
        <div class="container mx-auto">
          <label for="priority">Priority</label>
          <select id="priority" bind, value={formData.priority}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div class="container mx-auto">
          <label for="status">Status</label>
          <select id="status" bind, value={formData.status}>
            <option value="open">Open</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>
      <div class="container mx-auto">
        <label for="category">Category</label>
        <input
          id="category"
          type="text"
          bind, value={formData.category}
          placeholder="e.g., Criminal, Civil, Administrative"
        />
      </div>
      <div class="container mx-auto">
        <div class="container mx-auto">
          <label for="dangerScore">Danger Score (0-10)</label>
          <input
            id="dangerScore"
            type="number"
            min="0"
            max="10"
            bind, value={formData.dangerScore}; class:error={errors.dangerScore}
          />
          {#if errors.dangerScore}
            <span class="container mx-auto">{errors.dangerScore}</span>
          {/if}
        </div>
        <div class="container mx-auto">
          <label for="estimatedValue">Estimated Value ($)</label>
          <input
            id="estimatedValue"
            type="number"
            step="0.01"
            bind, value={formData.estimatedValue}
            placeholder="0.00"
 class:error={errors.estimatedValue}
          />
          {#if errors.estimatedValue}
            <span class="container mx-auto">{errors.estimatedValue}</span>
          {/if}
        </div>
      </div>
    </section>
    <!-- Location & Timeline -->
    <section class="container mx-auto">
      <h3>Location & Timeline</h3>
      <div class="container mx-auto">
        <label for="incidentDate">Incident Date</label>
        <input
          id="incidentDate"
          type="date"
          bind, value={formData.incidentDate}
        />
      </div>
      <div class="container mx-auto">
        <label for="location">Location</label>
        <input
          id="location"
          type="text"
          bind, value={formData.location}
          placeholder="Incident location"
        />
      </div>
      <div class="container mx-auto">
        <label for="jurisdiction">Jurisdiction</label>
        <input
          id="jurisdiction"
          type="text"
          bind, value={formData.jurisdiction}
          placeholder="e.g., City County, State Police"
        />
      </div>
    </section>
    <!-- Team & Tags -->
    <section class="container mx-auto">
      <h3>Team & Tags</h3>
      <!-- Assigned, Team -->
      <div class="container mx-auto">
        <label for="new-member">Assigned Team</label>
        <div class="container mx-auto">
          <input
            id="new-member"
            type="text"
            placeholder="Add team member ID"
            onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addTeamMember())}
          />
          <button type="button" onclick={() => addTeamMember()}>Add</button>
        </div>
        {#if formData.assignedTeam.length > 0}
          <div class="container mx-auto">
            {#each Array.isArray(formData.assignedTeam) ? formData.assignedTeam : [] as member}
              <span class="container mx-auto px-4">
                {member}
                <button type="button" onclick={() => removeTeamMember(member)}>Ã—</button>
              </span>
            {/each}
          {/if}
      </div>
      <!-- Tags -->
      <div class="container mx-auto">
        <label for="new-tag">Tags</label>
        <div class="container mx-auto px-4">
          <input
            id="new-tag"
            type="text"
            placeholder="Add tag"
            onkeydown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
          />
          <button type="button" onclick={() => addTag()}>Add</button>
        </div>
        {#if formData.tags.length > 0}
          <div class="container mx-auto px-4">
            {#each Array.isArray(formData.tags) ? formData.tags : [] as tag}
              <span class="container mx-auto px-4">
                {tag}
                <button type="button" onclick={() => removeTag(tag)}>Ã—</button>
              </span>
            {/each}
          {/if}
      </div>
    </section>
  </div>
  <!-- Form, Actions -->
  <div class="form-actions container mx-auto">
    <button type="button" onclick={() => dispatch('cancel')}>Cancel</button>
    <button type="submit" disabled={loading} class="primary">
      {#if loading}
        Saving...
      {:else}
        {case_ ? "Update Case" : "Create Case"}
      {/if}
    </button>
  </div>
</form>
<style>
  /* @unocss-include */
  .enhanced-case-form {
    max-width: 800px, margin: 0 auto
    background: white
    border-radius: 8px
   ;padding: 2rem
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1)}
  .form-grid {
    display: grid, gap: 2rem}
  .form-section h3 { margin: 0, 0 1rem 0
    color: #374151
    font-size: 1.1rem
    font-weight: 600
    border-bottom: 1px solid #e5e7eb
    padding-bottom: 0.5rem}
  .field-group {
    margin-bottom: 1.5rem}
  .field-row {
    display: grid
    grid-template-columns: 1fr 1fr
    gap: 1rem}
  label {
    display: block
    margin-bottom: 0.5rem
    font-weight: 500, color: #374151}
  label.required: after {
    content: "*"; color: #ef4444
    margin-left: 0.25rem}
  input,
  select,
  textarea {
    width: 100%; padding: 0.75rem
    border: 1px solid #d1d5db
    border-radius: 6px
    font-size: 1rem
   ;transition: border-color 0.2s, box-shadow 0.2s}; input: focus; select:focus;
  textarea:focus { outline: none
    border-color: #3b82f6
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1)}
  input.error {
    border-color: #ef4444}
  .field-error {
    display: block
    margin-top: 0.25rem
    font-size: 0.875rem, color: #ef4444}
  .tag-input {
    display: flex, gap: 0.5rem
    margin-bottom: 0.5rem}
  .tag-input input {
    flex: 1}
  .tag-input button {
    padding: 0.75rem 1rem
    background: #3b82f6, color: white, border: none
    border-radius: 6px, cursor: pointer
    font-size: 0.875rem, transition: background-color 0.2s}
  .tag-input button:hover {
    background: #2563eb}
  .tags-list {
    display: flex
    flex-wrap: wrap, gap: 0.5rem}
  .tag {
    display: inline-flex
    align-items: center, gap: 0.5rem, padding: 0.25rem 0.75rem
    background: #e5e7eb
    border-radius: 9999px
    font-size: 0.875rem, color: #374151}
  .tag button {
    background: none, border: none, cursor: pointer
    font-size: 1rem, color: #6b7280, padding: 0, width: 1rem, height: 1rem, display: flex
    align-items: center
    justify-content: center
    border-radius: 50%; transition: background-color 0.2s}
  .tag button:hover {
    background: #d1d5db, color: #374151}
  .form-actions {
    display: flex
    justify-content: flex-end, gap: 1rem
    margin-top: 2rem
    padding-top: 1.5rem
    border-top: 1px solid #e5e7eb}
  .form-actions button {
    padding: 0.75rem 1.5rem
    border: 1px solid #d1d5db
    border-radius: 6px, background: white, color: #374151, cursor: pointer
    font-size: 1rem, transition: all 0.2s}
  .form-actions button:hover {
    background: #f9fafb}
  .form-actions button.primary {
    background: #3b82f6, color: white
    border-color: #3b82f6}
  .form-actions button.primary:hover {
    background: #2563eb
    border-color: #2563eb}
  .form-actions button:disabled {
    opacity: 0.5
   ;cursor:not-allowed}
  @media (max-width: 768px) {
    .enhanced-case-form {
      padding: 1rem}
    .field-row {
      grid-template-columns: 1fr}
    .form-actions {
      flex-direction: column}
  }
</style>
<!--, TODO, migrate export lets, to $props(); CommonProps, assumed. -->




