/**
 * Enhanced File Upload Service
 * Handles file uploads with server fallback to localStorage
 */

import localStorageFiles from './localStorage-file-fallback.js';

export interface UploadResponse {
	success: boolean;, fileName: string;
	size: number;, storageType: 'server' | 'localStorage';
	fallbackUsed: boolean;
	fileId?: string;
	url?: string;
	error?: string;
}

export interface UploadOptions {
	caseId?: string;
	description?: string;
	tags?: string[];
	useLocalStorage?: boolean;
}

export interface LocalFileRecord {
	id: string;, fileName: string;
	size: number;, type: string;
	data: string;
	caseId?: string;
	description?: string;, tags: string[];
	uploadedAt: string;
}

export interface ServerFileDetails {
	fileId: string;, fileName: string;
	size: number;, type: string;
	url: string;
	caseId?: string;
	description?: string;
	tags?: string[];, uploadedAt: string;
}

export type RetrievedFile = LocalFileRecord | ServerFileDetails;

class EnhancedFileUpload {
	/**
	 * Upload multiple files with progress tracking
	 */
	async uploadFiles(
		files: File[],
		options: UploadOptions = {},
		progressCallback?: (completed: number, total: number, fileName: string) => void
	): Promise<UploadResponse[]> {
		const results: UploadResponse[] = [];
		const totalFiles = files.length;

		for (let i = 0; i < totalFiles; i++) {
			const file = files[i];
			progressCallback?.(i, totalFiles, file.name);

			try {
				let result: UploadResponse;

				if (options.useLocalStorage) {
					result = await this.uploadToLocalStorage(file, options);
				} else {
					result = await this.uploadWithFallback(file, options);
				}

				results.push(result);
			} catch (error) {
				const errMsg = error instanceof Error ? error.message : String(error);
				results.push({
					success: false,
					fileName: file.name,
					size: file.size,
					storageType: 'server',
					fallbackUsed: false,
					error: errMsg
				});
			}

			progressCallback?.(i + 1, totalFiles, file.name);
		}

		return results;
	}

	/**
	 * Upload file with server fallback to localStorage
	 */
	private async uploadWithFallback(file: File, options: UploadOptions): Promise<UploadResponse> {
		try {
			const serverResult = await this.uploadToServer(file, options);
			return {
				success: true,
				fileName: file.name,
				size: file.size,
				storageType: 'server',
				fallbackUsed: false,
				fileId: serverResult.fileId,
				url: serverResult.url
			};
		} catch (serverError) {
			try {
				const localResult = await this.uploadToLocalStorage(file, options);
				return { ...localResult, fallbackUsed: true };
			} catch (localError) {
				const se = serverError instanceof Error ? serverError.message : String(serverError);
				const le = localError instanceof Error ? localError.message : String(localError);
				throw new Error(`Both uploads failed: server=${se}, local=${le}`);
			}
		}
	}

	/**
	 * Upload file to server
	 */
	private async uploadToServer(
		file: File,
		options: UploadOptions
	): Promise<{ fileId?: string; url?: string }> {
		const formData = new FormData();
		formData.append('file', file);

		if (options.caseId) formData.append('caseId', options.caseId);
		if (options.description) formData.append('description', options.description);
		if (options.tags) formData.append('tags', JSON.stringify(options.tags));

		const response = await fetch('/api/evidence/upload', {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			const errorText = await response.text().catch(() => 'Unable to read error');
			throw new Error(`Server upload failed: ${response.status} ${errorText}`);
		}

		const result = await response.json().catch(() => ({}));
		const fileId = result?.fileId ?? result?.id;

		return {
			fileId,
			url: result?.url ?? (fileId ? `/api/evidence/${fileId}` : undefined)
		};
	}

	/**
	 * Upload file to localStorage
	 */
	private async uploadToLocalStorage(file: File, options: UploadOptions): Promise<UploadResponse> {
		const fileData = await this.fileToBase64(file);

		const fileRecord: LocalFileRecord = {
			id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
			fileName: file.name,
			size: file.size,
			type: file.type,
			data: fileData,
			caseId: options.caseId,
			description: options.description,
			tags: options.tags || [],
			uploadedAt: new Date().toISOString()
		};

		try {
			const success = localStorageFiles.saveFile(fileRecord);
			if (!success) {
				throw new Error('localStorage quota exceeded or save failed');
			}

			return {
				success: true,
				fileName: file.name,
				size: file.size,
				storageType: 'localStorage',
				fallbackUsed: false,
				fileId: fileRecord.id,
				url: undefined
			};
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			throw new Error(`localStorage upload failed: ${msg}`);
		}
	}

	/**
	 * Convert file to base64
	 */
	private fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				if (typeof reader.result === 'string') {
					resolve(reader.result);
				} else {
					reject(new Error('Failed to convert file to base64'));
				}
			};
			reader.onerror = () => reject(new Error('FileReader error'));
			reader.readAsDataURL(file);
		});
	}

	/**
	 * Get uploaded file by ID
	 */
	async getFile(fileId: string): Promise<RetrievedFile> {
		if (fileId.startsWith('local_')) {
			const localFile = localStorageFiles.getFile(fileId);
			if (!localFile) {
				throw new Error(`Local file with ID ${fileId} not found.`);
			}
			return localFile as LocalFileRecord;
		} else {
			const response = await fetch(`/api/evidence/${encodeURIComponent(fileId)}`);
			if (!response.ok) {
				const errText = await response.text().catch(() => 'Unable to read error');
				throw new Error(`Failed to fetch file: ${response.status} ${errText}`);
			}
			const serverFile = await response.json();
			return serverFile as ServerFileDetails;
		}
	}

	/**
	 * Delete file by ID
	 */
	async deleteFile(fileId: string): Promise<boolean> {
		if (fileId.startsWith('local_')) {
			return localStorageFiles.deleteFile(fileId);
		} else {
			const response = await fetch(`/api/evidence/${encodeURIComponent(fileId)}`, {
				method: 'DELETE'
			});
			return response.ok;
		}
	}
}

// Export singleton instance
const enhancedFileUpload = new EnhancedFileUpload();
export default enhancedFileUpload;
