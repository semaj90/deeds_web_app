<script lang="ts">
import Alert from "$lib/components/ui/alert/Alert.svelte";
import AlertDescription from "$lib/components/ui/alert/AlertDescription.svelte";
import { Button } from "$lib/components/ui/button";
import { Input } from '$lib/components/ui/input';
import Label from "$lib/components/ui/label/Label.svelte";
import FileUpload from "$lib/components/ui/modular/FileUpload.svelte";
import type { UploadFile } from '$lib/components/ui/modular/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "$lib/components/ui/select";
import Switch from "$lib/components/ui/switch";
import Textarea from "$lib/components/ui/textarea/Textarea.svelte";
import { fileUploadSchema } from '$lib/schemas/upload';
import Binary from 'lucide-svelte/icons/binary';
import CheckCircle from 'lucide-svelte/icons/check-circle';
import FileText from 'lucide-svelte/icons/file-text';
import Film from 'lucide-svelte/icons/film';
import HardDrive from 'lucide-svelte/icons/hard-drive';
import Image from 'lucide-svelte/icons/image';
import Music from 'lucide-svelte/icons/music';
import Upload from 'lucide-svelte/icons/upload';
import { zodClient } from 'sveltekit-superforms/adapters';
import { superForm } from 'sveltekit-superforms/client';

interface Props { data: { form: any };
  caseId?: string;
}

let { data, caseId = '' }: Props = $props();

const { form, errors, enhance, submitting, delayed, message } = superForm(data.form, {
  validators: zodClient(fileUploadSchema),
  multipleSubmits: 'prevent',
  onSubmit: ({ formData }) => {
    // Set the file in formData
    if (uploadFiles.length > 0) {
      formData.set('file', uploadFiles[0].file);
    }
  }
});

let uploadFiles = $state<UploadFile[]>([]);
let uploadProgress = $state<number>(0);

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
};

// Handle file changes from FileUpload component
function handleFilesChange(files: UploadFile[]) {
  uploadFiles = files;
  if (files.length > 0) {
    const file = files[0];
    // Auto-detect file type
    if (file.type.startsWith('image/')) { $form.type = 'image'; }
    else if (file.type.startsWith('video/')) { $form.type = 'video'; }
    else if (file.type.startsWith('audio/')) { $form.type = 'audio'; }
    else if (file.type.includes('pdf') || file.type.includes('document') || file.type.includes('text')) { $form.type = 'document'; }
    else { $form.type = 'digital'; }

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
  };

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

<div class="w-full max-w-2xl">
  {#snippet header()}
    <div class="space-y-2">
      <h3 class="text-xl">Upload Evidence</h3>
      <p class="text-muted-foreground">
        Upload documents, images, videos, or other evidence files for AI analysis
      </p>
    </div>
  {/snippet}

  <form method="POST" enctype="multipart/form-data" use:enhance class="space-y-6">
    <!-- File Upload Component -->
    <div class="space-y-2">
      <Label htmlFor="file">File</Label>
      <FileUpload
        multiple={false}
        maxFiles={1}
        maxSize={50 * 1024 * 1024}
        accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.mp3,.wav"
        bind:files={uploadFiles}
        on:fileschange={(e) => handleFilesChange(e.detail)}
        on:upload={(e) => handleFileUpload(e.detail)}
        on:remove={(e) => handleFileRemove(e.detail)}
        dragDropText="Drop evidence files here or click to browse"
        browseText="Browse Evidence Files"
        supportedFormats={['PDF', 'Word', 'Images', 'Video', 'Audio']}
      />
      {#if $errors.file}
        <span class="text-sm text-red-500">{$errors.file}</span>
      {/if}
    </div>

    <!-- Title -->
    <div class="space-y-2">
      <Label htmlFor="title">Title</Label>
      <Input
        id="title"
        name="title"
        bind:value={$form.title}
        placeholder="Enter evidence title"
        required
      />
      {#if $errors.title}
        <span class="text-sm text-red-500">{$errors.title}</span>
      {/if}
    </div>

    <!-- Description -->
    <div class="space-y-2">
      <Label htmlFor="description">Description (Optional)</Label>
      <Textarea
        id="description"
        name="description"
        bind:value={$form.description}
        placeholder="Describe the evidence..."
        rows={3}
      />
    </div>

    <!-- Type Selection -->
    <div class="space-y-2">
      <Label htmlFor="type">Evidence Type</Label>
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
        <span class="text-sm text-red-500">{$errors.type}</span>
      {/if}
    </div>

    <!-- Case ID -->
    {#if !caseId}
      <div class="space-y-2">
        <Label htmlFor="caseId">Case ID</Label>
        <Input
          id="caseId"
          name="caseId"
          bind:value={$form.caseId}
          placeholder="Enter case ID"
          required
        />
        {#if $errors.caseId}
          <span class="text-sm text-red-500">{$errors.caseId}</span>
        {/if}
      </div>
    {:else}
      <input type="hidden" name="caseId" value={caseId} />
    {/if}

    <!-- Options -->
    <div class="space-y-4 rounded-lg border p-4 bg-muted/50">
      <div class="flex items-center justify-between">
        <Label htmlFor="aiAnalysis" class="flex-1 cursor-pointer">
          Enable AI Analysis
          <span class="block text-sm font-normal text-muted-foreground">
            Extract text, generate embeddings, and summarize content
          </span>
        </Label>
        <Switch id="aiAnalysis" name="aiAnalysis" bind:checked={$form.aiAnalysis} />
      </div>
      <div class="flex items-center justify-between">
        <Label htmlFor="isPrivate" class="flex-1 cursor-pointer">
          Private Evidence
          <span class="block text-sm font-normal text-muted-foreground">
            Only visible to you and case administrators
          </span>
        </Label>
        <Switch id="isPrivate" name="isPrivate" bind:checked={$form.isPrivate} onCheckedChange={(v) => $form.isPrivate = v} />
      </div>
    </div>

    <!-- Messages -->
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
      class="w-full"
      size="lg"
    >
      {#if $submitting}
        Uploading Evidence...
      {:else}
        <Upload class="mr-2 h-4 w-4" /> Upload Evidence
      {/if}
    </Button>
  </form>
</div>
