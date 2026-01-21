/**
 * Secure Storage Client with proper error handling and conditional removal
 * Follows security best practices for file operations
 */

export interface UploadResponse {
    ok: boolean;
    bucket?: string;
    key?: string;
    url?: string;
    size?: number;
    type?: string;
    error?: string;
}

export interface DeleteResponse {
    ok: boolean;
    message?: string;
    softDelete?: boolean;
    hardDeleteScheduled?: boolean;
    hardDeleteAfter?: string;
    error?: string;
}

export interface StorageFile {
    bucket: string;
    key: string;
    url?: string;
    size?: number;
    type?: string;
    uploadedAt?: Date;
}

/**
 * Secure storage client with authentication and error handling
 */
export class SecureStorageClient {
    private baseUrl: string;
    private authToken?: string;

    constructor(baseUrl = '/api/v1/storage', authToken?: string) {
        this.baseUrl = baseUrl;
        this.authToken = authToken;
    }

    /**
     * Set authentication token
     */
    setAuthToken(token: string) {
        this.authToken = token;
    }

    /**
     * Get authentication headers
     */
    private getAuthHeaders(): Record<string, string> {
        const headers: Record<string, string> = {};
        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        return headers;
    }

    /**
     * Upload file with proper error handling and security
     */
    async uploadFile(
        file: File,
        bucket: string = 'legal-documents',
        customKey?: string
    ): Promise<UploadResponse> {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('bucket', bucket);
            if (customKey) {
                formData.append('key', customKey);
            }

            const response = await fetch(`${this.baseUrl}/upload`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: formData
            });

            // Handle non-JSON responses or errors gracefully
            if (!response.ok) {
                // Try to parse error message if possible
                try {
                    const result = await response.json();
                    return { ok: false, error: result?.error ?? 'Upload failed' };
                } catch {
                    return { ok: false, error: `Upload failed: ${response.statusText}` };
                }
            }

            const result: UploadResponse = await response.json();
            return result;
        } catch (error) {
            console.error('Upload error:', error);
            return { ok: false, error: 'Network error during upload' };
        }
    }

    /**
     * Delete file with conditional client-side removal
     * Only removes from client state if server confirms deletion
     */
    async deleteFile(bucket: string, key: string): Promise<DeleteResponse> {
        try {
            const url = new URL(`${this.baseUrl}/delete`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
            url.searchParams.set('bucket', bucket);
            url.searchParams.set('key', key);

            const response = await fetch(url.toString(), {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                try {
                    const result = await response.json();
                    return { ok: false, error: result?.error ?? 'Delete failed' };
                } catch {
                    return { ok: false, error: `Delete failed: ${response.statusText}` };
                }
            }

            const result: DeleteResponse = await response.json();
            return result;
        } catch (error) {
            console.error('Delete error:', error);
            return { ok: false, error: 'Network error during delete' };
        }
    }

    /**
     * Check file deletion status
     */
    async getFileStatus(bucket: string, key: string): Promise<DeleteResponse> {
        try {
            const url = new URL(`${this.baseUrl}/status`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
            url.searchParams.set('bucket', bucket);
            url.searchParams.set('key', key);

            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: this.getAuthHeaders()
            });

            if (!response.ok) {
                try {
                    const result = await response.json();
                    return { ok: false, error: result?.error ?? 'Status check failed' };
                } catch {
                    return { ok: false, error: `Status check failed: ${response.statusText}` };
                }
            }

            const result: DeleteResponse = await response.json();
            return result;
        } catch (error) {
            console.error('Status error:', error);
            return { ok: false, error: 'Network error during status check' };
        }
    }

    /**
     * Batch upload multiple files
     */
    async uploadFiles(
        files: File[],
        bucket: string = 'legal-documents',
        onProgress?: (completed: number, total: number) => void
    ): Promise<{ successful: UploadResponse[]; failed: { file: File; error: string }[] }> {
        const successful: UploadResponse[] = [];
        const failed: Array<{ file: File; error: string }> = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const result = await this.uploadFile(file, bucket);

            if (result.ok) {
                successful.push(result);
            } else {
                failed.push({ file, error: result.error ?? 'Unknown error' });
            }

            if (onProgress) {
                onProgress(i + 1, files.length);
            }
        }

        return { successful, failed };
    }
}

/**
 * Reactive storage manager for Svelte components
 */
export class ReactiveStorageManager {
    private client: SecureStorageClient;
    private _files: StorageFile[] = [];
    private _loading = false;
    private _error: string | null = null;

    constructor(authToken?: string) {
        this.client = new SecureStorageClient('/api/v1/storage', authToken);
    }

    /**
     * Get current state
     */
    get state() {
        return {
            files: this._files,
            loading: this._loading,
            error: this._error
        };
    }

    /**
     * Get files
     */
    get files(): StorageFile[] {
        return this._files;
    }

    /**
     * Get loading state
     */
    get loading(): boolean {
        return this._loading;
    }

    /**
     * Get error state
     */
    get error(): string | null {
        return this._error;
    }

    /**
     * Set authentication token
     */
    setAuthToken(token: string) {
        this.client.setAuthToken(token);
    }

    /**
     * Upload file and update state
     */
    async uploadFile(file: File, bucket: string = 'legal-documents'): Promise<boolean> {
        this._loading = true;
        this._error = null;

        try {
            const result = await this.client.uploadFile(file, bucket);

            if (result.ok && result.key) {
                // Add to client state only after successful upload
                // Safely handle potential undefineds
                const newFile: StorageFile = {
                    bucket: result.bucket ?? bucket,
                    key: result.key,
                    url: result.url,
                    size: result.size,
                    type: result.type,
                    uploadedAt: new Date()
                };

                this._files = [...this._files, newFile]; // Trigger reactivity if used with Svelte 5 state
                return true;
            } else {
                this._error = result.error ?? 'Upload failed';
                return false;
            }
        } catch (error) {
            this._error = error instanceof Error ? error.message : 'Upload failed';
            return false;
        } finally {
            this._loading = false;
        }
    }

    /**
     * Delete file and update state conditionally
     */
    async deleteFile(bucket: string, key: string): Promise<boolean> {
        this._loading = true;
        this._error = null;

        try {
            const result = await this.client.deleteFile(bucket, key);

            if (result.ok) {
                // Remove from client state only after successful server deletion
                this._files = this._files.filter((f) => !(f.bucket === bucket && f.key === key));
                return true;
            } else {
                this._error = result.error ?? 'Delete failed';
                return false;
            }
        } catch (error) {
            this._error = error instanceof Error ? error.message : 'Delete failed';
            return false;
        } finally {
            this._loading = false;
        }
    }

    /**
     * Clear error state
     */
    clearError() {
        this._error = null;
    }

    /**
     * Refresh file list (if you have a list endpoint)
     */
    async refreshFiles() {
        // Implementation would depend on having a list endpoint
        console.log('File refresh not implemented yet');
    }
}

/**
 * Create a new storage manager instance
 */
export function createStorageManager(authToken?: string) {
    return new ReactiveStorageManager(authToken);
}
