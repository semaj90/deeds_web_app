# Chat UI Components

ChatGPT-style file upload components for audio/document upload to chat context.

## Components

### DocumentChip.svelte
File preview chip with remove button.

**Props:**
- `fileName: string` - File name to display
- `fileSize: number` - File size in bytes
- `fileType: string` - MIME type
- `previewUrl?: string` - Optional thumbnail preview URL
- `progress?: number` - Upload progress (0-100), shows progress bar
- `onremove?: () => void` - Callback when remove button clicked
- `onclick?: () => void` - Optional click handler for preview modal
- `disabled?: boolean` - Disable interactions

**Features:**
- Auto file type icon detection (audio, video, image, PDF, document)
- Human-readable file size formatting (B, KB, MB, GB)
- Upload progress bar when `progress` < 100
- Hover states and keyboard navigation

### FileUploadModal.svelte
Drag-drop file upload dialog using bits-ui Dialog.

**Props:**
- `open: boolean` (bindable) - Dialog open state
- `maxFiles?: number` - Max files allowed (default: 5)
- `maxSizeMB?: number` - Max file size in MB (default: 100)
- `acceptedTypes?: string[]` - Allowed file extensions/MIME types
- `selectedFiles: File[]` (bindable) - Currently selected files
- `onclose?: () => void` - Callback when dialog closes
- `onfilesselected?: (files: File[]) => void` - Callback when files confirmed

**Features:**
- Drag-drop zone with visual feedback
- File browser fallback
- Client-side validation (size, type)
- Image preview generation
- File chips with remove buttons

### ChatPromptBar.svelte
Main prompt input with file upload integration.

**Props:**
- `placeholder?: string` - Input placeholder text
- `disabled?: boolean` - Disable all interactions
- `maxFiles?: number` - Max uploaded files (default: 5)
- `uploadedFiles: Array` (bindable) - Currently uploaded files
- `onsubmit?: (message: string) => void` - Callback when message submitted
- `onfilesadded?: (files: File[]) => void` - Callback when files added
- `onfileremoved?: (fileName: string) => void` - Callback when file removed

**Features:**
- Auto-resizing textarea (max 200px height)
- Submit on Enter (Shift+Enter for newline)
- File upload button (disabled when maxFiles reached)
- Uploaded files shown as chips above input
- Send button with visual states

### AudioUploadWidget.svelte
Real-time audio processing progress tracker with SSE.

**Props:**
- `file: File` - Audio file to upload
- `caseId?: string` - Optional case ID
- `onprogress?: (event: ProgressEvent) => void` - Progress updates
- `oncomplete?: (result) => void` - Completion callback
- `onerror?: (error: string) => void` - Error callback

**Features:**
- 4-stage progress visualization (upload, transcription, analysis, indexing)
- SSE progress streaming from `/api/audio/progress/[id]`
- Overall progress bar
- Stage details display (duration, language, entities, tags)
- Error handling with retry capability

## State Machine

### audio-upload-machine.ts
XState v5 state machine for audio upload orchestration.

**States:**
- `idle` - Waiting for file selection
- `uploading` - Uploading file to server via `/api/audio/upload`
- `streaming` - Listening to SSE progress events
- `complete` - Processing finished
- `error` - Upload or processing failed

**Context:**
- `file: File | null`
- `caseId: string | null`
- `evidenceId: string | null`
- `uploadProgress: number` (0-100)
- `processingStage: 'upload' | 'transcription' | 'analysis' | 'indexing' | 'complete' | 'error'`
- `stageMessage: string`
- `overallProgress: number` (0-100)
- `result: object | null`
- `error: string | null`

**Events:**
- `SELECT_FILE` - User selected file
- `UPLOAD` - Start upload
- `PROGRESS` - SSE progress update
- `COMPLETE` - Processing complete
- `ERROR` - Error occurred
- `RETRY` - Retry after error
- `RESET` - Reset to idle

## API Routes

### POST /api/audio/upload
Uploads audio file and publishes to RabbitMQ `audio.process` queue.

**Request:**
- FormData with `audio` file
- Optional `caseId` field

**Response:**
```json
{
  "success": true,
  "evidenceId": "abc123",
  "message": "Audio file uploaded and queued for processing"
}
```

**Validations:**
- Auth required
- Max 100MB file size
- Allowed types: audio/mpeg, audio/wav, audio/m4a, audio/ogg, audio/webm

**Process:**
1. Save file to `uploads/audio/`
2. Insert evidence record to PostgreSQL
3. Initialize Redis status tracking (`audio:status:{evidenceId}`)
4. Publish to RabbitMQ `audio.exchange` → `audio.process`

### GET /api/audio/progress/[evidenceId]
Server-Sent Events (SSE) endpoint for real-time progress updates.

**Authentication:** Required

**Response:** SSE stream with JSON events:
```json
{
  "stage": "transcription",
  "progress": 45,
  "message": "Transcribing audio...",
  "details": {
    "duration": 60,
    "language": "en",
    "entities": 12
  }
}
```

**Polling:** Queries Redis `audio:status:{evidenceId}` every 500ms

**Stages:**
- `upload` - File uploaded, queued
- `transcription` - Whisper processing
- `analysis` - LangExtract + ACE analysis
- `indexing` - Qdrant indexing
- `complete` - Processing finished
- `error` - Processing failed

## Usage Example

```svelte
<script lang="ts">
  import ChatPromptBar from '$lib/components/chat/ChatPromptBar.svelte';
  import AudioUploadWidget from '$lib/components/chat/AudioUploadWidget.svelte';
  import { useMachine } from '$lib/utils/xstate-svelte5';
  import { audioUploadMachine } from '$lib/machines/audio-upload-machine';

  let uploadedFiles = $state<Array<{ name: string; size: number; type: string }>>([]);
  let currentUpload = $state<File | null>(null);

  const { snapshot, send } = useMachine(audioUploadMachine);

  function handleFilesAdded(files: File[]) {
    // Handle audio files separately with progress tracking
    const audioFiles = files.filter(f => f.type.startsWith('audio/'));
    if (audioFiles.length > 0) {
      currentUpload = audioFiles[0];
      send({ type: 'SELECT_FILE', file: audioFiles[0] });
    }

    // Add non-audio files to uploaded list
    const docs = files.filter(f => !f.type.startsWith('audio/'));
    uploadedFiles = [
      ...uploadedFiles,
      ...docs.map(f => ({ name: f.name, size: f.size, type: f.type }))
    ];
  }

  function handleFileRemoved(fileName: string) {
    uploadedFiles = uploadedFiles.filter(f => f.name !== fileName);
  }

  function handleSubmit(message: string) {
    console.log('Message:', message);
    console.log('Files:', uploadedFiles);
    // Send to chat API with file context
  }
</script>

<div class="space-y-4">
  <!-- Audio upload progress -->
  {#if currentUpload}
    <AudioUploadWidget
      file={currentUpload}
      oncomplete={(result) => {
        uploadedFiles = [...uploadedFiles, {
          name: currentUpload!.name,
          size: currentUpload!.size,
          type: currentUpload!.type
        }];
        currentUpload = null;
      }}
      onerror={(error) => {
        console.error('Upload failed:', error);
        currentUpload = null;
      }}
    />
  {/if}

  <!-- Chat prompt bar -->
  <ChatPromptBar
    bind:uploadedFiles
    onfilesadded={handleFilesAdded}
    onfileremoved={handleFileRemoved}
    onsubmit={handleSubmit}
  />
</div>
```

## Integration Checklist

- [x] Create UI components (DocumentChip, FileUploadModal, ChatPromptBar, AudioUploadWidget)
- [x] Create XState v5 audio upload machine
- [x] Create API routes (/api/audio/upload, /api/audio/progress/[id])
- [x] Wire RabbitMQ `audio.process` queue consumer (Whisper transcription)
- [ ] Add Drizzle schema for `chat_document_attachments` table
- [ ] Update SSE chat to include document context from Qdrant
- [ ] Add MinIO integration for document uploads
- [ ] Wire document.embed queue for chunking/embedding

## Performance Benchmarks

Based on architecture design (see `audio-to-knowledge-pipeline.md`):

| Stage | GPU Time | CPU Time | Speedup |
|-------|----------|----------|---------|
| Whisper (60s audio) | 3s | 9s | 3x |
| SIMD Parsing (100KB) | 5ms | 20ms | 4x |
| ACE Analysis | 2s | 8s | 4x |
| **Total Pipeline** | **6s** | **18s** | **3x** |

**Combined hit rate**: 90-95% (L1 Redis 5ms + L2 Bifrost 2-5s + L3 Ollama 25s)