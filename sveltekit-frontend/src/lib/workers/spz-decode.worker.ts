/// <reference lib="webworker" />
/**
 * Thin worker entry. All logic lives in $lib/splat/spz-decode-core.ts so it is unit-tested in Node.
 * Created by SpzDecodeClient with: new Worker(new URL('$lib/workers/spz-decode.worker.ts', import.meta.url), { type: 'module' })
 */
import { createSpzWorkerHandler, type SpzWorkerRequest, type SpzWorkerResponse } from '../splat/spz-decode-core.js';

const handle = createSpzWorkerHandler((msg: SpzWorkerResponse, transfer?: ArrayBuffer[]) =>
	(self as unknown as Worker).postMessage(msg, transfer ?? [])
);

self.onmessage = (ev: MessageEvent<SpzWorkerRequest>) => {
	void handle(ev.data);
};
