# Enhanced UploadArea Component

The `UploadArea.svelte` component is a robust, feature-rich file upload component designed for the Legal Case Management System. It leverages **SvelteKit 2** and **Svelte 5 runes** for a modern frontend experience, integrates seamlessly with **MinIO** for scalable object storage, and utilizes **Bits-UI** and **Enhanced-Bits-UI** for accessible and highly customizable UI elements. It provides comprehensive drag-and-drop functionality, file validation, progress tracking, error handling, and accessibility features.

## Features

### Core Functionality

-   **Drag & Drop Support**: Enhanced drag and drop with visual feedback.
-   **File Browse**: Click to browse and select files.
-   **Multiple File Upload**: Support for uploading multiple files simultaneously.
-   **Auto Upload**: Optional automatic upload to MinIO when files are selected.
-   **Manual Upload**: Manual upload control with start/retry buttons.

### Validation & Security

-   **File Type Validation**: Extension and MIME type validation.
-   **File Size Limits**: Configurable maximum file size per file.
-   **File Count Limits**: Maximum number of files per upload.
-   **Filename Security**: Protection against path traversal and malicious filenames.
-   **Duplicate Detection**: Identifies and prevents duplicate file uploads.
-   **Empty File Detection**: Rejects zero-byte files.

### Progress & Feedback

-   **Real-time Progress**: Individual file and overall upload progress.
-   **Visual States**: Clear visual feedback for different states (uploading, success, error) using Bits-UI components.
-   **Retry Mechanism**: Automatic retry with exponential backoff.
-   **Error Reporting**: Detailed error messages for failed uploads.
-   **File Preview**: Preview selected files before upload.

### Accessibility

-   **Keyboard Navigation**: Full keyboard support (Enter/Space to browse), inherited from Bits-UI.
-   **Screen Reader Support**: ARIA labels and live regions, provided by Bits-UI.
-   **Focus Management**: Proper focus handling and visual indicators.
-   **High Contrast**: Support for high contrast mode.

### UI/UX Enhancements

-   **Responsive Design**: Mobile-friendly responsive layout.
-   **Smooth Animations**: CSS transitions and animations.
-   **Bits-UI Integration**: Leverages `bits-ui` and `enhanced-bits-ui` for robust, accessible, and customizable UI components (e.g., buttons, progress bars, dialogs).
-   **File Type Icons**: Visual file type indicators with color coding.
-   **File Management**: Remove individual files from selection.
-   **Status Indicators**: Clear success/error indicators.

## Props

### Basic Configuration

```typescript
export let onUpload: (files: FileList) => void = () => {};
export let acceptedTypes: string =
  ".pdf,.jpg,.jpeg,.png,.mp4,.avi,.mov,.mp3,.wav";
export let maxFiles: number = 10;
export let maxFileSize: number = 50 * 1024 * 1024; // 50MB
export let disabled: boolean = false;
export let multiple: boolean = true;
```

### Advanced Options

```typescript
export let showProgress: boolean = true;
export let showPreview: boolean = true;
export let autoUpload: boolean = false;
export let retryAttempts: number = 3;
export let allowedMimeTypes: string[] = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/avi",
  "video/mov",
  "video/webm",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/mpeg",
];
// Note: MinIO configuration is handled internally or via a SvelteKit endpoint.
```

## Events

### Upload Lifecycle Events

-   `upload-start`: Fired when upload process begins.
-   `upload-progress`: Fired during upload with progress information.
-   `upload-complete`: Fired when all files are successfully uploaded to MinIO.
-   `upload-error`: Fired when upload process fails.

### File-Level Events

-   `file-start`: Fired when individual file upload starts.
-   `file-progress`: Fired during individual file upload.
-   `file-success`: Fired when individual file upload succeeds.
-   `file-error`: Fired when individual file upload fails.

### User Interaction Events

-   `files-selected`: Fired when user selects files (drag/drop or browse).
-   `validation-error`: Fired when file validation fails.

## Usage Examples

### Basic Usage (Svelte 5 Runes)

```svelte
<script>
  import UploadArea from '$lib/components/UploadArea.svelte';

  function handleUploadComplete(event) {
    console.log('Files uploaded to MinIO:', event.detail.files);
  }
</script>

<UploadArea
  on:upload-complete={handleUploadComplete}
/>
```

### Advanced Configuration (Svelte 5 Runes)

```svelte
<script>
  import UploadArea from '$lib/components/UploadArea.svelte';

  let uploadStatus = $state('');

  function handleUploadStart(event) {
    uploadStatus = `Uploading ${event.detail.files.length} files to MinIO...`;
  }

  function handleUploadProgress(event) {
    uploadStatus = `Progress: ${Math.round(event.detail.progress)}%`;
  }

  function handleUploadComplete(event) {
    uploadStatus = `Successfully uploaded ${event.detail.files.length} files to MinIO!`;
  }

  function handleUploadError(event) {
    uploadStatus = `Upload failed: ${event.detail.error}`;
  }
</script>

<UploadArea
  maxFiles={5}
  maxFileSize={10 * 1024 * 1024}
  autoUpload={true}
  showProgress={true}
  retryAttempts={2}
  acceptedTypes=".pdf,.jpg,.jpeg,.png,.mp4"
  allowedMimeTypes={['application/pdf', 'image/jpeg', 'image/png', 'video/mp4']}
  on:upload-start={handleUploadStart}
  on:upload-progress={handleUploadProgress}
  on:upload-complete={handleUploadComplete}
  on:upload-error={handleUploadError}
/>

{#if uploadStatus}
  <div class="alert alert-info">{uploadStatus}</div>
{/if}
```

### Custom File Validation (Svelte 5 Runes)

```svelte
<script>
  function handleValidationError(event) {
    // Custom validation error handling
    const errors = event.detail.errors;
    errors.forEach(error => {
      console.error('Validation error:', error);
    });
  }
</script>

<UploadArea
  on:validation-error={handleValidationError}
/>
```

## Styling

The component leverages `bits-ui` and `enhanced-bits-ui` for its foundational styling, which typically uses a utility-first CSS framework (like Tailwind CSS) or provides its own theming capabilities. Custom styling can be applied by targeting the component's root elements or by overriding `bits-ui` component styles.

### Custom Styling Example

```css
/* Example using global styles, adjust selectors based on actual component structure */
:global(.upload-area .drop-zone) {
  border-color: var(--color-primary-500); /* Using CSS variables for theme integration */
  border-radius: 12px;
  transition: all 0.2s ease-in-out;
}

:global(.upload-area .drop-zone:hover) {
  background: linear-gradient(135deg, var(--color-primary-100), var(--color-primary-50));
}
```

## API Integration (MinIO via SvelteKit)

The component is designed to integrate with **MinIO** for robust and scalable object storage. Instead of a direct `uploadEndpoint`, the component orchestrates the upload process through a SvelteKit `+server.ts` endpoint.

1.  **Pre-signed URL Request**: When files are selected for upload, the component makes a request to a SvelteKit `+server.ts` endpoint (e.g., `/api/minio/presign-upload`). This endpoint, in turn, communicates with a Go microservice (or directly with MinIO if configured) to generate a secure, time-limited pre-signed URL for each file.
2.  **Direct MinIO Upload**: The component then uses the received pre-signed URL(s) to directly upload the files to the designated MinIO bucket from the client-side. This offloads the actual file transfer from the SvelteKit server, improving performance and scalability.
3.  **Post-Upload Notification**: After a successful upload to MinIO, the component can optionally notify the SvelteKit backend (or a Go microservice) to confirm the upload and trigger further processing (e.g., document ingestion, OCR, vector embedding).
4.  **Offline/Unauthenticated Upload Handling**: If the user is offline or not authenticated during the upload attempt, the `UploadArea` component integrates with the `unsynced-uploads.ts` service. Instead of failing, the metadata for the attempted upload (e.g., `caseId`, `originalFilename`, `storedFilename`, `fileSize`, `storagePath`) is saved locally using `unsynced-uploads.saveLocalUpload()`. This ensures that the user's work is not lost. The `unsynced-uploads` service then automatically attempts to sync these pending uploads to the backend once the user comes online and/or successfully authenticates, ensuring data consistency and a resilient user experience.

### Expected MinIO Upload Response (via SvelteKit orchestration)

The SvelteKit endpoint providing pre-signed URLs might return:

```json
{
  "success": true,
  "files": [
    {
      "filename": "document.pdf",
      "presignedUrl": "https://minio.example.com/bucket/document.pdf?X-Amz-Signature=...",
      "minioObjectKey": "uploads/user-id/document.pdf"
    }
  ]
}
```

The final confirmation/processing endpoint might return:

```json
{
  "success": true,
  "fileId": "minio_obj_12345",
  "filename": "document.pdf",
  "size": 1048576,
  "minioBucket": "legal-documents",
  "minioPath": "uploads/user-id/document.pdf",
  "processingTime": 1234,
  "metadata": {
    "pages": 5,
    "contentType": "application/pdf"
  }
}
```

## Error Handling

The component provides comprehensive error handling:

### Validation Errors

-   File size exceeds limit
-   Unsupported file type
-   Too many files selected
-   Empty files
-   Invalid filenames
-   Duplicate files

### Upload Errors

-   Network failures during pre-signing or direct MinIO upload.
-   MinIO server errors (e.g., bucket not found, permissions).
-   Timeout errors.
-   Authentication/Authorization errors (e.g., invalid pre-signed URL).

### Retry Logic

-   Automatic retry with exponential backoff for both pre-signing and MinIO uploads.
-   Configurable retry attempts.
-   Individual file retry tracking.

## Accessibility Features

-   **ARIA Labels**: Comprehensive ARIA labeling for screen readers, largely inherited from `bits-ui` components.
-   **Keyboard Support**: Full keyboard navigation support.
-   **Focus Management**: Proper focus indicators and management.
-   **Live Regions**: Dynamic content announcements.
-   **High Contrast**: Support for high contrast mode.
-   **Screen Reader**: Compatible with screen readers.

## Browser Support

-   Chrome 90+
-   Firefox 88+
-   Safari 14+
-   Edge 90+

## Performance Considerations

-   **Progress Tracking**: Uses XMLHttpRequest or Fetch API for upload progress.
-   **Memory Efficiency**: Efficient file handling for large files.
-   **Debounced Events**: Debounced drag events for better performance.
-   **Lazy Loading**: Components load only when needed.
-   **Direct MinIO Upload**: Offloads server resources by enabling direct client-to-MinIO file transfer.

## Security Considerations

-   **File Validation**: Multiple validation layers (client-side and server-side before MinIO upload).
-   **MIME Type Checking**: Validates both extension and MIME type.
-   **Path Traversal Protection**: Prevents malicious filenames.
-   **Size Limits**: Enforces file size restrictions.
-   **Type Restrictions**: Configurable file type restrictions.
-   **Pre-signed URLs**: Uses secure, time-limited pre-signed URLs for MinIO uploads, minimizing direct credential exposure.

## Future Enhancements

-   Chunked upload support for very large files to MinIO.
-   Resume capability for interrupted MinIO uploads.
-   Image preview and cropping.
-   Virus scanning integration (server-side before MinIO storage or post-upload).
-   Advanced MinIO lifecycle management integration.
-   WebRTC peer-to-peer upload (for specific use cases).

## Dependencies

-   Svelte 5
-   SvelteKit 2
-   Bits-UI
-   Enhanced-Bits-UI

## License

This component is part of the Legal Case Management System and follows the project's licensing terms.
