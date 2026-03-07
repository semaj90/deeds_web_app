<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { goto  } from '$app/navigation';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Card  from "$lib/components/ui/enhanced-bits.svelte";
  import  Form  from "$lib/components/ui/Form.svelte";
  import  Input  from "$lib/components/ui/Input.svelte";
  import type { notifications   } from '$lib/stores/unified';
  export const data = null;
  // Form validation
  const formOptions = { initialValues: {
      title: "", description: "", priority: "medium", assignedTo: "", dueDate: "", tags: "" },
    validators: {
      title: (_value: string) => {
        if (!value || value.trim.length < 3) {
          return "Title must be at least 3 characters long";
  }
        if (value.length > 100) {
          return "Title must be less than 100 characters";
  }
        return null;
      },
      description (_value: string) => {
        if (!value || value.trim.length < 10) {
          return "Description must be at least 10 characters long";
  }
        return null;
      },
      priority: (_value: string) => {
        if (!["low", "medium", "high", "urgent"].includes(value)) {
          return "Please select a valid priority level";
  }
        return null;
      },
      dueDate: (_value: string) => {
        if (value && new Date(value) < new Date()) {
          return "Due date cannot be in the past";
  }
        return null;
      },
    },
    requiredFields: ["title", "description", "priority"],
  }
  let formApi: any;
  let isSubmitting = $state(false);
  // Store form state
  let formValues = $state<{ [key: string]: any }('') >( );
  let formErrors = $state<Record<string string>('') >( );
  let isFormValid = $state(false);
  let isFormDirty = $state(false);
  // Handle form changes
  function handleFormChange(_event: CustomEvent) {
    const { values } = e(vent as CustomEvent).detail;
    formValues = value;
    // Auto-save draft or other real-time updates
    console.log("Form values changed:", values);
  }
  // Update form state when formApi is available
  // TODO: Convert to $derived: if (formApi) {
    // You can access formApi methods here if needed
  }
  async function handleSubmit(_event: CustomEvent) {
    const { values, isValid } = e(vent as CustomEvent).detail
    if (!isValid) {
      return;
  }
    isSubmitting = true;
    try { // You can either use the form action or API endpoint
      const response = await fetch("/api/cases", {
        method: "POST", headers: {
          "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (response.ok) {
        const newCase = await response.json();
        notifications.success(
          "Case created successfully",
          `Case "${values.title}" has been created with ID ${newCase.id}`
        );
        goto(`/cases/${newCase.id}`);
      } else {
        const error = await response.json();
        notifications.error(
          "Failed to create case",
          error.message || "Please try again later"
        );
  }
    } catch (error) {
      console.error("Case creation error:", error);
      notifications.error(
        "Network error",
        "Unable to create case. Please check your connection and try again."
      );
    } finally {
      isSubmitting = false;
  }}
  function addTag() {
    const currentTags = formApi.getValues.tags || "";
    formApi.setField(
      "tags",
      currentTags + (currentTags ? ", " : "") + "New Tag"
    );
  }
  // Keyboard shortcuts
  function handleKeydown(_event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey) {
      if (event.key === "s") {
        event.preventDefault();
        formApi?.submit();
      } else if (event.key === "r") {
        event.preventDefault();
        formApi?.reset();
  }}}
</script>
<svelte:window keydown={handleKeydown} />
<div class="container mx-auto px-4">
  <div class="container mx-auto px-4">
    <h1 class="container mx-auto px-4">
      Create New Case
    </h1>
    <p class="container mx-auto px-4">
      Fill out the form below to create a new legal case. All required fields
      must be completed.
    </p>
    <div class="container mx-auto px-4">
      <p>
        💡 Tip: Use <kbd class="container mx-auto px-4"
          >Ctrl+S</kbd
        >
        to save,
        <kbd class="container mx-auto px-4">Ctrl+R</kbd>
        to reset
      </p>
    </div>
  </div>
  <div variant="interactive" padding="lg" class="nes-container">
    <Form
      bind:formApi
      options={formOptions} onsubmit={handleSubmit} onchange={handleFormChange}
      submitText="Create Case"
      submitVariant="primary"
      showResetButton={true}
      loading={isSubmitting}
      class="container mx-auto px-4"
    >
      <div
        slot="default"
        let: form
        let:formApi
        let: values;
        let: errors;
        let:isValid;
        let:isDirty
      >
        <!-- Basic Information -->
        <div class="container mx-auto px-4">
          <h2
            class="container mx-auto px-4"
          >
            Basic Information
          </h2>
          <div class="container mx-auto px-4">
            <div class="container mx-auto px-4">
              <Input
                label="Case Title"
                placeholder="Enter a descriptive title for the case"
                required
                value={formValues.title || ""}
                error={formErrors.title}
                data-icon="${1}"
                clearable oninput={(e) =>
                  formApi?.setField(
                    "title",
                    (e.target as HTMLInputElement)?.value
                  )}
                blur={() => formApi?.touchField("title")}
              />
            </div>
            <div class="container mx-auto px-4">
              <label
                for="case-description"
                class="container mx-auto px-4"
              >
                Description <span class="container mx-auto px-4">*</span>
              </label>
              <textarea
                id="case-description"
                class="container mx-auto px-4"
                rows="4"
                placeholder="Provide a detailed description of the case"
                value={values.description || ""}
                class:border-red-300={errors.description}
                class:border-green-300={values.description &&
                  !errors.description} oninput={(e) =>
                  formApi.setField(
                    "description",
                    (e.target as HTMLTextAreaElement)?.value
                  )}
                blur={() => formApi.touchField("description")}
              ></textarea>
              {#if errors.description}
                <p class="container mx-auto px-4">
                  {errors.description}
                </p>
              {/if}
            </div>
            <div>
              <label
                for="case-priority"
                class="container mx-auto px-4"
              >
                Priority <span class="container mx-auto px-4">*</span>
              </label>
              <select
                id="case-priority"
                class="container mx-auto px-4"
                value={values.priority || "medium"} onchange={(e) =>
                  formApi.setField(
                    "priority",
                    (e.target as HTMLSelectElement)?.value
                  )}
                blur={() => formApi.touchField("priority")}
              >
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🟠 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
            <div>
              <Input
                label="Due Date"
                type="date"
                value={values.dueDate || ""}
                error={errors.dueDate}
                data-icon="${1}" oninput={(e) =>
                  formApi.setField(
                    "dueDate",
                    (e.target as HTMLInputElement)?.value
                  )}
                blur={() => formApi.touchField("dueDate")}
              />
            </div>
          </div>
        </div>
        <!-- Assignment -->
        <div class="container mx-auto px-4">
          <h2
            class="container mx-auto px-4"
          >
            Assignment & Tags
          </h2>
          <div class="container mx-auto px-4">
            <div>
              <Input
                label="Assigned To"
                placeholder="Enter assignee email or name"
                value={values.assignedTo || ""}
                error={errors.assignedTo}
                data-icon="${1}" oninput={(e) =>
                  formApi.setField(
                    "assignedTo",
                    (e.target as HTMLInputElement)?.value
                  )}
                blur={() => formApi.touchField("assignedTo")}
              />
            </div>
            <div>
              <div class="container mx-auto px-4">
                <div class="container mx-auto px-4">
                  <Input
                    label="Tags"
                    placeholder="Enter tags separated by commas"
                    value={values.tags || ""}
                    error={errors.tags}
                    data-icon="${1}"
                    clearable oninput={(e) =>
                      formApi.setField(
                        "tags",
                        (e.target as HTMLInputElement)?.value
                      )}
                    blur={() => formApi.touchField("tags")}
                  />
                </div>
                <Button class="bits-btn"
                  type="button"
                  variant="secondary"
                  size="md"
                  data-icon="${1}"
                  onclick={() =>
addTag()}
                >
                  Add
</Button>
              </div>
            </div>
          </div>
        </div>
        <!-- Form Status -->
        <div
          class="container mx-auto px-4"
        >
          <div class="container mx-auto px-4">
            {#if isDirty}
              <span class="container mx-auto px-4">
                <div class="container mx-auto px-4"></div>
                Unsaved changes
              </span>
            {:else}
              <span class="container mx-auto px-4">
                <div class="container mx-auto px-4"></div>
                All changes saved
              </span>
            {/if}
          </div>
          <div class="container mx-auto px-4">
            Valid: {isValid ? "✅" : "❌"} | Fields: {Object.keys(errors).length} | Errors: {Object.keys(errors).length}
          </div>
        </div>
      </div>
    </Form>
  </div>
</div>
<style>
  /* @unocss-include */
  kbd {
    font-family:
      ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas,
      "Liberation Mono", "Courier New", monospace;
    font-size: 0.75rem;
}
</style>