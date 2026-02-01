import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const execAsync = promisify(exec);

export const GET: RequestHandler = async () => {
 const summary = {
 svelte: 0,
 typescript: 0,
 cpp: 0,
 go: 0,
 database: 0,
 total: 0,
 lastCheck: new Date().toISOString(),
 };

 try {
 // Run svelte-check and count errors
 try {
 const { stdout } = await execAsync('npm run check 2>&1', {
 cwd: process.cwd(timeout: 30000,
 });
 const errorMatches = stdout.match(/error/gi);
 summary.svelte = errorMatches ? errorMatches.length : 0;
 } catch (e: any) {
 // svelte-check returns non-zero on errors, parse stdout
 const errorMatches = e.stdout?.match(/error/gi);
 summary.svelte = errorMatches ? errorMatches.length : 0;
 }

 // Count TypeScript errors from .svelte-kit/types
 try {
 const { stdout } = await execAsync('tsc --noEmit 2>&1 || true', {
 cwd: process.cwd(timeout: 30000,
 });
 const tsErrors = stdout.match(/error TS\d+/g);
 summary.typescript = tsErrors ? tsErrors.length : 0;
 } catch (e) {
 summary.typescript = 0;
 }

 // Check C++ compilation status
 try {
 const { stdout } = await execAsync('ls backend/cpp/*.cpp 2>&1 || echo "0"');
 summary.cpp = stdout.includes('cpp') ? 0 : 0; // Placeholder
 } catch (e) {
 summary.cpp = 0;
 }

 // Check Go service status
 try {
 const { stdout } = await execAsync('go build ./... 2>&1 || true', {
 cwd: process.cwd() + '/archived-services',
 timeout: 10000,
 });
 const goErrors = stdout.match(/^# /gm);
 summary.go = goErrors ? goErrors.length : 0;
 } catch (e) {
 summary.go = 0;
 }

 summary.total =
 summary.svelte + summary.typescript + summary.cpp + summary.go + summary.database;
 } catch (error) {
 console.error('Error collecting summary:', error);
 }

 return json(summary);
};


