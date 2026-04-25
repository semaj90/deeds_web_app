# File Uploads: Presigned URL Pattern (S3/MinIO)

**Category:** File Storage
**Tags:** #upload #s3 #minio #presigned #file #storage #multipart #object-storage
**Symbols:** `S3Client` `PutObjectCommand` `getSignedUrl` `multipart/form-data` `File` `FormData` `Blob`
**Route Kind:** `endpoint`
**HTTP Methods:** `POST GET`
**Risk:** `security data-loss dos`
**Last Updated:** 2025-12-24

---

## Intent

Secure file upload pattern using **presigned URLs** to allow clients to upload files directly to S3/MinIO object storage without streaming through the application server. Prevents server bandwidth exhaustion, enables parallel uploads, and provides scalable file storage.

**One-Sentence Summary:**
Client requests presigned URL from server → Server validates + generates signed URL → Client uploads file directly to S3/MinIO → Server receives upload confirmation.

---

## When to Use

✅ **Use presigned URLs when:**
- Uploading user-generated content (images, documents, videos)
- File size >1MB (avoid streaming through Node.js/SvelteKit)
- Need to offload bandwidth from application server
- Want client-side upload progress tracking
- Using S3-compatible object storage (AWS S3, MinIO, DigitalOcean Spaces)

❌ **Don't use when:**
- File size <100KB (inline base64 or direct POST acceptable)
- Need server-side file processing before storage (virus scan, image resize)
- Using local filesystem storage (use direct multipart upload)
- Files contain sensitive data requiring server-side encryption before storage

---

## Presigned URL Flow

### Step-by-Step Process

**1. Client Request (Get Presigned URL)**
```typescript
// Client-side (Svelte component)
const file = fileInput.files[0];

const response = await fetch('/api/upload/presign', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({
    filename: file.name,
    contentType: file.type,
    size: file.size
  })
});

const { presignedUrl, key, expiresIn } = await response.json();
```

**2. Server Validation + URL Generation**
```typescript
// Server endpoint: /api/upload/presign/+server.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({
  endpoint: 'http://localhost:9000', // MinIO
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY
  },
  forcePathStyle: true
});

export const POST: RequestHandler = async ({ request, locals }) => {
  // Auth check
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Rate limit (3 uploads/min)
  const rateLimitResult = await rateLimit(`upload_presign:${locals.user.id}`, {
    max: 3,
    window: 60000,
    identifier: locals.user.id
  });

  if (!rateLimitResult.success) {
    throw error(429, { message: 'Upload limit exceeded', retryAfter: rateLimitResult.resetIn });
  }

  // Validate request
  const { filename, contentType, size } = await request.json();

  // Validate file type (whitelist)
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw error(400, { message: 'Invalid file type', allowed: ALLOWED_TYPES });
  }

  // Validate file size (10MB max)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (size > MAX_SIZE) {
    throw error(400, { message: 'File too large', maxSize: MAX_SIZE });
  }

  // Generate safe filename
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `uploads/${locals.user.id}/${Date.now()}-${sanitizedFilename}`;

  // Create presigned URL (expires in 5 minutes)
  const command = new PutObjectCommand({
    Bucket: 'legal-documents',
    Key: key,
    ContentType: contentType,
    ContentLength: size,
    Metadata: {
      uploadedBy: locals.user.id,
      originalFilename: filename
    }
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return json({
    success: true,
    presignedUrl,
    key,
    expiresIn: 300
  });
};
```

**3. Client Direct Upload**
```typescript
// Client-side: Upload file to presigned URL
const uploadResponse = await fetch(presignedUrl, {
  method: 'PUT',
  headers: {
    'Content-Type': file.type
  },
  body: file
});

if (uploadResponse.ok) {
  // Notify server that upload completed
  await fetch('/api/upload/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ key, filename: file.name })
  });
}
```

**4. Server Upload Confirmation**
```typescript
// Server endpoint: /api/upload/confirm/+server.ts
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const { key, filename } = await request.json();

  // Verify file exists in S3
  const headCommand = new HeadObjectCommand({
    Bucket: 'legal-documents',
    Key: key
  });

  try {
    await s3.send(headCommand);
  } catch (err) {
    throw error(404, 'File not found in storage');
  }

  // Save file metadata to database
  const fileRecord = await db.insert(uploadedFiles).values({
    key,
    filename,
    uploadedBy: locals.user.id,
    size: 0, // Get from HeadObject response
    mimeType: '', // Get from HeadObject
    createdAt: new Date()
  }).returning();

  return json({ success: true, file: fileRecord[0] });
};
```

---

## Security Model

### 1. Authentication
```typescript
// Always require authentication for presign endpoints
if (!locals.user) {
  throw error(401, 'Unauthorized');
}
```

### 2. File Type Validation (Whitelist)
```typescript
const ALLOWED_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  documents: ['application/pdf', 'application/msword', 'text/plain'],
  archives: ['application/zip']
};

const allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.zip'];
const fileExt = filename.toLowerCase().slice(filename.lastIndexOf('.'));

if (!allowedExtensions.includes(fileExt)) {
  throw error(400, { message: 'File extension not allowed' });
}

if (!ALLOWED_TYPES.images.includes(contentType) &&
    !ALLOWED_TYPES.documents.includes(contentType)) {
  throw error(400, { message: 'Content-Type not allowed' });
}
```

### 3. File Size Limits
```typescript
const SIZE_LIMITS = {
  image: 5 * 1024 * 1024,      // 5MB
  document: 20 * 1024 * 1024,  // 20MB
  archive: 50 * 1024 * 1024    // 50MB
};

if (contentType.startsWith('image/') && size > SIZE_LIMITS.image) {
  throw error(400, { message: 'Image too large', maxSize: SIZE_LIMITS.image });
}
```

### 4. Safe Filename Generation
```typescript
import { randomBytes } from 'crypto';

function generateSafeFilename(originalFilename: string, userId: string): string {
  // Remove unsafe characters
  const sanitized = originalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Add timestamp + random hash
  const timestamp = Date.now();
  const hash = randomBytes(8).toString('hex');

  // Preserve extension
  const ext = sanitized.slice(sanitized.lastIndexOf('.'));
  const nameWithoutExt = sanitized.slice(0, sanitized.lastIndexOf('.'));

  return `uploads/${userId}/${timestamp}-${hash}-${nameWithoutExt}${ext}`;
}
```

### 5. Bucket Policies (MinIO/S3)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": "*",
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::legal-documents/public/*"]
    },
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::legal-documents/uploads/*"]
    }
  ]
}
```

### 6. CORS Configuration
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://yourapp.com"],
      "AllowedMethods": ["PUT", "POST"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}
```

---

## Validation

### Presign Request Schema
```typescript
// $lib/schemas/upload.ts
import { z } from 'zod';

export const PresignRequestSchema = z.object({
  filename: z.string().min(1).max(255).regex(/^[a-zA-Z0-9._-]+$/),
  contentType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/zip'
  ]),
  size: z.number().int().positive().max(50 * 1024 * 1024) // 50MB max
});

export type PresignRequest = z.infer<typeof PresignRequestSchema>;
```

### Upload Confirmation Schema
```typescript
export const UploadConfirmSchema = z.object({
  key: z.string().min(1),
  filename: z.string().min(1).max(255)
});
```

---

## Caching / Rate Limits

### Rate Limiting
```typescript
// Presign endpoint: 3 requests/min per user
const presignLimit = await rateLimit(`upload_presign:${locals.user.id}`, {
  max: 3,
  window: 60000,
  identifier: locals.user.id
});

// Confirm endpoint: 10 requests/min per user
const confirmLimit = await rateLimit(`upload_confirm:${locals.user.id}`, {
  max: 10,
  window: 60000,
  identifier: locals.user.id
});
```

### Presigned URL Expiry
```typescript
// Short expiry to prevent URL sharing
const presignedUrl = await getSignedUrl(s3, command, {
  expiresIn: 300 // 5 minutes
});
```

### Cleanup Old URLs
```typescript
// Cron job to delete unconfirmed uploads after 1 hour
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

async function cleanupOrphanedUploads() {
  const oneHourAgo = Date.now() - 3600000;

  const listCommand = new ListObjectsV2Command({
    Bucket: 'legal-documents',
    Prefix: 'uploads/'
  });

  const { Contents } = await s3.send(listCommand);

  for (const obj of Contents || []) {
    // Check if file has database record
    const hasRecord = await db.query.uploadedFiles.findFirst({
      where: eq(schema.key, obj.Key)
    });

    // Delete if no record and older than 1 hour
    if (!hasRecord && obj.LastModified < new Date(oneHourAgo)) {
      await s3.send(new DeleteObjectCommand({
        Bucket: 'legal-documents',
        Key: obj.Key
      }));
    }
  }
}
```

---

## Failure Modes

| Symptom | Root Cause | Fix | Verification |
|---------|-----------|-----|--------------|
| CORS error on PUT | Bucket CORS not configured | Add PUT method to bucket CORS policy | Check browser Network tab for preflight OPTIONS |
| 403 Forbidden on upload | Presigned URL expired | Reduce upload time or increase `expiresIn` | Check `X-Amz-Expires` in URL query |
| 413 Payload Too Large | File exceeds server/proxy limit | Use presigned URL (bypasses proxy), check CloudFlare/nginx limits | Test with large file (11MB+) |
| File uploaded but not in DB | Confirm endpoint not called | Add error handling in client upload, ensure confirm is called | Check S3 bucket vs database records |
| Duplicate uploads | No idempotency check | Add unique constraint on `key` column in DB | Try uploading same file twice |
| Malicious file uploaded | No content verification | Add virus scanning (ClamAV), validate magic bytes | Upload `.exe` renamed to `.pdf` |
| Storage quota exceeded | No user/global limits | Track total storage per user, enforce quota | Check S3 bucket size vs limits |
| Slow upload progress | Large file + no multipart | Use S3 multipart upload for files >100MB | Monitor upload speed in browser |
| Public file access | Wrong bucket policy | Ensure uploads/ prefix denies GetObject | Try accessing presigned URL after expiry |
| Missing metadata | Not set in PutObjectCommand | Add Metadata field with user ID, filename | Check object metadata in S3 console |

---

## Reference Implementation

### Complete Upload Flow (Client + Server)

**Client Component (Svelte 5)**
```svelte
<script lang="ts">
  import { Button } from '$lib/components/ui';

  let fileInput: HTMLInputElement;
  let uploading = $state(false);
  let uploadProgress = $state(0);
  let errorMessage = $state<string | null>(null);

  async function handleUpload() {
    const file = fileInput.files?.[0];
    if (!file) return;

    uploading = true;
    errorMessage = null;
    uploadProgress = 0;

    try {
      // 1. Request presigned URL
      const presignResponse = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          size: file.size
        })
      });

      if (!presignResponse.ok) {
        const error = await presignResponse.json();
        throw new Error(error.message || 'Failed to get upload URL');
      }

      const { presignedUrl, key } = await presignResponse.json();

      // 2. Upload file to S3/MinIO with progress tracking
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          uploadProgress = Math.round((e.loaded / e.total) * 100);
        }
      });

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.response);
          } else {
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
      });

      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);

      await uploadPromise;

      // 3. Confirm upload with server
      const confirmResponse = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, filename: file.name })
      });

      if (!confirmResponse.ok) {
        throw new Error('Failed to confirm upload');
      }

      uploadProgress = 100;
      // Reset form
      fileInput.value = '';
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Upload failed';
      uploadProgress = 0;
    } finally {
      uploading = false;
    }
  }
</script>

<div class="space-y-4">
  <input
    type="file"
    bind:this={fileInput}
    accept="image/*,application/pdf"
    disabled={uploading}
  />

  <Button onclick={handleUpload} disabled={uploading || !fileInput?.files?.[0]}>
    {uploading ? `Uploading... ${uploadProgress}%` : 'Upload File'}
  </Button>

  {#if uploading}
    <div class="w-full bg-gray-200 rounded-full h-2">
      <div
        class="bg-blue-600 h-2 rounded-full transition-all"
        style="width: {uploadProgress}%"
      ></div>
    </div>
  {/if}

  {#if errorMessage}
    <p class="text-red-500">{errorMessage}</p>
  {/if}
</div>
```

**Server Endpoints**
```typescript
// src/routes/api/upload/presign/+server.ts
import { json, error } from '@sveltejs/kit';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { rateLimit } from '$lib/server/rate-limit';
import { PresignRequestSchema } from '$lib/schemas/upload';
import type { RequestHandler } from './$types';

const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://localhost:9000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!
  },
  forcePathStyle: true
});

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  // Rate limit: 3 presign requests per minute
  const rateLimitResult = await rateLimit(`upload_presign`, {
    max: 3,
    window: 60000,
    identifier: locals.user.id
  });

  if (!rateLimitResult.success) {
    throw error(429, {
      message: 'Upload limit exceeded',
      retryAfter: rateLimitResult.resetIn
    });
  }

  // Validate request
  const body = await request.json();
  const validation = PresignRequestSchema.safeParse(body);

  if (!validation.success) {
    throw error(400, {
      message: 'Validation failed',
      errors: validation.error.flatten().fieldErrors
    });
  }

  const { filename, contentType, size } = validation.data;

  // Generate safe key
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const key = `uploads/${locals.user.id}/${Date.now()}-${sanitized}`;

  // Create presigned URL
  const command = new PutObjectCommand({
    Bucket: 'legal-documents',
    Key: key,
    ContentType: contentType,
    ContentLength: size,
    Metadata: {
      uploadedBy: locals.user.id,
      originalFilename: filename
    }
  });

  const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

  return json({
    success: true,
    presignedUrl,
    key,
    expiresIn: 300
  });
};

// src/routes/api/upload/confirm/+server.ts
import { json, error } from '@sveltejs/kit';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { db } from '$lib/server/db';
import { uploadedFiles } from '$lib/server/db/schema-postgres';
import { UploadConfirmSchema } from '$lib/schemas/upload';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const body = await request.json();
  const validation = UploadConfirmSchema.safeParse(body);

  if (!validation.success) {
    throw error(400, {
      message: 'Validation failed',
      errors: validation.error.flatten().fieldErrors
    });
  }

  const { key, filename } = validation.data;

  // Verify file exists in S3
  try {
    const headCommand = new HeadObjectCommand({
      Bucket: 'legal-documents',
      Key: key
    });

    const metadata = await s3.send(headCommand);

    // Save to database
    const fileRecord = await db.insert(uploadedFiles).values({
      key,
      filename,
      uploadedBy: locals.user.id,
      size: metadata.ContentLength || 0,
      mimeType: metadata.ContentType || 'application/octet-stream',
      createdAt: new Date()
    }).returning();

    return json({ success: true, file: fileRecord[0] });
  } catch (err) {
    throw error(404, 'File not found in storage');
  }
};
```

---

## Integration Checklist

- [ ] **1. Install SDK:** `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
- [ ] **2. Configure S3 client:** MinIO/S3 credentials in `.env`
- [ ] **3. Create bucket:** `legal-documents` with private access
- [ ] **4. Set CORS policy:** Allow PUT from your domain
- [ ] **5. Create presign endpoint:** `/api/upload/presign/+server.ts`
- [ ] **6. Add validation:** Zod schema for filename, contentType, size
- [ ] **7. Add rate limiting:** 3 presign requests/min per user
- [ ] **8. Generate safe key:** `uploads/{userId}/{timestamp}-{filename}`
- [ ] **9. Create confirm endpoint:** `/api/upload/confirm/+server.ts`
- [ ] **10. Verify file exists:** HeadObjectCommand before saving to DB
- [ ] **11. Save metadata:** Store key, filename, size, mimeType in database
- [ ] **12. Add client component:** File input + upload progress + error handling
- [ ] **13. Test CORS:** Upload from actual domain (not localhost)
- [ ] **14. Test expiry:** Wait 5+ minutes, URL should be invalid
- [ ] **15. Add cleanup job:** Delete orphaned uploads after 1 hour

---

## Tests

### Unit Test: Safe Filename Generation
```typescript
import { describe, it, expect } from 'vitest';
import { generateSafeFilename } from '$lib/server/upload';

describe('generateSafeFilename', () => {
  it('should sanitize special characters', () => {
    const result = generateSafeFilename('my file!@#.pdf', 'user123');
    expect(result).toMatch(/^uploads\/user123\/\d+-[a-f0-9]+-my_file_\.pdf$/);
  });

  it('should preserve file extension', () => {
    const result = generateSafeFilename('document.docx', 'user456');
    expect(result).toEndWith('.docx');
  });

  it('should include timestamp and hash', () => {
    const result = generateSafeFilename('test.jpg', 'user789');
    expect(result).toMatch(/\d+-[a-f0-9]+-test\.jpg$/);
  });
});
```

### Integration Test: Upload Flow
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { POST as presignPOST } from '$routes/api/upload/presign/+server';
import { POST as confirmPOST } from '$routes/api/upload/confirm/+server';

describe('File upload flow', () => {
  it('should generate presigned URL for valid request', async () => {
    const response = await presignPOST({
      locals: { user: { id: 'test_user', username: 'test', role: 'USER' } },
      request: new Request('http://localhost/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'test.pdf',
          contentType: 'application/pdf',
          size: 1024000
        })
      }),
      getClientAddress: () => '192.168.1.1'
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.presignedUrl).toMatch(/^http/);
    expect(body.key).toMatch(/^uploads\/test_user\/\d+/);
    expect(body.expiresIn).toBe(300);
  });

  it('should reject invalid file type', async () => {
    const response = await presignPOST({
      locals: { user: { id: 'test_user', username: 'test', role: 'USER' } },
      request: new Request('http://localhost/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: 'malicious.exe',
          contentType: 'application/x-msdownload',
          size: 1024
        })
      }),
      getClientAddress: () => '192.168.1.1'
    });

    expect(response.status).toBe(400);
  });
});
```

---

## Related Patterns

- **Protected Endpoints Patterns** - Auth + rate limiting for upload endpoints
- **Zod Validation Contracts** - Validating presign requests
- **Redis Rate Limiting** - Preventing upload spam

---

**Pattern Status:** ✅ Complete
**Next Review:** After Phase 79 testing
**Maintained By:** Storage Team

  const key = `uploads/${locals.user.id}/${crypto.randomUUID()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket: 'user-uploads',
    Key: key,
    ContentType: contentType
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 60 });

  return json({ url, key });
};
```

## Integration checklist
1. Configure S3/MinIO client.
2. Create presign endpoint.
3. Configure CORS on bucket.
4. Implement client-side PUT logic.

## Tests
- Request presign URL -> Returns 200 + URL.
- PUT to URL -> 200 OK.
- Access file -> 200 (if public) or 403 (if private).
