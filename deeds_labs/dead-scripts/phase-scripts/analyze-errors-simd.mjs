#!/usr/bin/env node
/**
 * SIMD-Ready Error Analyzer v3.0
 * Converts raw svelte-check output to structured JSONL + generates fix-plan.json
 *
 * Handles multi-line format:
 * file:line:col
 * Error: message
 * code snippet
 */

import crypto from 'crypto';
import fs from 'fs';
import readline from 'readline';

const inputFile = process.argv[2];
const outputJsonl = process.argv[3] || 'reports/errors.jsonl';
const outputFixPlan = process.argv[4] || 'reports/fix-plan.json';
const outputMeta = outputJsonl.replace('.jsonl', '-meta.json');

if (!inputFile || !fs.existsSync(inputFile)) {
    console.error("❌ Input file not found:", inputFile);
    process.exit(1);
}

const events = [];
const errorsByCategory = {
    'import-type-misuse': [],
    'reactive-update': [],
    'async-function': [],
    'bits-ui-dialog': [],
    'bits-ui-field': [],
    'unused-variable': [],
    'type-mismatch': [],
    'missing-param': [],
    'other': [],
    'IGNORED': []
};

const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity
});

let lineCount = 0;
let eventCount = 0;
let foundErrorsSummary = 0;
let dedupedCount = 0;
const fingerprints = new Set();
const codeCounts = {};

console.log(`🔍 Parsing ${inputFile}...`);

// Multi-line parser state machine
let currentError = null;

function stripAnsi(str) {
    return str ? str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '') : str;
}

function categorizeError(message, file) {
    message = message.toLowerCase();
    file = file.toLowerCase();

    if (file.includes("routes_parked")) {
        return 'IGNORED';
    }

    if (message.includes("'import type'") || message.includes("import type")) {
        return 'import-type-misuse';
    }
    if (message.includes('non_reactive_update') || message.includes('non-reactive')) {
        return 'reactive-update';
    }
    if (message.includes('async') && (message.includes('onmount') || message.includes('$effect'))) {
        return 'async-function';
    }
    if (message.includes('dialog') || file.includes('dialog')) {
        return 'bits-ui-dialog';
    }
    if (message.includes('field') || file.includes('field')) {
        return 'bits-ui-field';
    }
    if (message.includes('declared but never used') || message.includes('unused')) {
        return 'unused-variable';
    }
    if (message.includes('is not assignable to type') || message.includes('type')) {
        return 'type-mismatch';
    }
    if (message.includes('missing') || message.includes('required')) {
        return 'missing-param';
    }
    return 'other';
}

function emitError(location, message, code) {
    if (!location || !message) return;

    const parts = location.match(/^(.+?):(\d+):(\d+)/);
    if (!parts) return;

    const [_, file, lineNum, col] = parts;

    // Invariant B: Robust Fingerprint
    const normalizedMessage = message.trim().replace(/\s+/g, ' ');
    const fingerprint = crypto
        .createHash('sha256')
        .update(`svelte-check:${file}:${lineNum}:${col}:${normalizedMessage}`)
        .digest('hex')
        .substring(0, 12);

    if (fingerprints.has(fingerprint)) {
        return; // Dedupe
    }
    fingerprints.add(fingerprint);
    dedupedCount++;

    const category = categorizeError(message, file);
    const event = {
        fingerprint,
        tool: 'svelte-check',
        file,
        line: parseInt(lineNum),
        col: parseInt(col),
        message: normalizedMessage,
        code: code || '',
        category,
        severity: 'error',
        timestamp: new Date().toISOString()
    };

    events.push(event);
    errorsByCategory[category].push(event);
    eventCount++;

    // Track top codes (heuristic from message)
    const codeMatch = message.match(/TS\d+|[a-z0-9_]+(?=[\s:])/i);
    const codeKey = codeMatch ? codeMatch[0] : 'unknown';
    codeCounts[codeKey] = (codeCounts[codeKey] || 0) + 1;

    // Emit to JSONL immediately (streaming)
    fs.appendFileSync(outputJsonl, JSON.stringify(event) + '\n', 'utf8');
}

// Clear output file
if (fs.existsSync(outputJsonl)) fs.unlinkSync(outputJsonl);

let pendingLocation = null;
let processed = 0;

rl.on('line', (rawLine) => {
    lineCount++;
    processed++;
    const line = stripAnsi(rawLine).trim();

    // Progress bar
    if (processed % 5000 === 0) {
        process.stdout.write(
            `\r🔍 Parsed ${processed.toLocaleString()} lines | Events ${events.length}`
        );
    }

    // Check for summary line (Invariant A detection)
    const summaryMatch = line.match(/found (\d+) errors? and (\d+) warnings?/i);
    if (summaryMatch) {
        foundErrorsSummary = parseInt(summaryMatch[1]);
    }

    // Two-line state machine
    const locMatch = line.match(/^(.+?):(\d+):(\d+)$/);
    if (locMatch) {
        pendingLocation = {
            file: locMatch[1].trim(),
            line: Number(locMatch[2]),
            col: Number(locMatch[3])
        };
        return;
    }

    const errMatch = line.match(/^Error:\s+(.*)$/);
    if (errMatch && pendingLocation) {
        const message = errMatch[1].trim();
        const file = pendingLocation.file;
        const lineNum = pendingLocation.line;
        const col = pendingLocation.col;

        // Invariant B: Robust Fingerprint
        const normalizedMessage = message.replace(/\s+/g, ' ');
        const fingerprint = crypto
            .createHash('sha256')
            .update(`svelte-check:${file}:${lineNum}:${col}:${normalizedMessage}`)
            .digest('hex')
            .substring(0, 12);

        if (!fingerprints.has(fingerprint)) {
            fingerprints.add(fingerprint);
            dedupedCount++;

            const category = categorizeError(message, file);
            const event = {
                fingerprint,
                tool: 'svelte-check',
                file,
                line: lineNum,
                col: col,
                message: normalizedMessage,
                raw: [pendingLocation, line],
                category,
                severity: 'error',
                timestamp: new Date().toISOString()
            };

            events.push(event);
            if (errorsByCategory[category]) {
                errorsByCategory[category].push(event);
            } else {
                errorsByCategory['other'].push(event);
            }
            eventCount++;

            // Track top codes (heuristic)
            const codeMatch = message.match(/TS\d+|[a-z0-9_]+(?=[\s:])/i);
            const codeKey = codeMatch ? codeMatch[0] : 'unknown';
            codeCounts[codeKey] = (codeCounts[codeKey] || 0) + 1;

            // Emit to JSONL immediately
            fs.appendFileSync(outputJsonl, JSON.stringify(event) + '\n', 'utf8');
        }

        pendingLocation = null;
        return;
    }
});

rl.on('close', () => {
    console.log(`\n✅ Parsed complete: ${lineCount} lines, ${eventCount} events`);
    console.log(`📋 Wrote ${eventCount} events to ${outputJsonl}`);

    // Invariant A: Integrity Check
    if (foundErrorsSummary > 0 && eventCount === 0) {
        console.error(`❌ CRITICAL: Log summary says ${foundErrorsSummary} errors, but parser found 0 events.`);
        console.error(`   Dumping unparsed tail to reports/unparsed_tail.txt`);
        fs.writeFileSync('reports/unparsed_tail.txt', `Summary: ${foundErrorsSummary}\nEvents: 0\n\nCheck raw log for format changes.`);
        process.exit(2);
    }

    // Invariant C: Meta JSON
    const topCodes = Object.entries(codeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    const meta = {
        logPath: inputFile,
        lines: lineCount,
        events: eventCount,
        deduped: dedupedCount,
        foundErrorsSummary,
        topCodes,
        generatedAt: new Date().toISOString()
    };
    fs.writeFileSync(outputMeta, JSON.stringify(meta, null, 2));
    console.log(`📊 Wrote meta stats to ${outputMeta}`);

    // ============================================================
    // Generate fix-plan.json (categorized + tiered)
    // ============================================================
    const fixPlan = {
        generated: new Date().toISOString(),
        summary: {
            totalErrors: eventCount,
            byCategory: Object.fromEntries(
                Object.entries(errorsByCategory).map(([cat, arr]) => [cat, arr.length])
            )
        },
        tiers: [
            {
                tier: 1,
                name: "Safe Deterministic Fixes",
                description: "100% confidence - auto-applied",
                categories: ['unused-variable'],
                count: errorsByCategory['unused-variable'].length,
                examples: errorsByCategory['unused-variable'].slice(0, 2)
            },
            {
                tier: 2,
                name: "Semi-Safe Async/Lifecycle",
                description: "95% confidence - verify before applying",
                categories: ['async-function', 'reactive-update'],
                count: errorsByCategory['async-function'].length + errorsByCategory['reactive-update'].length,
                examples: [
                    ...errorsByCategory['async-function'].slice(0, 1),
                    ...errorsByCategory['reactive-update'].slice(0, 1)
                ]
            },
            {
                tier: 3,
                name: "Manual Review Required",
                description: "High-risk or complex patterns - needs human review",
                categories: ['import-type-misuse', 'bits-ui-dialog', 'bits-ui-field', 'type-mismatch', 'missing-param'],
            {
                tier: 3,
                name: "Manual Review Required",
                description: "High-risk or complex patterns - needs human review",
                categories: ['import-type-misuse', 'bits-ui-dialog', 'bits-ui-field', 'type-mismatch', 'missing-param', 'other', 'IGNORED'],
                count: errorsByCategory['import-type-misuse'].length +
                       errorsByCategory['bits-ui-dialog'].length +
                       errorsByCategory['bits-ui-field'].length +
                       errorsByCategory['type-mismatch'].length +
                       errorsByCategory['missing-param'].length +
                       errorsByCategory['other'].length +
                       errorsByCategory['IGNORED'].length,
                examples: [
                    ...errorsByCategory['import-type-misuse'].slice(0, 1),
                    ...errorsByCategory['type-mismatch'].slice(0, 1)
                ]
            }og(`📊 Wrote fix-plan to ${outputFixPlan}`);

    // ============================================================
    // Summary
    // ============================================================
    console.log(`\n✨ Analysis Complete!`);
    Object.entries(fixPlan.summary.byCategory).forEach(([cat, count]) => {
        if (count > 0) console.log(`  ${cat}: ${count}`);
    });

    console.log(`\n🎯 Tier Summary:`);
    fixPlan.tiers.forEach(t => {
        console.log(`  Tier ${t.tier}: ${t.count} errors (${t.name})`);
    });

    console.log(`\n📋 Next: Review fix-plan.json, then run batch-merger-fixer.mjs`);
});


