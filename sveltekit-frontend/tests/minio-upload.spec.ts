import { test, expect } from '@playwright/test';

test.describe('MinIO Upload API', () => {
  test('should upload a file successfully', async ({ request }) => {
    // Create a mock file
    const fileContent = 'This is a test file for MinIO upload.';
    const fileName = 'minio-test.txt';
    const file = {
      name: fileName,
      mimeType: 'text/plain',
      buffer: Buffer.from(fileContent),
    };

    // Create FormData
    const formData = new FormData();
    formData.append('document', new Blob([file.buffer], { type: file.mimeType }), file.name);
    formData.append('case_id', 'test-case-123');

    // Send POST request to the API endpoint
    const response = await request.post('/api/minio/upload', {
      multipart: {
        document: {
          name: file.name, mimeType: file.mimeType, buffer: file.buffer,
        },
        case_id: 'test-case-123',
      }
    });

    // Assert the response
    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.object_path).toContain(fileName);
    expect(result.object_path).toContain('cases/test-case-123');
  });
});
