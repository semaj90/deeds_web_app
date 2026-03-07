<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  // Use modular components
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Input
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Button  from "$lib/components/ui/Button.svelte";
  import type { UploadFile } from '$lib/components/ui/modular/types.svelte';
  import  Alert  from "$lib/components/ui/alert/Alert.svelte";
  import  AlertDescription  from "$lib/components/ui/alert/AlertDescription.svelte";
  import  Label  from "$lib/components/ui/label/Label.svelte";
  import 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
   from "$lib/components/ui/select.svelte";
  import  Switch  from "$lib/components/ui/switch/Switch.svelte";
  import  Textarea  from "$lib/components/ui/textarea/Textarea.svelte";
  import type { fileUploadSchema  } from '$lib/schemas/upload';
  import  Form  from "$lib/components/ui/Form.svelte";
  import  FileUpload  from "$lib/components/ui/modular/FileUpload.svelte";
  import type { Binary, CheckCircle, FileText, Film, HardDrive, Image, Music, Upload, X  } from 'lucide-svelte';
  import type { superForm  } from 'sveltekit-superforms';
  import type { zodClient  } from 'sveltekit-superforms/adapters';
  interface Props {
    data: { form: any }
    caseId?: string;
  }

  let { data, caseId = '' }: Props = $props();
  const { form, errors, enhance, submitting, delayed, message } = superForm(data.form, {
    validators: zod(...)fileUploadSchema),
    multipleSubmits: 'prevent',
    onSubmit: ({ formData }) => {
      // Set the file in formData
      if (uploadFiles.length > 0) {
        formData.set('file', uploadFiles[0].file);
      }
    },
  });
  let uploadFiles: UploadFile[] = $state([]);
  let uploadProgress = $state(0);
  // Initialize form with caseId if provided
  $effect(() => {
    if (caseId) {
      $form.caseId = caseId;
    }
  });
  // File type icons
  const fileTypeIcons = {
    document: FileText,
    image: Image,
    video: Film,
    audio: Music,
    physical: HardDrive,
    digital: Binary
  }
  // Handle file changes from FileUpload component
  function handleFilesChange(files: UploadFile[]) {
    uploadFiles = files;
    if (files.length > 0) {
      const file = files[0];
      // Auto-detect file type
      if (file.type.startsWith('image/')) {
        $form.type = 'image';
      } else if (file.type.startsWith('video/')) {
        $form.type = 'video';
      } else if (file.type.startsWith('audio/')) {
        $form.type = 'audio';
      } else if (
        file.type.includes('pdf') ||
        file.type.includes('document') ||
        file.type.includes('text')
      ) {
        $form.type = 'document';
      } else {
        $form.type = 'digital';
      }
      // Set default title from filename
      if (!$form.title) {
        $form.title = file.name.replace(/\.[^/.]+$/, '');
      }
    }
  }
  // Handle file upload progress
  async function handleFileUpload(file: UploadFile): Promise<void> {
    // Simulate upload progress
    const simulateProgress = () => {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 10;
        file.progress = progress;
        uploadFiles = [...uploadFiles]; // Trigger reactivity
        if (progress >= 100) {
          clearInterval(interval);
          file.status = 'completed';
          uploadFiles = [...uploadFiles];
        }
      }, 100);
    }
    file.status = 'uploading';
    file.progress = 0;
    uploadFiles = [...uploadFiles];
    try {
      simulateProgress();
    } catch (error) {
      file.status = 'error';
      file.error = 'Upload failed';
      uploadFiles = [...uploadFiles];
    }
  }
  // Handle file removal
  function handleFileRemove(fileId: string) {
    uploadFiles = uploadFiles.filter(f => f.id !== fileId);
  }
  // Format file size
  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
</script>
<div variant="legal" class="w-full max-w-2xl nes-container">
  {#snippet header()}
    <div class="space-y-2">
      <h3 class="text-xl font-semibold">Upload Evidence</h3>
      <p class="nes-text is-disabled">
        Upload documents, images, videos, or other evidence files for AI analysis
      </p>
    </div>
  {/snippet}
  <Form method="POST" enctype="multipart/form-data" onsubmit={enhance} variant="legal">
    <!-- File Upload Component -->
    <div class="space-y-2">
      <Label for="file">File</Label>
      <FileUpload
        variant="evidence"
        multiple={false}
        maxFiles={1}
        maxSize={50 * 1024 * 1024}
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mp3,.wav"
        bind:files={uploadFiles}
        fileschange={handleFilesChange}
        upload={handleFileUpload}
        remove={handleFileRemove}
        dragDropText="Drop evidence files here or click to browse"
        browseText="Browse Evidence Files"
        supportedFormats={['PDF', 'Word', 'Images', 'Video', 'Audio']}
      />
      {#if $errors.file}
        <span class="text-sm text-destructive">{$errors.file}</span>
      {/if}
    </div>
        <!-- Title -->
        <Input
          id="title"
          name="title"
          bind:value={$form.title}
          variant="legal"
          label="Title"
          placeholder="Enter evidence title"
          state={$errors.title ? 'error' : 'default'}
          errorMessage={$errors.title}
          required
        />
        <!-- Description -->
        <div class="space-y-2">
          <Label for="description">Description (Optional)</Label>
          <Textarea
            id="description"
            name="description"
            bind:value={$form.description}
            placeholder="Describe the evidence..."
            rows={3} />
        </div>
        <!-- Type Selection -->
        <div class="space-y-2">
          <Label for="type">Evidence Type</Label>
          <Select name="type" bind:value={$form.type}>
            <SelectTrigger>
              <SelectValue placeholder="Select evidence type" />
            </SelectTrigger>
            <SelectContent>
              {#each Object.entries(fileTypeIcons) as [value, Icon]}
                <SelectItem {value}>
                  <div class="flex items-center gap-2">
                    <Icon class="h-4 w-4" />
                    <span class="capitalize">{value}</span>
                  </div>
                </SelectItem>
              {/each}
            </SelectContent>
          </Select>
          {#if $errors.type}
            <span class="text-sm text-destructive">{$errors.type}</span>
          {/if}
        </div>
        <!-- Case ID (hidden if provided) -->
        {#if !caseId}
          <Input
            id="caseId"
            name="caseId"
            bind:value={$form.caseId}
            variant="legal"
            label="Case ID"
            placeholder="Enter case ID"
            state={$errors.caseId ? 'error' : 'default'}
            errorMessage={$errors.caseId}
            required
          />
        {:else}
          <input type="hidden" name="caseId" value={caseId} />
        {/if}
        <!-- Options -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <Label for="aiAnalysis" class="flex-1">
              Enable AI Analysis
              <span class="block text-sm font-normal nes-text is-disabled">
                Extract text, generate embeddings, and summarize content
              </span>
            </Label>
            <Switch id="aiAnalysis" name="aiAnalysis" bind:checked={$form.aiAnalysis} />
          </div>
          <div class="flex items-center justify-between">
            <Label for="isPrivate" class="flex-1">
              Private Evidence
              <span class="block text-sm font-normal nes-text is-disabled">
                Only visible to you and case administrators
              </span>
            </Label>
            <Switch id="isPrivate" name="isPrivate" bind:checked={$form.isPrivate} />
          </div>
        </div>
        <!-- Success/Error Messages -->
        {#if $message}
          <Alert variant={$message.type === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>
              {#if $message.type === 'success'}
                <CheckCircle class="h-4 w-4 inline mr-2" />
              {/if}
              {$message.text}
            </AlertDescription>
          </Alert>
        {/if}
        <!-- Submit Button -->
        <Button
          type="submit"
          disabled={$submitting || uploadFiles.length === 0}
          variant="evidence"
          size="lg"
          class="w-full bits-btn bits-btn"
          loading={$submitting}
        >
{#snippet children()}
            {#if $submitting}
              Uploading Evidence...
            {:else}
              <Upload class="mr-2 h-4 w-4" />
              Upload Evidence
            {/if}
          {/snippet}
  </Form>
</div>
<!-- TODO: migrate export lets to $props(); CommonProps assumed. -->