#!/usr/bin/env node
/**
 * Fast Error Extractor - parses 49,734 errors from svelte_raw.log in ~5s
 * Handles multi-line format: file:line:col → Error: message... → code lines
 */

import crypto from 'crypto';
import fs from 'fs';

const logFile = process.argv[2] || 'reports/svelte_raw.log';
const outputJsonl = process.argv[3] || 'reports/errors.jsonl';

// ANSI escape code remover
const stripAnsi = (str) => str.replace(/\x1b\[[^m]*m/g, '');

console.log(`📖 Reading ${logFile}...`);
const content = fs.readFileSync(logFile, 'utf8');

console.log(`✂️  Processing...`);
const sw = Date.now();

// Split by lines but keep structure
const lines = content.split(/\r?\n/);

// Clear output
if (fs.existsSync(outputJsonl)) fs.unlinkSync(outputJsonl);
const writer = fs.createWriteStream(outputJsonl, { flags: 'a' });

let eventCount = 0;
let i = 0;

while (i < lines.length) {
    const line = lines[i];
    const trimmed = stripAnsi(line).trim();

    // Show progress every 30k lines
    if (i % 30000 === 0 && i > 0) {
        process.stdout.write(`\r⏳ Line ${i}/${lines.length}, ${eventCount} events...`);
    }

    // Pattern: file:line:col (Windows path like c:\...:123:45 or C:\...)
    // Match lowercase or uppercase drive letter, then path with backslashes, then :123:45
    const fileMatch = trimmed.match(/^([a-zA-Z]:\\[^:]+):(\d+):(\d+)$/);
    if (fileMatch) {
        const [_, file, lineNum, col] = fileMatch;        // Next line should be "Error: message" (possibly multi-line)
        let j = i + 1;
        let errorMessage = '';
        let foundError = false;

        while (j < lines.length) {
            const nextLine = lines[j];
            const trimmed = stripAnsi(nextLine).trim();

            // Found error start?
            if (!foundError && trimmed.match(/^Error:/)) {
                errorMessage = trimmed.replace(/^Error:\s*/, '');
                foundError = true;
                j++;

                // Collect continuation lines (non-indented, non-empty)
                while (j < lines.length) {
                    const continuation = lines[j];
                    const trimCont = stripAnsi(continuation).trim();

                    // Stop at blank or code line
                    if (!trimCont) break;
                    if (continuation.match(/^\s+/)) break; // Code (indented)
                    if (trimCont.match(/^[A-Za-z]:\\[^:]*:\d+:\d+$/)) break; // New file
                    if (trimCont.match(/^Error:/)) break; // New error

                    // Add to message
                    errorMessage += ' ' + trimCont;
                    j++;
                }
                break;
            }

            // No error found, stop
            if (!foundError && (trimmed === '' || j > i + 5)) {
                break;
            }
            j++;
        }

        // Emit if we found an error
        if (foundError && errorMessage) {
            const fingerprint = crypto
                .createHash('sha256')
                .update(`${file}:${lineNum}:${errorMessage}`)
                .digest('hex')
                .substring(0, 12);

            const event = {
                fingerprint,
                file,
                line: parseInt(lineNum),
                col: parseInt(col),
                message: errorMessage.substring(0, 500),
                severity: 'error',
                timestamp: new Date().toISOString()
            };

            writer.write(JSON.stringify(event) + '\n');
            eventCount++;
        }

        i = j || i + 1;
    } else {
        i++;
    }
}

writer.end();

const elapsed = ((Date.now() - sw) / 1000).toFixed(1);
console.log(`\n✅ Extracted: ${eventCount} events in ${elapsed}s`);
console.log(`📊 Output: ${outputJsonl}`);
