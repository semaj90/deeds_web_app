// upload-core.ts
// Small, well-typed upload manager used by MinIO upload components.

export type UploadResult = {
    success: boolean;
    id?: string;
    url?: string;
    fileName?: string;
    size?: number;
    message?: string;
};

export type FileState = {
    file: File;
    status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error' | 'canceled';
    progress: number; // 0-100
    attempts: number;
    error: string | null;
    result: UploadResult | null;
};

export interface UploadManagerOptions {
    maxConcurrency?: number;
    maxRetries?: number;
    enableGPUProcessing?: boolean;
    enableEmbeddings?: boolean;
    onProgress?: (state: FileState[]) => void;
    onComplete?: (results: UploadResult[]) => void;
}

export class UploadManager {
    fileStates: FileState[] = [];
    queue: FileState[] = [];
    active = 0;
    opts: Required<UploadManagerOptions>;

    constructor(opts?: UploadManagerOptions) {
        this.opts = {
            maxConcurrency: 3,
            maxRetries: 3,
            enableGPUProcessing: true,
            enableEmbeddings: true,
            onProgress: () => {},
            onComplete: () => {},
            ...opts
        };
    }

    addFiles(files: File[]) {
        const newStates = files.map(
            (f) =>
                ({
                    file: f,
                    status: 'pending',
                    progress: 0,
                    attempts: 0,
                    error: null,
                    result: null
                }) as FileState
        );
        this.fileStates.push(...newStates);
        this.queue.push(...newStates);
        this.emitProgress();
    }

    start() {
        const startWorkers = Math.min(this.opts.maxConcurrency, this.queue.length);
        for (let i = 0; i < startWorkers; i++) this.processQueue();
    }

    private async processQueue() {
        if (this.active >= this.opts.maxConcurrency) return;
        const next = this.queue.shift();
        if (!next) return;

        this.active++;
        try {
            await this.uploadSingle(next);
        } finally {
            this.active--;
            if (this.queue.length > 0) this.processQueue();
        }

        if (this.active === 0 && this.queue.length === 0) {
            this.opts.onComplete(this.fileStates.filter((s) => !!s.result).map((s) => s.result as UploadResult));
        }
    }

    private async uploadSingle(state: FileState) {
        state.status = 'uploading';
        state.attempts = (state.attempts ?? 0) + 1;
        this.emitProgress();

        try {
            // Simple upload to a placeholder endpoint. Replace with real MinIO signed upload logic later.
            const form = new FormData();
            form.append('file', state.file, state.file.name);

            const res = await fetch('/api/upload/minio', {
                method: 'POST',
                body: form
            });

            if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
            const json = await res.json().catch(() => ({}));

            state.result = {
                success: true,
                id: json?.id ?? '',
                url: json?.url ?? '',
                fileName: state.file.name,
                size: state.file.size
            };
            state.progress = 100;
            state.status = 'completed';

            // Optionally enqueue GPU processing / embeddings - best effort
            if (this.opts.enableGPUProcessing) {
                try {
                    await fetch('/api/gpu/process', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileName: state.file.name })
                    }).catch(() => null);
                } catch {
                    // ignore GPU errors; not blocking
                }
            }

            if (this.opts.enableEmbeddings) {
                try {
                    await fetch('/api/embed/process', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fileName: state.file.name })
                    }).catch(() => null);
                } catch {
                     // ignore
                }
            }
        } catch (e: unknown) {
            // Narrow unknown to string safely without using `any`
            const message = e instanceof Error ? e.message : String(e ?? 'Unknown error');
            state.error = message;
            state.status = 'error';

            if ((state.attempts ?? 0) < this.opts.maxRetries) {
                // simple backoff
                const delay = Math.min(5000, 500 * 2 ** ((state.attempts ?? 1) - 1));
                await new Promise((r) => setTimeout(r, delay));
                this.queue.push(state);
            }
        } finally {
            this.emitProgress();
        }
    }

    cancelAll() {
        this.queue = [];
        this.fileStates.forEach((s) => {
            if (s.status === 'uploading' || s.status === 'pending') s.status = 'canceled';
        });
        this.emitProgress();
    }

    private emitProgress() {
        try {
            this.opts.onProgress(this.fileStates);
        } catch {
            /* swallow */
        }
    }
}

export default UploadManager;
