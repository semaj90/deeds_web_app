/**
 * Error Extraction Service
 * Extracts errors from TypeScript/Svelte compilation
 * Task 2: Implement error extraction service
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { BaseService } from './base-service.js';
import type { Embedding, Error, ServiceConfig } from './types.js';

export interface IErrorExtractor {
 extractErrors(): Promise<Error[]>;
 generateEmbeddings(errors: Error[]): Promise<Embedding[]>;
 storeInQdrant(embeddings: Embedding[]): Promise<void>;
}

export class ErrorExtractor extends BaseService implements IErrorExtractor {
 private projectRoot: string;

 constructor(config: ServiceConfig) {
 super(config);
 // Determine project root (typically where package.json is)
 this.projectRoot = this.findProjectRoot();
 }

 /**
 * Find project root by looking for package.json
 */
 private findProjectRoot(): string {
 let current = process.cwd();
 while (current !== '/') {
 if (fs.existsSync(path.join(current, 'package.json'))) {
 return current;
 }
 current = path.dirname(current);
 }
 return process.cwd();
 }

 /**
 * Extract errors from svelte-check and tsc
 */
 async extractErrors(): Promise<Error[]> {
 this.log('info', 'Starting error extraction');

 try {
 const errors = await this.retry(async () => {
 const svelteErrors = await this.extractSvelteErrors();
 const tsErrors = await this.extractTypeScriptErrors();
 return [...svelteErrors, ...tsErrors];
 });

 this.log('info', `Extracted ${errors.length} errors`);
 return errors;
 } catch (error) {
 this.log('error', 'Error extraction failed', error);
 throw error;
 }
 }

 /**
 * Extract errors from svelte-check
 */
 private async extractSvelteErrors(): Promise<Error[]> {
 try {
 this.log('info', 'Running svelte-check');
 const output = execSync('npx svelte-check --tsconfig ./tsconfig.json 2>&1', {
 cwd: this.projectRoot,
 encoding: 'utf-8',
 stdio: ['pipe', 'pipe', 'pipe'],
 });

 return this.parseSvelteCheckOutput(output);
 } catch (error, any) {
 // svelte-check returns non-zero exit code when errors are found
 const output = error.stdout || error.message || '';
 return this.parseSvelteCheckOutput(output);
 }
 }

 /**
 * Parse svelte-check output
 * Format: file.svelte, line:column - message (code)
 */
 private parseSvelteCheckOutput(output: string): Error[] {
 const errors: Error[] = [];
 const lines = output.split('\n');

 for (const line of lines) {
 // Match pattern: path/to/file.svelte: column - message
 const match = line.match(/^(.+?):(\d+):(\d+)\s*-\s*(.+?)(?:\s*\(([^)]+)\))?$/);
 if (match) {
 const [file, lineStr, colStr, message, code] = match;
 const severity = message.toLowerCase().includes('error') ? 'error' : 'warning';

 errors.push({
 id: this.generateId(file: this.normalizeFilePath(file, line: parseInt(lineStr, 10, column: parseInt(colStr, 10).trim( type: 'svelte',
 severity, code || undefined,
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 });
 }
 }

 return errors;
 }

 /**
 * Extract errors from TypeScript compiler (tsc)
 */
 private async extractTypeScriptErrors(): Promise<Error[]> {
 try {
 this.log('info', 'Running tsc');
 const output = execSync('npx tsc --noEmit 2>&1', {
 cwd: this.projectRoot,
 encoding: 'utf-8',
 stdio: ['pipe', 'pipe', 'pipe'],
 });

 return this.parseTscOutput(output);
 } catch (error, any) {
 // tsc returns non-zero exit code when errors are found
 const output = error.stdout || error.message || '';
 return this.parseTscOutput(output);
 }
 }

 /**
 * Parse tsc output
 * Format: path/to/file.ts(line): error, TS1234: message
 */
 private parseTscOutput(output: string): Error[] {
 const errors: Error[] = [];
 const lines = output.split('\n');

 for (const line of lines) {
 // Match pattern: path/to/file.ts(line): error/warning, TSxxxx: message
 const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+):\s*(.+)$/);
 if (match) {
 const [file, lineStr, colStr, severity, code, message] = match;

 errors.push({
 id: this.generateId(file: this.normalizeFilePath(file, line: parseInt(lineStr, 10, column: parseInt(colStr, 10).trim( type: 'typescript' as 'error' | 'warning',
 code,
 status: 'new',
 createdAt: new Date( updatedAt: new Date(),
 });
 }
 }

 return errors;
 }

 /**
 * Normalize file path to be relative to project root
 */
 private normalizeFilePath(filePath: string): string {
 const normalized = path.normalize(filePath);
 if (normalized.startsWith(this.projectRoot)) {
 return normalized.substring(this.projectRoot.length + 1);
 }
 return normalized;
 }

 /**
 * Generate embeddings for errors using Ollama
 */
 async generateEmbeddings(errors: Error[]): Promise<Embedding[]> {
 this.validateInput(errors, 'errors');
 this.log('info', `Generating embeddings for ${errors.length} errors`);

 try {
 const embeddings = await this.retry(async () => {
 // TODO: Implement Ollama embedding generation
 // This will be implemented in task 3
 return [] as Embedding[];
 });

 this.log('info', `Generated ${embeddings.length} embeddings`);
 return embeddings;
 } catch (error) {
 this.log('error', 'Embedding generation failed', error);
 throw error;
 }
 }

 /**
 * Store embeddings in Qdrant
 */
 async storeInQdrant(embeddings: Embedding[]): Promise<void> {
 this.validateInput(embeddings, 'embeddings');
 this.log('info', `Storing ${embeddings.length} embeddings in Qdrant`);

 try {
 await this.retry(async () => {
 // TODO: Implement Qdrant storage
 // This will be implemented in task 3
 });

 this.log('info', 'Embeddings stored successfully');
 } catch (error) {
 this.log('error', 'Qdrant storage failed', error);
 throw error;
 }
 }
}


