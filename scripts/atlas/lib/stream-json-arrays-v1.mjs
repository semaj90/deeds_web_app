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

export async function forEachJsonArrayObjectV1({ filePath, onValue, maxValues = 1_000_000, maxValueBytes = 8 * 1024 * 1024 }) {
	if (typeof filePath !== 'string' || typeof onValue !== 'function') throw new TypeError('JSON_ARRAY_READER_INPUT_INVALID');
	if (!Number.isSafeInteger(maxValues) || maxValues < 0 || !Number.isSafeInteger(maxValueBytes) || maxValueBytes < 1) {
		throw new RangeError('JSON_ARRAY_READER_BOUNDS_INVALID');
	}
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let started = false;
	let ended = false;
	let expectingItem = true;
	let commaSeen = false;
	let valueText = '';
	let valueBytes = 0;
	let objectDepth = 0;
	let inString = false;
	let escaped = false;
	let count = 0;
	const fail = (reason) => { throw new Error(reason); };
	const consume = async (text) => {
		for (const character of text) {
			if (!started) {
				if (/\s/.test(character)) continue;
				if (character !== '[') fail('JSON_ARRAY_EXPECTED_OPEN');
				started = true;
				continue;
			}
			if (ended) {
				if (!/\s/.test(character)) fail('JSON_ARRAY_TRAILING_CONTENT');
				continue;
			}
			if (objectDepth === 0) {
				if (/\s/.test(character)) continue;
				if (character === ']') {
					if (commaSeen) fail('JSON_ARRAY_TRAILING_COMMA');
					ended = true;
					continue;
				}
				if (character === ',') {
					if (expectingItem || commaSeen) fail('JSON_ARRAY_SEPARATOR_INVALID');
					expectingItem = true;
					commaSeen = true;
					continue;
				}
				if (character !== '{' || !expectingItem) fail('JSON_ARRAY_OBJECT_EXPECTED');
				if (count >= maxValues) fail('JSON_ARRAY_VALUE_LIMIT_EXCEEDED');
				valueText = '{';
				valueBytes = 1;
				objectDepth = 1;
				inString = false;
				escaped = false;
				expectingItem = false;
				commaSeen = false;
				continue;
			}
			valueText += character;
			valueBytes += Buffer.byteLength(character, 'utf8');
			if (valueBytes > maxValueBytes) fail('JSON_ARRAY_VALUE_SIZE_LIMIT_EXCEEDED');
			if (inString) {
				if (escaped) escaped = false;
				else if (character === '\\') escaped = true;
				else if (character === '"') inString = false;
				continue;
			}
			if (character === '"') inString = true;
			else if (character === '{') objectDepth += 1;
			else if (character === '}') {
				objectDepth -= 1;
				if (objectDepth < 0) fail('JSON_ARRAY_OBJECT_DEPTH_INVALID');
				if (objectDepth === 0) {
					let value;
					try { value = JSON.parse(valueText); } catch { fail('JSON_ARRAY_OBJECT_MALFORMED'); }
					await onValue(value, count);
					count += 1;
					valueText = '';
					valueBytes = 0;
				}
			}
		}
	};
	for await (const chunk of fs.createReadStream(filePath)) await consume(decoder.decode(chunk, { stream: true }));
	await consume(decoder.decode());
	if (!started) fail('JSON_ARRAY_EMPTY_INPUT');
	if (!ended || objectDepth !== 0 || inString) fail('JSON_ARRAY_TRUNCATED');
	return count;
}
