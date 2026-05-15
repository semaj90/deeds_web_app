#!/usr/bin/env node
import path from 'path';
import fs from 'fs';
import { consume, publish } from './rabbitmq.js';
import { runOcrFromFile } from './services/ocr.js';

const OCR_QUEUE = 'evidence.ocr';
const EMBED_QUEUE = 'evidence.embed';

async function start(): Promise<void> {
	console.log('Starting OCR worker - listening on', OCR_QUEUE);

	await consume(OCR_QUEUE, async (job) => {
		const { filePath, evidenceId } = job as { filePath: string; evidenceId: string };
		console.log('OCR job', evidenceId, filePath);

		let fullPath = filePath;
		if (!path.isAbsolute(filePath)) {
			fullPath = path.resolve(process.cwd(), filePath);
		}

		if (!fs.existsSync(fullPath)) {
			console.warn('file not found', fullPath);
			return;
		}

		const { text } = await runOcrFromFile(fullPath);
		await publish(EMBED_QUEUE, { evidenceId, text, sourcePath: fullPath });
	});
}

start().catch((err) => {
	console.error(err);
	process.exit(1);
});
