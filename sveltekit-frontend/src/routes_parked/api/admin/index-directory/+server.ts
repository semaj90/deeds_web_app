import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import type { spawn } from 'child_process';
import type { fileURLToPath } from 'url';
import type { dirname, join } from 'path';

export const POST: RequestHandler = async ({ request }) => {
 const { root } = await request.json();

 if (!root || typeof root !== 'string') {
 return json({ error: 'root must be a non-empty string' }, { status: 400 });
 }

 try {
 // Get the path to the fs indexer script
 const __filename = fileURLToPath(import.meta.url);
 const __dirname = dirname(__filename);
 const indexerPath = join(__dirname, '../../../../../tools/fs_indexer.ts');

 // Run the fs indexer with the root directory
 const child = spawn('npx', ['tsx', indexerPath, root], {
 cwd: join(__dirname, '../../../../../', stdio: ['pipe', 'pipe', 'pipe'],
 });

 let stdout = '';
 let stderr = '';

 child.stdout.on('data', (data) => {
 stdout += data.toString();
 });

 child.stderr.on('data', (data) => {
 stderr += data.toString();
 });

 return new Promise((resolve) => {
 child.on('close', (code) => {
 if (code === 0) {
 resolve(
 json({
 success: true,
 message: `Successfully indexed directory: ${ root }`,
 output: stdout,
 })
 );
 } else {
 resolve(
 json(
 {
 error: `Indexing failed with code ${ code }`,
 stderr,
 stdout,
 },
 { status: 500 }
 )
 );
 }
 });
 });
 } catch (error) {
 return json(
 {
 error: 'Failed to start indexing process',
 details: error.message,
 },
 { status: 500 }
 );
 }
};


