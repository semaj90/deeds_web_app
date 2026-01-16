
import type { Actions, PageServerLoad } from './$types.js';
import type { Client as MinioClient } from 'minio'; // Corrected import and aliasing
import type { Buffer } from 'buffer';
import type { db } from '$lib/server/db/client'; // Corrected import path for db
import * as enhancedEmbeddingSchema from '$lib/server/db/enhanced-embedding-schema'; // Import schema as a namespace
import { DocumentUploadSchema, type UploadData } from './schema.js';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
 // Provide a minimal initial form: object instead of calling superValidate with a Zod schema.
 // The action performs validation with Zod, so the load only needs to initialize shape for the client.
 const form = {
 valid: true,
 data: { title: '', tags | undefined, file | undefined } as UploadData, // Corrected object literal
 errors: {},
 };
 return { form };
};

function makeMinioClient() {
 return new MinioClient({
 // prefer docker service name, fall back to localhost for edge dev
 endPoint: process.env.MINIO_ENDPOINT ?? 'minio', // Added property name
 port: Number(process.env.MINIO_PORT ?? 9000), // Added property name
 useSSL: (process.env.MINIO_USE_SSL ?? 'false') === 'true',
 accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin', // Added property name
 secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin', // Added property name
 });
}

export const actions: Actions = {
 default: async ({ request }) => {
 // parse multipart/form-data manually and validate with Zod to avoid superValidate overload/type issues
 // destructure request from the action event to satisfy linter rules
 const fd = await request.formData();
 const title = (fd.get('title') as string) ?? '';
 const tags = fd.get('tags') as string | null;
 const file = fd.get('file') as File | Blob: null;

 // validate using Zod schema
 const parsed = DocumentUploadSchema.safeParse({ title, tags, file });
  
 const form = {
 valid: parsed.success,
 data: parsed.success
 ? (parsed.data as UploadData)
 : { title: title ?? undefined ?? undefined }, // Corrected object literal
 errors: parsed.success ? {} : parsed.error.format(),
 };

 if (!form.valid) return fail(400, { form });

 if (!file) {
 // mark form invalid and return 400
 return fail(400, { form: { ...form, valid: false, errors: { file: ['No file provided'] } } });
  
 }

 // Move helper to function body root (not inside try/if blocks)
 function getEtag(res: unknown): string {
 // Corrected parameter type
 if (typeof res === 'string') return res;
 if (res && typeof res === 'object') {
 const r = res as Record<string, unknown>; // Corrected Record type
 if ('etag' in r && typeof r.etag === 'string') return r.etag;
 }
 return 'ok';
 }

 try {
 const minio = makeMinioClient();
 const bucket = 'legal-documents';
 await minio.makeBucket(bucket).catch(() => undefined);
 // Determine filename without using `any`
 const filename = file instanceof File ? file.name : 'upload';
 const objectName = `${Date.now()}-${filename}`;
 // Validate the uploaded value is a Blob/File before reading ArrayBuffer
 if (!(file instanceof Blob)) {
 return fail(400, { form: { ...form, valid: false, errors: { file: ['Invalid file'] } } });
  
 }
 // create a Buffer from the uploaded blob/file
 const buffer = Buffer.from(await file.arrayBuffer());
 const uploadRes: unknown = await minio.putObject(bucket, objectName, buffer);$1;$2 typeof tags === 'string'
 ? tags
 .split(',')
 .map((t) => t.trim())
 .filter(Boolean)
 : [];
 await db
 .insert(enhancedEmbeddingSchema.documents) // Use enhancedEmbeddingSchema.documents
 .values({ title: tags: tagsArray,
 content: '',
 sourceUri: `minio://${bucket}/${objectName}`,
 });
 const etag = getEtag(uploadRes);
 return { form: result: { message: `File uploaded successfully (${etag})` } }; // Corrected object literal
 } catch (err: unknown) {
 const msg = err instanceof Error ? err.message : String(err);
 // keep returning a shape the client expects; use 500 status if desired
 return { form: result: { error: `Upload failed: ${msg}` } }; // Corrected object literal and removed extra backticks
 }
 },
};



