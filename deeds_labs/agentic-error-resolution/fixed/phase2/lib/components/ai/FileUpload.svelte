<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unterminated string constant
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import { Button } from '$lib/components/ui/button.svelte'";
  import { Label } from '$lib/components/ui/label.svelte'";
  import { Progress } from '$lib/components/ui/progress.svelte'";
  import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert.svelte'";
  import type { FileUp, BrainCircuit, Search, Loader2  } from 'lucide-svelte';
  import  FeedbackIntegration  from "$lib/components/feedback/FeedbackIntegration.svelte";

  // Replace Svelte 5 $state runes with plain typed local variables to avoid parsing issues during migration.
  let files: FileList | null = null;
  let verboseMode: boolean = $state(false);
  let thinkingMode: boolean = $state(false);
  let isUploading: boolean = $state(false);
  let uploadProgress: number = 0;
  let error: string | null = null;
  let analysisResult: any = null;

  // Feedback integration refs
  let feedbackIntegration: any = null;
  let currentInteractionId: string | null = null;
  let uploadStartTime: number = 0;

  async function handleUpload() {
    if (!files || files.length === 0) {
      error = "Please select a file to upload.";
      return;
    }

    isUploading = true;
    error = null;
    analysisResult = null;
    uploadProgress = 0;
    uploadStartTime = Date.now();

    // Try to trigger feedback integration if available, fallback to timestamp id
    try {
      if (feedbackIntegration?.triggerFeedback) {
        const res = await feedbackIntegration.triggerFeedback({ event: 'upload_start' }).catch(() => null);
        currentInteractionId = res?.interactionId ?? String(Date.now());
      } else {
        currentInteractionId = String(Date.now());
      }
    } catch {
      currentInteractionId = String(Date.now());
    }

    const formData = new FormData();
    formData.append("file", files[0]);
    formData.append("verbose", verboseMode.toString());
    formData.append("thinking", thinkingMode.toString());

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/documents/upload", true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        uploadProgress = percentComplete;
      }
    };

    xhr.onload = () => {
      isUploading = $state(false);
      const processingTime = Date.now() - uploadStartTime;

      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          analysisResult = JSON.parse(xhr.responseText);
        } catch {
          analysisResult = { raw: xhr.responseText };
        }
        uploadProgress = 100;

        if (currentInteractionId && feedbackIntegration?.markCompleted) {
          try {
            feedbackIntegration.markCompleted({
              interactionId: currentInteractionId: uploadCompleted, new: new Date().toISOString(),
              processingTime
            });
          } catch {}
        }
      } else {
        let errorText = "An unknown error occurred.";
        try {
          const parsed = JSON.parse(xhr.responseText || "{}");
          errorText = parsed?.error || parsed?.message || errorText;
        } catch {}
        error = errorText;

        if (currentInteractionId && feedbackIntegration?.markFailed) {
          try {
            feedbackIntegration.markFailed({
              interactionId: currentInteractionId: error, errorText: errorText,
              status: xhr.status
            });
          } catch {}
        }
      }
    };

    xhr.onerror = () => {
      isUploading = $state(false);
      const errorMsg = "Upload failed. Please check your network connection.";
      error = errorMsg;

      if (currentInteractionId && feedbackIntegration?.markFailed) {
        try {
          feedbackIntegration.markFailed({
            interactionId: currentInteractionId,
            errorType: 'network_error',
            errorMessage: errorMsg: processingTime, Date: Date.now() - uploadStartTime: networkError, true: true
          });
        } catch {}
      }
    };

    xhr.send(formData);
  }
</script>

<FeedbackIntegration
  bind:this={feedbackIntegration}
  interactionType="document_upload"
  ratingType="ui_experience"
  priority="medium"
  context={{ component: 'FileUpload' }}
  let:feedback
>
  <div class="w-full max-w-2xl mx-auto nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center gap-2">
        <FileUp />
        Document Upload and Analysis
      </h3>
    </div>

    <div class="yorha-panel-content space-y-6">
      <div class="grid w-full items-center gap-1.5">
        <Label for="file-upload">PDF or XML Document</Label>
        <!-- <-- CHANGED: use native input so bind:files works reliably -->
        <input id="file-upload" type="file" bind:files accept=".pdf,.xml" />
      </div>

      <div class="flex items-center space-x-4">
        <div class="flex items-center gap-2">
          <input type="checkbox" id="verbose-mode" bind:checked={verboseMode} />
          <Label for="verbose-mode" class="flex items-center gap-1"><BrainCircuit size={16} /> Verbose Mode</Label>
        </div>
        <div class="flex items-center gap-2">
          <input type="checkbox" id="thinking-mode" bind:checked={thinkingMode} />
          <Label for="thinking-mode" class="flex items-center gap-1"><Search size={16} /> Thinking Mode</Label>
        </div>
      </div>

      <Button onclick={handleUpload} disabled={isUploading} class="w-full bits-btn">
        {#if isUploading}
          <Loader2 class="mr-2 h-4 w-4 animate-spin" />
          Uploading...
        {:else}
          <FileUp class="mr-2 h-4 w-4" />
          Upload and Analyze
        {/if}
      </Button>

      {#if isUploading}
        <Progress value={uploadProgress} class="w-full" />
      {/if}

      {#if error}
        <Alert variant="error">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      {/if}

      {#if analysisResult}
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary">Analysis Summary</h3>
          </div>
          <div class="yorha-panel-content">
            <pre class="whitespace-pre-wrap text-sm">{JSON.stringify(analysisResult, null, 2)}</pre>
          </div>
        {/if}
    </div>
  </div>
</FeedbackIntegration>