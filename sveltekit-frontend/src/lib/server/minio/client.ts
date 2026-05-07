import { Client as MinioClient } from 'minio';
import { ENV } from '$lib/server/env.server.js';

// Parse MINIO_ENDPOINT which may be: 'host', 'host:port', or 'http(s)://host:port'
const _raw = ENV.MINIO_ENDPOINT;
let _host = _raw;
let _port = Number(ENV.MINIO_PORT ?? 9000);
let _useSSL = (ENV.MINIO_USE_SSL ?? 'false') === 'true';
try {
	if (_raw.includes('://')) {
		const u = new URL(_raw);
		_host = u.hostname;
		if (u.port) _port = Number(u.port);
		_useSSL = u.protocol === 'https:';
	} else if (_raw.includes(':')) {
		const parts = _raw.split(':');
		if (parts.length >= 2) {
			_host = parts[0];
			const p = Number(parts[1]);
			if (!Number.isNaN(p)) _port = p;
		}
	}
} catch {
	// ignore and use defaults
}

const MINIO_ENDPOINT = _host;
const MINIO_PORT = _port;
const MINIO_USE_SSL = _useSSL;

const MINIO_ACCESS_KEY = ENV.MINIO_ACCESS_KEY;
const MINIO_SECRET_KEY = ENV.MINIO_SECRET_KEY;

export const minio = new MinioClient({
	endPoint: MINIO_ENDPOINT,
	port: MINIO_PORT,
	useSSL: MINIO_USE_SSL,
	accessKey: MINIO_ACCESS_KEY,
	secretKey: MINIO_SECRET_KEY,
});

export async function ensureBucket(bucketName: string): Promise<boolean> {
	try {
		const exists = await minio.bucketExists(bucketName);
		if (!exists) {
			await minio.makeBucket(bucketName);
		}
		return true;
	} catch (err: unknown) {
		if (err instanceof Error) {
			console.error('MinIO ensureBucket error:', err.message, err);
		} else {
			console.error('MinIO ensureBucket error (non-Error):', err);
		}
		throw err;
	}
}

export async function putObject(
	bucketName: string,
	objectName: string,
	buffer: Buffer,
	meta?: Record<string, string>
): Promise<string | undefined> {
	try {
		await ensureBucket(bucketName);
		const result = await minio.putObject(bucketName, objectName, buffer, meta || {});
		return (result as unknown as string) ?? undefined;
	} catch (err: unknown) {
		// If MinIO is not configured or credentials are invalid in dev, fall back to local storage
		try {
			console.warn(
				'MinIO putObject failed, falling back to local storage:',
				err instanceof Error ? err.message : String(err)
			);
			const path = await import('path');
			const fs = await import('fs/promises');
			const projectRoot = path.resolve(process.cwd());
			const localDir = path.join(projectRoot, '.local_storage', bucketName);
			await fs.mkdir(localDir, { recursive: true });
			const localPath = path.join(localDir, objectName);
			await fs.writeFile(localPath, buffer);
			return `file://${localPath}`;
		} catch (fsErr) {
			console.error('MinIO fallback to local storage failed:', fsErr);
			throw err;
		}
	}
}
