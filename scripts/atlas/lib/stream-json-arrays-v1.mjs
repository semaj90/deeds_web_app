import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { finished } from 'node:stream/promises';

async function writeChunk(stream, chunk) {
	if (!stream.write(chunk)) await once(stream, 'drain');
}

export async function createJsonArrayWriterV1(filePath) {
	const stream = fs.createWriteStream(filePath, { flags: 'wx' });
	await new Promise((resolve, reject) => {
		stream.once('open', resolve);
		stream.once('error', reject);
	});
	let first = true;
	let count = 0;
	await writeChunk(stream, '[');
	return {
		get count() { return count; },
		async append(value) {
			const serialized = JSON.stringify(value);
			if (serialized === undefined) throw new TypeError('JSON_ARRAY_VALUE_NOT_SERIALIZABLE');
			await writeChunk(stream, `${first ? '' : ','}${serialized}`);
			first = false;
			count += 1;
		},
		async close() {
			stream.end(']');
			await finished(stream);
		},
		abort(error) {
			stream.destroy(error);
		},
	};
}

export async function writeJsonObjectWithArrayFilesV1({ outputPath, properties, arrays }) {
	if (!outputPath || !properties || !Array.isArray(arrays) || arrays.length === 0) {
		throw new TypeError('JSON_OBJECT_ARRAY_INPUT_INVALID');
	}
	const keys = new Set(Object.keys(properties));
	for (const array of arrays) {
		if (!array || typeof array.key !== 'string' || !array.key || typeof array.filePath !== 'string' || keys.has(array.key)) {
			throw new TypeError('JSON_OBJECT_ARRAY_DESCRIPTOR_INVALID');
		}
		keys.add(array.key);
	}
	const directory = path.dirname(outputPath);
	const partialPath = path.join(directory, `.${path.basename(outputPath)}.${randomUUID()}.partial`);
	const output = fs.createWriteStream(partialPath, { flags: 'wx' });
	await new Promise((resolve, reject) => {
		output.once('open', resolve);
		output.once('error', reject);
	});
	try {
		const propertyEntries = Object.entries(properties);
		await writeChunk(output, '{');
		let separator = '';
		for (const [key, value] of propertyEntries) {
			await writeChunk(output, `${separator}${JSON.stringify(key)}:${JSON.stringify(value)}`);
			separator = ',';
		}
		for (const { key, filePath } of arrays) {
			await writeChunk(output, `${separator}${JSON.stringify(key)}:`);
			for await (const chunk of fs.createReadStream(filePath)) await writeChunk(output, chunk);
			separator = ',';
		}
		await writeChunk(output, '}');
		output.end();
		await finished(output);
		await fs.promises.link(partialPath, outputPath);
	} catch (error) {
		output.destroy();
		throw error;
	} finally {
		await fs.promises.rm(partialPath, { force: true });
	}
}
