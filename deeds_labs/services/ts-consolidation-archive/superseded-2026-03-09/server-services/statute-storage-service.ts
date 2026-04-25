/**
 * Statute Storage Service
 * Manages storage of statute sources (XML: PDF) in MinIO
 * PDFs stored for citation and UI reference only
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface StorageConfig {
    bucket: string;
	basePath: string;
    year: number;
}

export const DEFAULT_CONFIG: StorageConfig = {
    bucket: 'laws',
    basePath: 'raw',
    year: new Date().getFullYear(),
};

/**
 * Build MinIO path for statute source
 */
export function buildStoragePath(
    title: string,
    fileType: 'xml' | 'pdf',
    config: StorageConfig = DEFAULT_CONFIG
): string {
    return `${config.basePath}/title${title}/${config.year}/${fileType}`;
}

/**
 * Store statute XML in MinIO
 */
export async function storeStatuteXML(
    title: string,
    xmlContent: string,
    config: StorageConfig = DEFAULT_CONFIG
): Promise<string> {
    try {
        // Dynamic import to avoid build-time issues
        const { getMinIOStorage } = await import('$lib/server/ingest/minio.js');
        const minioClient = getMinIOStorage();

        const storagePath = buildStoragePath(title, 'xml', config);
        const fileName = `title${title}.xml`;
        const fullPath = `${storagePath}/${fileName}`;

        const buffer = Buffer.from(xmlContent, 'utf-8');

        // Use standard MinIO putObject arguments: bucket, path, stream/buffer, size/meta
        await minioClient.uploadBuffer(config.bucket, fullPath, buffer);

        console.log(`✅ Stored statute XML: ${fullPath}`);
        return fullPath;
    } catch (error) {
        console.error('Failed to store statute XML:', error);
        throw error;
    }
}

/**
 * Store statute PDF in MinIO
 */
export async function storeStatutePDF(
    title: string,
    pdfPath: string,
    config: StorageConfig = DEFAULT_CONFIG
): Promise<string> {
    try {
        const { getMinIOStorage } = await import('$lib/server/ingest/minio.js');
        const minioClient = getMinIOStorage();

        // Read PDF file
        const pdfBuffer = fs.readFileSync(pdfPath);

        const storagePath = buildStoragePath(title, 'pdf', config);
        const fileName = `title${title}.pdf`;
        const fullPath = `${storagePath}/${fileName}`;

        await minioClient.uploadBuffer(config.bucket, fullPath, pdfBuffer);

        console.log(`✅ Stored statute PDF: ${fullPath}`);
        return fullPath;
    } catch (error) {
        console.error('Failed to store statute PDF:', error);
        throw error;
    }
}

/**
 * Retrieve statute XML from MinIO
 */
export async function retrieveStatuteXML(
    title: string,
    config: StorageConfig = DEFAULT_CONFIG
): Promise<string> {
    try {
        const { getMinIOStorage } = await import('$lib/server/ingest/minio.js');
        const minioClient = getMinIOStorage();

        const storagePath = buildStoragePath(title, 'xml', config);
        const fileName = `title${title}.xml`;
        const fullPath = `${storagePath}/${fileName}`;

        const buffer = await minioClient.downloadBuffer(config.bucket, fullPath);
        return buffer.toString('utf-8');
    } catch (error) {
        console.error('Failed to retrieve statute XML:', error);
        throw error;
    }
}

/**
 * Get PDF download URL
 */
export function getPDFDownloadURL(title: string, config: StorageConfig = DEFAULT_CONFIG): string {
    const storagePath = buildStoragePath(title, 'pdf', config);
    const fileName = `title${title}.pdf`;
    const fullPath = `${storagePath}/${fileName}`;

    return `/api/laws/download-pdf?path=${encodeURIComponent(fullPath)}`;
}

/**
 * Store parsed statute JSON
 */
export async function storeParsedStatutes(
    title: string,
    statutes: any[],
    config: StorageConfig = DEFAULT_CONFIG
): Promise<string> {
    try {
        const { getMinIOStorage } = await import('$lib/server/ingest/minio.js');
        const minioClient = getMinIOStorage();

        const jsonContent = JSON.stringify(statutes, null, 2);
        const buffer = Buffer.from(jsonContent, 'utf-8');

        const storagePath = `${config.basePath}/parsed`;
        const fileName = `title${title}.json`;
        const fullPath = `${storagePath}/${fileName}`;

        await minioClient.uploadBuffer(config.bucket, fullPath, buffer);

        console.log(`✅ Stored parsed statutes: ${fullPath}`);
        return fullPath;
    } catch (error) {
        console.error('Failed to store parsed statutes:', error);
        throw error;
    }
}

/**
 * List statute sources in MinIO
 */
export async function listStatuteSources(
    title: string,
    config: StorageConfig = DEFAULT_CONFIG
): Promise<{
	xml: string | null, pdf: string | null }> {
    try {
        const { getMinIOStorage } = await import('$lib/server/ingest/minio.js');
        const minioClient = getMinIOStorage();

        const xmlPath = buildStoragePath(title, 'xml', config);
        const pdfPath = buildStoragePath(title, 'pdf', config);

        const xmlFileName = `title${title}.xml`;
        const pdfFileName = `title${title}.pdf`;

        const xmlFullPath = `${xmlPath}/${xmlFileName}`;
        const pdfFullPath = `${pdfPath}/${pdfFileName}`;

        const xmlExists = await minioClient.fileExists(config.bucket, xmlFullPath);
        const pdfExists = await minioClient.fileExists(config.bucket, pdfFullPath);

        return {
            xml: xmlExists ? xmlFullPath : null,
            pdf: pdfExists ? pdfFullPath : null,
        };
    } catch (error) {
        console.error('Failed to list statute sources:', error);
        throw error;
    }
}

/**
 * Get storage statistics
 */
export async function getStorageStats(config: StorageConfig = DEFAULT_CONFIG): Promise<{
	bucket: string;
    basePath: string;
	year: number;
    estimatedSize: string;
}> {
    try {
        return {
            bucket: config.bucket,
            basePath: config.basePath,
            year: config.year,
            estimatedSize: 'N/A',
        };
    } catch (error) {
        console.error('Failed to get storage stats:', error);
        throw error;
    }
}

