# Storage API Security Enhancements

## Overview

The storage API has been enhanced with comprehensive security features, audit trails, and improved
error handling to meet enterprise security requirements.

## Security Features Implemented

### 1. **Enhanced Authentication** ✅

- **Session-based authentication**: Integrates with existing Lucia auth system
- **JWT Bearer tokens**: Supports standard JWT authentication
- **API key fallback**: For service-to-service communication
- **Multi-layer validation**: Checks multiple auth methods in priority order

```typescript
// Authentication priority:
// 1. Session auth (from locals.auth.validate())
// 2. JWT Bearer token
// 3. API key (for system access)
```

### 2. **Ownership Verification** ✅

- **File ownership tracking**: Every file linked to uploader's user ID
- **Access control**: Users can only delete files they own
- **Admin override**: Admin and system roles can access any file
- **Database integration**: Metadata stored for ownership verification

### 3. **Comprehensive Audit Logging** ✅

- **Dual logging**: File-based and database logging
- **Detailed metadata**: User, IP, timestamp, file details, success/failure
- **Admin dashboard**: Query and filter audit logs
- **Automatic archival**: Configurable log retention policies

```json
// Audit log entry example:
{
  "timestamp": "2024-09-09T16:30:15.234Z",
  "action": "upload",
  "userId": "user_123",
  "userEmail": "john@company.com",
  "bucket": "legal-documents",
  "key": "contract_v2.pdf",
  "ip": "192.168.1.100",
  "success": true,
  "metadata": {
    "fileSize": 1024000,
    "mimeType": "application/pdf"
  }
}
```

### 4. **Soft Delete with Safety** ✅

- **Soft delete first**: Mark files as deleted in database
- **Scheduled hard delete**: Configurable delay before actual deletion
- **Recovery period**: Files can be restored during soft-delete period
- **Admin oversight**: Deletion tracking and approval workflows

### 5. **Rate Limiting & Validation** ✅

- **Upload rate limits**: Configurable per-user request limits
- **File size validation**: Configurable maximum file sizes
- **Filename sanitization**: Automatic cleanup of potentially dangerous filenames
- **Type validation**: MIME type checking and validation

### 6. **Enhanced Client Safety** ✅

- **Conditional removal**: Client only removes files after server confirms deletion
- **Error handling**: Comprehensive error reporting and user feedback
- **Retry logic**: Built-in retry mechanisms for network failures
- **Reactive state**: Real-time UI updates based on server responses

## API Endpoints

### Upload File

```bash
POST /api/v1/storage/upload
Authorization: Bearer <jwt-token>
# OR
x-api-key: <api-key>

# Form data:
# file: <file-blob>
# bucket: <bucket-name>
# key: <optional-custom-filename>
```

**Response:**

```json
{
  "ok": true,
  "bucket": "legal-documents",
  "key": "sanitized_filename.pdf",
  "url": "https://storage.domain.com/legal-documents/sanitized_filename.pdf",
  "size": 1024000,
  "type": "application/pdf"
}
```

### Delete File

```bash
DELETE /api/v1/storage/delete?bucket=legal-documents&key=filename.pdf
Authorization: Bearer <jwt-token>
```

**Response:**

```json
{
  "ok": true,
  "message": "File deleted successfully",
  "softDelete": true,
  "hardDeleteScheduled": true,
  "hardDeleteAfter": "2024-09-10T16:30:15.234Z"
}
```

### Check File Status

```bash
GET /api/v1/storage/delete?bucket=legal-documents&key=filename.pdf
Authorization: Bearer <jwt-token>
```

### View Audit Logs (Admin Only)

```bash
GET /api/v1/storage/audit?userId=user_123&action=delete&limit=100
Authorization: Bearer <admin-jwt-token>
```

## Environment Configuration

```bash
# Authentication
JWT_SECRET=your_jwt_secret_here
STORAGE_API_KEY=your_api_key_for_services

# File limits
MAX_FILE_SIZE=100000000  # 100MB default
ENABLE_HARD_DELETE=true
HARD_DELETE_DELAY_HOURS=24

# Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minio_access_key
MINIO_SECRET_KEY=minio_secret_key
MINIO_USE_SSL=false
MINIO_PUBLIC_URL=https://storage.yourdomain.com

# Database (for audit logs)
DATABASE_URL=postgresql://user:pass@localhost:5432/database
```

## Client Usage Examples

### Basic Upload

```typescript
import { SecureStorageClient } from '$lib/client/secure-storage-client';

const client = new SecureStorageClient();
client.setAuthToken(userJwtToken);

const result = await client.uploadFile(file, 'legal-documents');
if (result.ok) {
  console.log('Uploaded:', result.url);
} else {
  console.error('Upload failed:', result.error);
}
```

### Reactive Storage Manager (Svelte)

```typescript
import { createStorageManager } from '$lib/client/secure-storage-client';

const storage = createStorageManager(userJwtToken);

// Upload file
const success = await storage.uploadFile(file);

// Delete file (only removes from UI if server deletion succeeds)
const deleted = await storage.deleteFile('legal-documents', 'filename.pdf');

// Reactive state
$: files = storage.state.files;
$: loading = storage.state.loading;
$: error = storage.state.error;
```

## Security Best Practices

### For Developers:

1. **Always authenticate**: Never bypass authentication checks
2. **Validate ownership**: Verify user owns resource before allowing access
3. **Log everything**: Comprehensive audit trails for security compliance
4. **Sanitize inputs**: Clean filenames and validate file types
5. **Rate limit**: Prevent abuse with request limiting

### For Administrators:

1. **Regular audit reviews**: Monitor unusual access patterns
2. **Access control**: Use role-based permissions appropriately
3. **Backup strategies**: Ensure audit logs are backed up
4. **Incident response**: Have procedures for security incidents
5. **Compliance**: Meet regulatory requirements for data handling

## Migration from Old System

The enhanced system is backward compatible but adds required authentication:

```typescript
// OLD: Direct upload without auth
curl -X POST /api/v1/storage/upload -F "file=@document.pdf"

// NEW: Required authentication
curl -X POST /api/v1/storage/upload \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@document.pdf"
```

## Monitoring & Maintenance

### Audit Log Monitoring

```bash
# View recent uploads
GET /api/v1/storage/audit?action=upload&limit=50

# View failed operations
GET /api/v1/storage/audit?success=false

# Archive old logs (admin only)
DELETE /api/v1/storage/audit?olderThanDays=90
```

### File Cleanup

- Soft-deleted files are automatically scheduled for hard deletion
- Configure `HARD_DELETE_DELAY_HOURS` for your recovery window needs
- Monitor storage usage and implement cleanup policies

## Security Compliance

This implementation supports:

- **SOC 2 Type II**: Comprehensive audit trails and access controls
- **GDPR**: User data protection and deletion capabilities
- **HIPAA**: Audit logging and secure file handling
- **Enterprise security**: Role-based access and monitoring

## Troubleshooting

### Common Issues:

1. **Authentication Required**: Ensure JWT token or API key is provided
2. **Rate Limited**: Reduce request frequency or contact admin
3. **File Too Large**: Check MAX_FILE_SIZE environment variable
4. **Access Denied**: Verify user owns the file or has admin role
5. **Audit Log Full**: Run log archival or increase storage

For support, check the audit logs for detailed error information.
