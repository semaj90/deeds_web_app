/**
 * Automated Database Backup to SeaweedFS (S3-compatible)
 * Phase 104 - Lane 7: Disaster Recovery
 *
 * Usage: node scripts/backup-db-to-seaweedfs.mjs
 */
import { execSync } from 'child_process';
import { resolve } from 'path';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { Client as MinioClient } from 'minio';
import 'dotenv/config';

// Load ENV from process.env (assuming .env is loaded)
const {
	POSTGRES_URL,
	MINIO_ENDPOINT,
	MINIO_ACCESS_KEY,
	MINIO_SECRET_KEY,
	MINIO_USE_SSL,
	MINIO_BACKUP_BUCKET = 'db-backups',
	MINIO_PORT = 8333 // Default SeaweedFS S3 port
} = process.env;

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFilename = `deeds-db-backup-${timestamp}.sql.gz`;
const backupPath = resolve(`./scripts/recovery/${backupFilename}`);

async function runBackup() {
	console.log(`🚀 Starting database backup to SeaweedFS: ${backupFilename}`);

	if (!existsSync('./scripts/recovery')) {
		mkdirSync('./scripts/recovery', { recursive: true });
	}

	try {
		// 1. Generate pg_dump and compress on the fly
		console.log('📦 Dumping and compressing database...');
		// Note: pg_dump must be in the system PATH
		execSync(`pg_dump "${POSTGRES_URL}" | gzip > "${backupPath}"`);
		console.log('✅ Local dump complete.');

		// 2. Upload to SeaweedFS via S3 API
		console.log(`📤 Uploading to SeaweedFS bucket: ${MINIO_BACKUP_BUCKET}...`);
		const minioClient = new MinioClient({
			endPoint: MINIO_ENDPOINT || 'localhost',
			port: parseInt(MINIO_PORT as string),
			useSSL: MINIO_USE_SSL === 'true',
			accessKey: MINIO_ACCESS_KEY || 'minio',
			secretKey: MINIO_SECRET_KEY || 'minio123'
		});

		// Ensure bucket exists
		const bucketExists = await minioClient.bucketExists(MINIO_BACKUP_BUCKET);
		if (!bucketExists) {
			await minioClient.makeBucket(MINIO_BACKUP_BUCKET, '');
			console.log(`📁 Created bucket: ${MINIO_BACKUP_BUCKET}`);
		}

		await minioClient.fPutObject(MINIO_BACKUP_BUCKET, backupFilename, backupPath);
		console.log(`✅ Upload successful: s3://${MINIO_BACKUP_BUCKET}/${backupFilename}`);

		// 3. Cleanup local file
		unlinkSync(backupPath);
		console.log('🧹 Local backup file cleaned up.');

	} catch (err) {
		console.error('❌ Backup failed:', err);
		process.exit(1);
	}
}

runBackup();
