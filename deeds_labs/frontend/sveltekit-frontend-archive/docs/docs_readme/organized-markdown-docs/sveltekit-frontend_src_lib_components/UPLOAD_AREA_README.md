# Enhanced UploadArea Component

The `UploadArea.svelte` component is a robust, feature-rich file upload component designed for the Legal Case Management System. It provides comprehensive drag-and-drop functionality, file validation, progress tracking, error handling, and accessibility features.

## Features

### Core Functionality

- **Drag & Drop Support**: Enhanced drag and drop with visual feedback
- **File Browse**: Click to browse and select files
- **Multiple File Upload**: Support for uploading multiple files simultaneously
- **Auto Upload**: Optional automatic upload when files are selected
- **Manual Upload**: Manual upload control with start/retry buttons

### Validation & Security

- **File Type Validation**: Extension and MIME type validation
- **File Size Limits**: Configurable maximum file size per file
- **File Count Limits**: Maximum number of files per upload
- **Filename Security**: Protection against path traversal and malicious filenames
- **Duplicate Detection**: Identifies and prevents duplicate file uploads
- **Empty File Detection**: Rejects zero-byte files

### Progress & Feedback

- **Real-time Progress**: Individual file and overall upload progress
- **Visual States**: Clear visual feedback for different states (uploading, success, error)
- **Retry Mechanism**: Automatic retry with exponential backoff
- **Error Reporting**: Detailed error messages for failed uploads
- **File Preview**: Preview selected files before upload

### Accessibility

- **Keyboard Navigation**: Full keyboard support (Enter/Space to browse)
- **Screen Reader Support**: ARIA labels and live regions
- **Focus Management**: Proper focus handling and visual indicators
- **High Contrast**: Support for high contrast mode

### UI/UX Enhancements

- **Responsive Design**: Mobile-friendly responsive layout
- **Smooth Animations**: CSS transitions and animations
- **File Type Icons**: Visual file type indicators with color coding
- **File Management**: Remove individual files from selection
- **Status Indicators**: Clear success/error indicators

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
export let uploadEndpoint: string = "/api/parse/";
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
```

## Events

### Upload Lifecycle Events

- `upload-start`: Fired when upload process begins
- `upload-progress`: Fired during upload with progress information
- `upload-complete`: Fired when all files are successfully uploaded
- `upload-error`: Fired when upload process fails

### File-Level Events

- `file-start`: Fired when individual file upload starts
- `file-progress`: Fired during individual file upload
- `file-success`: Fired when individual file upload succeeds
- `file-error`: Fired when individual file upload fails

### User Interaction Events

- `files-selected`: Fired when user selects files (drag/drop or browse)
- `validation-error`: Fired when file validation fails

## Usage Examples

### Basic Usage

```svelte
<script>
  import UploadArea from '$lib/components/UploadArea.svelte';

  function handleUploadComplete(event) {
    console.log('Files uploaded:', event.detail.files);
  }
</script>

<UploadArea
  on:upload-complete={handleUploadComplete}
/>
```

### Advanced Configuration

```svelte
<script>
  import UploadArea from '$lib/components/UploadArea.svelte';

  let uploadStatus = '';

  function handleUploadStart(event) {
    uploadStatus = `Uploading ${event.detail.files.length} files...`;
  }

  function handleUploadProgress(event) {
    uploadStatus = `Progress: ${Math.round(event.detail.progress)}%`;
  }

  function handleUploadComplete(event) {
    uploadStatus = `Successfully uploaded ${event.detail.files.length} files!`;
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
  uploadEndpoint="/api/evidence/upload"
  on:upload-start={handleUploadStart}
  on:upload-progress={handleUploadProgress}
  on:upload-complete={handleUploadComplete}
  on:upload-error={handleUploadError}
/>

{#if uploadStatus}
  <div class="alert alert-info">{uploadStatus}</div>
{/if}
```

### Custom File Validation

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

The component uses Bootstrap classes and CSS custom properties for styling. Key CSS classes:

- `.upload-area`: Main container
- `.drop-zone`: Drag and drop area
- `.upload-progress`: Progress display
- `.file-preview`: File preview area
- `.error-state`: Error display

### Custom Styling Example

```css
:global(.upload-area .drop-zone) {
  border-color: #007bff;
  border-radius: 12px;
}

:global(.upload-area .drop-zone:hover) {
  background: linear-gradient(135deg, #007bff11, #007bff05);
}
```

## API Integration

The component automatically determines the upload endpoint based on file type:

- PDF files: `{uploadEndpoint}pdf`
- Images: `{uploadEndpoint}image`
- Videos: `{uploadEndpoint}video`
- Audio: `{uploadEndpoint}audio`

### Expected API Response

```json
{
  "success": true,
  "fileId": "file_12345",
  "filename": "document.pdf",
  "size": 1048576,
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

- File size exceeds limit
- Unsupported file type
- Too many files selected
- Empty files
- Invalid filenames
- Duplicate files

### Upload Errors

- Network failures
- Server errors
- Timeout errors
- Authentication errors

### Retry Logic

- Automatic retry with exponential backoff
- Configurable retry attempts
- Individual file retry tracking

## Accessibility Features

- **ARIA Labels**: Comprehensive ARIA labeling for screen readers
- **Keyboard Support**: Full keyboard navigation support
- **Focus Management**: Proper focus indicators and management
- **Live Regions**: Dynamic content announcements
- **High Contrast**: Support for high contrast mode
- **Screen Reader**: Compatible with screen readers

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Considerations

- **Progress Tracking**: Uses XMLHttpRequest for upload progress
- **Memory Efficiency**: Efficient file handling for large files
- **Debounced Events**: Debounced drag events for better performance
- **Lazy Loading**: Components load only when needed

## Security Considerations

- **File Validation**: Multiple validation layers
- **MIME Type Checking**: Validates both extension and MIME type
- **Path Traversal Protection**: Prevents malicious filenames
- **Size Limits**: Enforces file size restrictions
- **Type Restrictions**: Configurable file type restrictions

## Future Enhancements

- Chunked upload support for large files
- Resume capability for interrupted uploads
- Image preview and cropping
- Virus scanning integration
- Cloud storage integration
- WebRTC peer-to-peer upload

## Dependencies

- Svelte 4+

## License

This component is part of the Legal Case Management System and follows the project's licensing terms.
