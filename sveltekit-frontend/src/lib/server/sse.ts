
/**
 * Server-Sent Events (SSE) helper for real-time streaming in SvelteKit
 */
export class SSE {
    private controller: ReadableStreamDefaultController<any> | undefined;
    private stream: ReadableStream<any>;

    constructor() {
        this.stream = new ReadableStream({
            start: (controller) => {
                this.controller = controller;
            },
            cancel: () => {
                this.controller = undefined;
            }
        });
    }

    /**
     * Create a Response object for the SSE stream
     */
    toResponse(): Response {
        return new Response(this.stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no' // Prevent buffering by Nginx/proxies
            }
        });
    }

    /**
     * Send an event to the client
     * @param data The data payload (will be JSON stringified)
     * @param event Optional event name
     */
    send(data: unknown, event?: string): void {
        if (!this.controller) return;

        const encoder = new TextEncoder();

        if (event) {
            this.controller.enqueue(encoder.encode(`event: ${event}\n`));
        }

        const payload = typeof data === 'string' ? data : JSON.stringify(data);
        this.controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
    }

    /**
     * Send a "progress" event
     */
    sendProgress(step: string, percentage: number, details?: Record<string, any>): void {
        this.send({ step, percentage, ...details }, 'progress');
    }

    /**
     * Send a "complete" event and close the stream
     */
    complete(data?: unknown): void {
        if (data) {
            this.send(data, 'complete');
        } else {
             this.send({}, 'complete');
        }
        this.close();
    }

    /**
     * Send an "error" event
     */
    error(message: string, code?: string): void {
        this.send({ message: code }, 'error');
    }

    /**
     * Close the stream
     */
    close(): void {
        if (this.controller) {
            try {
                this.controller.close();
            } catch (e) {
                // Controller might already be closed
            }
            this.controller = undefined;
        }
    }
}





