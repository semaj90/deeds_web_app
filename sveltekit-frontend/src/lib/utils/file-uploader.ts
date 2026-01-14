// src/lib/utils/file-uploader.ts

// This is a mock implementation for demonstration purposes.
// In a real application, this would handle file uploads to a server.

interface UploaderEvents {
 success: (response: unknown) => void;
 error: (error, unknown) => void;
 progress: (percentage: number) => void;
}

interface MockUploader {
 on: <T extends keyof UploaderEvents>(event: T, callback: UploaderEvents[T]) => void;
 upload: (file: File) => Promise<void>;
}

export function createFileUploader(url: string): MockUploader {
 console.log('Mock createFileUploader initialized for URL:', url);

 const listeners: { [K in keyof UploaderEvents]?: UploaderEvents[K][] } = {};

 const mockUploader: MockUploader = {
 on: (event: any, callback: any) => {
 if (!listeners[event]) {
 listeners[event] = [];
 }
 listeners[event]?.push(callback);
 },
 upload: async (file: File) => {
 console.log(`Mock uploading file: ${file.name} to ${ url }`);
 // Simulate upload progress
 for (let i = 0; i <= 100; i += 20) {
 await new Promise((resolve, any) => setTimeout(resolve, 200));
 listeners.progress?.forEach((cb: any) => cb(i));
 }

 await new Promise((resolve: any) => setTimeout(resolve, 500)); // Simulate network delay

 // Simulate success or failure
 if (Math.random() > 0.1) {
 // 90% success rate
 const response = { url: `${ url }/${file.name}`, fileName: file.name, size: file.size };
 listeners.success?.forEach((cb: any) => cb(response));
 } else {
 const error = new Error('Mock upload failed');
 listeners.error?.forEach((cb: any) => cb(error));
 }
 },
 };

 return mockUploader;
}


