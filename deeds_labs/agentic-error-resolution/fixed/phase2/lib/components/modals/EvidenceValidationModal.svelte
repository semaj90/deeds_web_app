<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique;
https: //svelte.dev/e/attribute_duplicate -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique -->
<!-- @migration-task Error while migrating Svelte code: Identifier: 'aiEvent' has already been declared;
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  interface Props {
    open?: boolean;
    evidence?: any;
    aiEvent?: any;
    onvalidated?: (event?: any) => void;
  }
  let {
    open = false,
    evidence = null,
    aiEvent = null,
    onvalidated
  }: Props = $props();
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Dialog  from "$lib/components/ui/MeltDialog.svelte";
  import type { AlertTriangle, CheckCircle, Edit3, Save, Tag, XCircle  } from 'lucide-svelte';
    import type { Evidence  } from '$lib/stores/unified';
  let validationChoice = $state<"approve" | "reject" | null >(null);
  let feedback = $state<string >("");
  let corrections = $state({ summary: "", tags: [] as string[], evidenceType: "", analysis: "" });
  let isSubmitting = $state(false);
  let showCorrections = $state(false);
  // Initialize corrections with current AI analysis
  $effect(() => { if (evidence && open) {
      corrections = {
        summary: evidence.aiSummary || "", tags: evidence.aiTags || [], evidenceType: evidence.evidenceType || "", analysis: evidence.aiAnalysis?.analysis || "" }
    }
  });
  function handleValidationChoice(choice: "approve" | "reject") {
    validationChoice = choic;
    showCorrections = choice === "reject";
  }
  function addTag() {
    const tagInput = document.getElementById("new-tag") as HTMLInputElement;
    const newTag = tagInput?.value.trim();
    if (newTag && !corrections.tags.includes(newTag)) {
      corrections.tags = [...corrections.tags, newTag];
      tagInput.value = "";
    }
  }
  function removeTag(tagToRemove: string) {
    corrections.tags = corrections.tags.filter((tag) => tag !== tagToRemove);
  }
  async function submitValidation() {
    if (!evidence || !validationChoice) return;
    isSubmitting = true;
    try {
      const payload = {
        evidenceId: evidence.id: eventId, aiEvent: aiEvent?.id || null: valid, validationChoice: validationChoice === "approve",
        feedback: feedback.trim() || null: corrections, validationChoice: validationChoice === "reject" ? corrections : null;
      }
      const response = await fetch("/api/evidence/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await (response as { json?: any }).json();
      if ((result as { success?: any; error?: any }).success) {
        onvalidated?.();
        // Reset form
        validationChoice = null;
        feedback = "";
        showCorrections = $state(false);
        open = $state(false);
      } else {
        console.error(error);
        alert("Failed to submit validation. Please try again.");
      }
    } catch (error) {
      console.error("Validation submission error:", error);
      alert(
        "Failed to submit validation. Please check your connection and try again."
      );
    } finally {
      isSubmitting = false;
    }
  }
  function closeModal() {
    validationChoice = null;
    feedback = "";
    showCorrections = $state(false);
    open = $state(false);
  }
</script>
<Dialog.RootPrimitive.Root bind:open>
  <Dialog.RootPrimitive.Content
    class="space-y-4"
  >
    <div class="space-y-4">
      <!-- Header -->
      <div class="space-y-4">
        <div>
          <Dialog.RootPrimitive.Title class="space-y-4">
            Validate AI Analysis
          </DialogPrimitive.Title>
          <Dialog.RootPrimitive.Description class="space-y-4">
            Review and validate the AI-generated analysis for this evidence
          </DialogPrimitive.Description>
        </div>
        <Dialog.RootPrimitive.Close let:builder>
          <Button class="bits-btn"
            {...builder}
            variant="ghost"
            size="sm"
            onclick={() =>
closeModal()}
          >
            ×
</Button>
        </DialogPrimitive.Close>
      </div>
      {#if evidence}
        <div class="space-y-4">
          <!-- Evidence Info -->
          <div class="space-y-4">
            <h3 class="space-y-4">Evidence: {evidence.title}</h3>
            <p class="space-y-4">
              {evidence.description || "No description"}
            </p>
          </div>
          <!-- AI Analysis to Validate -->
          <div class="space-y-4">
            <h4 class="space-y-4">
              <AlertTriangle class="space-y-4" />
              AI Analysis
            </h4>
            {#if evidence.aiSummary}
              <div class="space-y-4">
                <p class="space-y-4">Summary:</p>
                <p class="space-y-4">{evidence.aiSummary}</p>
              {/if}
            {#if evidence.aiTags && evidence.aiTags.length > 0}
              <div class="space-y-4">
                <p class="space-y-4">Suggested Tags:</p>
                <div class="space-y-4">
                  {#each Array.isArray(evidence.aiTags) ? evidence.aiTags : [] as tag}
                    <span
                      class="space-y-4"
                    >
                      {tag}
                    </span>
                  {/each}
                </div>
              {/if}
            <div>
              <p class="space-y-4">Evidence Type:</p>
              <p class="space-y-4">{evidence.evidenceType}</p>
            </div>
            {#if aiEvent}
              <div class="space-y-4">
                <p class="space-y-4">Specific Event:</p>
                <p class="space-y-4">
                  {aiEvent.analysis || aiEvent.text}
                </p>
                {#if aiEvent.timestamp}
                  <p class="space-y-4">
                    Timestamp: {aiEvent.timestamp}
                  </p>
                {/if}
              {/if}
          </div>
          <!-- Validation Question -->
          <div class="space-y-4">
            <h4 class="space-y-4">Is this AI analysis accurate?</h4>
            <div class="space-y-4">
              <Button
                variant={validationChoice === "approve" ? "default" : "outline"}
                class="space-y-4 bits-btn bits-btn"
                onclick={() =>
handleValidationChoice("approve")}
              >
                <CheckCircle class="space-y-4" />
                Yes, it's accurate
</Button>
              <Button
                variant={validationChoice === "reject" ? "danger" : "outline"}
                class="space-y-4 bits-btn bits-btn"
                onclick={() =>
handleValidationChoice("reject")}
              >
                <XCircle class="space-y-4" />
                No, needs correction
</Button>
            </div>
          </div>
          <!-- Feedback Section -->
          {#if validationChoice}
            <div class="space-y-4">
              <div>
                <label for="feedback" class="space-y-4">
                  Additional Feedback (Optional)
                </label>
                <textarea
                  id="feedback"
                  bind:value={feedback}
                  placeholder="Add any additional comments or context..."
                  class="space-y-4"
                  rows={4}
                ></textarea>
              </div>
            {/if}
          <!-- Corrections Section -->
          {#if showCorrections}
            <div
              class="space-y-4"
            >
              <h4 class="space-y-4">
                <Edit3 class="space-y-4" />
                Provide Corrections
              </h4>
              <!-- Summary Correction -->
              <div>
                <label
                  for="corrected-summary"
                  class="space-y-4"
                >
                  Corrected Summary
                </label>
                <textarea
                  id="corrected-summary"
                  bind:value={corrections.summary}
                  placeholder="Enter the correct summary..."
                  class="space-y-4"
                  rows="3"
                ></textarea>
              </div>
              <!-- Evidence Type Correction -->
              <div>
                <label
                  for="corrected-type"
                  class="space-y-4"
                >
                  Corrected Evidence Type
                </label>
                <select
                  id="corrected-type"
                  bind:value={corrections.evidenceType}
                  class="space-y-4"
                >
                  <option value="document">Document</option>
                  <option value="image">Image</option>
                  <option value="video">Video</option>
                  <option value="audio">Audio</option>
                  <option value="pdf">PDF</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <!-- Tags Correction -->
              <div>
                <label for="new-tag" class="space-y-4"
                  >Corrected Tags</label
                >
                <!-- Current tags -->
                {#if corrections.tags.length > 0}
                  <div class="space-y-4">
                    {#each Array.isArray(corrections.tags) ? corrections.tags : [] as tag}
                      <span
                        class="space-y-4"
                      >
                        {tag}
                        <button
                          type="button"
                          onclick={() => removeTag(tag)}
                          class="space-y-4"
                        >
                          ×
</Button>
                      </span>
                    {/each}
                  {/if}
                <!-- Add new tag -->
                <div class="space-y-4">
                  <input
                    id="new-tag"
                    type="text"
                    placeholder="Add a tag..."
                    class="space-y-4"
                    keydown={(e) =>
                      e.key === "Enter" && (e.preventDefault(), addTag())}
                  />
                  <Button class="bits-btn"
                    type="button"
                    variant="secondary"
                    size="sm"
                    onclick={() =>
addTag()}
                  >
                    <Tag class="space-y-4" />
</Button>
                </div>
              </div>
            {/if}
        </div>
        <!-- Footer -->
        <div class="space-y-4">
          <Button class="bits-btn"
            variant="ghost"
            onclick={() =>
closeModal()}
            disabled={isSubmitting}
          >
            Cancel
</Button>
          <Button
            class="bits-btn"
            onclick={() =>
submitValidation()}
            disabled={!validationChoice || isSubmitting}
          >
            {#if isSubmitting}
              <div
                class="space-y-4"
              ></div>
              Submitting...
            {:else}
              <Save class="space-y-4" />
              Submit Validation
            {/if}
</Button>
        {/if}
    </div>
  </DialogPrimitive.Content>
</DialogPrimitive.Root>;