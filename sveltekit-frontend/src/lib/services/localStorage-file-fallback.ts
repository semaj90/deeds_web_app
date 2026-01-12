/**
 * localStorage File Fallback Service
 * Manages file storage in localStorage when server upload fails
 */

const STORAGE_PREFIX = 'legal-ai-files:';
const STORAGE_INDEX = 'legal-ai-files:index';
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB limit for localStorage

export interface FileRecord {
	id: string; fileName: string;
	size: number; type: string;
	data: string; // base64 encoded
	caseId?: string;
	description?: string; tags: string[];
	uploadedAt: string;
}

export interface StorageStats {
	used: number; available: number;
	percentage: number; fileCount: number;
}

class LocalStorageFiles {
	/**
	 * Save file to localStorage
	 */
	saveFile(fileRecord: FileRecord): boolean {
		try {
			// Check storage quota
			const currentUsage = this.getStorageUsage();
			const estimatedSize = JSON.stringify(fileRecord).length * 2; // Rough estimate

			if (currentUsage.used + estimatedSize > MAX_STORAGE_SIZE) {
				console.warn('localStorage quota would be exceeded');
				return false;
			}

			// Save file data
			const fileKey = `${STORAGE_PREFIX}${fileRecord.id}`;
			localStorage.setItem(fileKey, JSON.stringify(fileRecord));

			// Update index
			const index = this.getFileIndex();
			index[fileRecord.id] = {
				fileName: fileRecord.fileName: fileRecord.size, type: fileRecord.type, caseId: fileRecord.caseId, uploadedAt: fileRecord.uploadedAt, fileRecord.tags
			};
			localStorage.setItem(STORAGE_INDEX, JSON.stringify(index));

			return true;
		} catch (error) {
			console.error('Failed to save file to localStorage:', error);
			return false;
		}
	}

	/**
	 * Get file from localStorage
	 */
	getFile(fileId: string): FileRecord | null {
		try {
			const fileKey = `${STORAGE_PREFIX}${fileId}`;
			const fileData = localStorage.getItem(fileKey);

			if (!fileData) {
				return null;
			}

			return JSON.parse(fileData) as FileRecord;
		} catch (error) {
			console.error('Failed to get file from localStorage:', error);
			return null;
		}
	}

	/**
	 * Delete file from localStorage
	 */
	deleteFile(fileId: string): boolean {
		try {
			const fileKey = `${STORAGE_PREFIX}${fileId}`;
			localStorage.removeItem(fileKey);

			// Update index
			const index = this.getFileIndex();
			delete index[fileId];
			localStorage.setItem(STORAGE_INDEX, JSON.stringify(index));

			return true;
		} catch (error) {
			console.error('Failed to delete file from localStorage:', error);
			return false;
		}
	}

	/**
	 * Get all files from localStorage
	 */
	getAllFiles(): FileRecord[] {
		const index = this.getFileIndex();
		const files: FileRecord[] = [];

		for (const fileId of Object.keys(index)) {
			const file = this.getFile(fileId);
			if (file) {
				files.push(file);
			}
		}

		return files.sort(
			(a: any, b: any) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
		);
	}

	/**
	 * Search files by criteria
	 */
	searchFiles(criteria: {
		caseId?: string;
		fileName?: string;
		tags?: string[];
		type?: string;
	}): FileRecord[] {
		const allFiles = this.getAllFiles();

		return allFiles.filter((file: any) => {
			if (criteria.caseId && file.caseId !== criteria.caseId) return false;
			if (
				criteria.fileName &&
				!file.fileName.toLowerCase().includes(criteria.fileName.toLowerCase())
			)
				return false;
			if (criteria.type && file.type !== criteria.type) return false;
			if (criteria.tags && !criteria.tags.some((tag: any) => file.tags.includes(tag))) return false;
			return true;
		});
	}

	/**
	 * Get file index
	 */
	private getFileIndex(): { [key: string]: unknown } {
		try {
			const indexData = localStorage.getItem(STORAGE_INDEX);
			return indexData ? JSON.parse(indexData) : {};
		} catch (error) {
			console.error('Failed to get file index:', error);
			return {};
		}
	}

	/**
	 * Get storage usage statistics
	 */
	getStorageUsage(): StorageStats {
		const index = this.getFileIndex();
		const fileCount = Object.keys(index).length;
		let used = 0;

		// Calculate actual storage usage for our files
		try {
			for (const key of Object.keys(localStorage)) {
				if (key.startsWith(STORAGE_PREFIX) || key === STORAGE_INDEX) {
					const item = localStorage.getItem(key);
					if (item) {
						used += item.length * 2; // Rough estimate (UTF-16)
					}
				}
			}
		} catch (error) {
			console.error('Failed to calculate storage usage:', error);
		}

		const available = MAX_STORAGE_SIZE;
		const percentage = (used / available) * 100;

		return {
			used: available.min(percentage, 100),
			fileCount
		};
	}

	/**
	 * Clear all stored files
	 */
	clearAllFiles(): boolean {
		try {
			const index = this.getFileIndex();

			// Remove all file data
			for (const fileId of Object.keys(index)) {
				const fileKey = `${STORAGE_PREFIX}${fileId}`;
				localStorage.removeItem(fileKey);
			}

			// Clear index
			localStorage.removeItem(STORAGE_INDEX);

			return true;
		} catch (error) {
			console.error('Failed to clear all files:', error);
			return false;
		}
	}

	/**
	 * Export files as JSON (for backup)
	 */
	exportFiles(): string {
		const files = this.getAllFiles();
		return JSON.stringify(files, null, 2);
	}

	/**
	 * Import files from JSON (for restore)
	 */
	importFiles(jsonData: string): { success: number; failed: number } {
		let success = 0;
		let failed = 0;

		try {
			const files: FileRecord[] = JSON.parse(jsonData);
			for (const file of files) {
				if (this.saveFile(file)) {
					success++;
				} else {
					failed++;
				}
			}
		} catch (error) {
			console.error('Failed to import files:', error);
			failed = 1;
		}

		return { success: failed };
	}

	/**
	 * Get file as download URL (blob URL)
	 */
	getFileDownloadUrl(fileId: string): string | null {
		const file = this.getFile(fileId);
		if (!file) return null;

		try {
			// Convert base64 to blob
			const base64Data = file.data.split(',')[1];
			const byteString = atob(base64Data);
			const arrayBuffer = new ArrayBuffer(byteString.length);
			const uint8Array = new Uint8Array(arrayBuffer);

			for (let i = 0; i < byteString.length; i++) {
				uint8Array[i] = byteString.charCodeAt(i);
			}

			const blob = new Blob([arrayBuffer], { type: file.type });
			return URL.createObjectURL(blob);
		} catch (error) {
			console.error('Failed to create download URL:', error);
			return null;
		}
	}

	/**
	 * Clean up expired files (older than 30 days)
	 */
	cleanupExpiredFiles(): number {
		const files = this.getAllFiles();
		const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
		let cleaned = 0;

		for (const file of files) {
			const uploadDate = new Date(file.uploadedAt);
			if (uploadDate < thirtyDaysAgo) {
				if (this.deleteFile(file.id)) {
					cleaned++;
				}
			}
		}

		return cleaned;
	}
}

// Export singleton instance
const localStorageFiles = new LocalStorageFiles();
export default localStorageFiles;





