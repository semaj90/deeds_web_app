#!/usr/bin/env node
/**
 * Deep Analysis of TS1005 Errors
 * Extracts patterns to identify AST-level fixes needed
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function analyzeTS1005() {
    console.log('🔍 Deep Analysis of TS1005 Errors\n');
    console.log('='.repeat(60));

    // Read latest svelte-check log
    const logsDir = path.join(__dirname, '../reports');
    const files = await fs.readdir(logsDir);
    const checkLogs = files.filter(f => f.startsWith('svelte-check') && f.endsWith('.log'));

    if (checkLogs.length === 0) {
        console.error('❌ No svelte-check logs found');
        return;
    }

    const latestLog = checkLogs.sort().reverse()[0];
    const logPath = path.join(logsDir, latestLog);

    console.log(`📄 Analyzing: ${latestLog}\n`);

    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.split('\n');

    // Extract TS1005 errors
    const ts1005Errors = lines.filter(l => l.includes('error TS1005'));

    console.log(`📊 Total TS1005 errors: ${ts1005Errors.length}\n`);

    // Pattern analysis
    const patterns = {
        comma: { count: 0, examples: [] },
        semicolon: { count: 0, examples: [] },
        colon: { count: 0, examples: [] },
        brace: { count: 0, examples: [] },
        paren: { count: 0, examples: [] },
        arrow: { count: 0, examples: [] },
        other: { count: 0, examples: [] }
    };

    for (const error of ts1005Errors) {
        if (error.includes("',' expected")) {
            patterns.comma.count++;
            if (patterns.comma.examples.length < 5) {
                patterns.comma.examples.push(error);
            }
        } else if (error.includes("';' expected")) {
            patterns.semicolon.count++;
            if (patterns.semicolon.examples.length < 5) {
                patterns.semicolon.examples.push(error);
            }
        } else if (error.includes("':' expected")) {
            patterns.colon.count++;
            if (patterns.colon.examples.length < 5) {
                patterns.colon.examples.push(error);
            }
        } else if (error.includes("'}' expected")) {
            patterns.brace.count++;
            if (patterns.brace.examples.length < 5) {
                patterns.brace.examples.push(error);
            }
        } else if (error.includes("')' expected")) {
            patterns.paren.count++;
            if (patterns.paren.examples.length < 5) {
                patterns.paren.examples.push(error);
            }
        } else if (error.includes("'=>' expected")) {
            patterns.arrow.count++;
            if (patterns.arrow.examples.length < 5) {
                patterns.arrow.examples.push(error);
            }
        } else {
            patterns.other.count++;
            if (patterns.other.examples.length < 5) {
                patterns.other.examples.push(error);
            }
        }
    }

    // Report
    console.log('📋 Pattern Breakdown:\n');

    const sorted = Object.entries(patterns)
        .sort((a, b) => b[1].count - a[1].count);

    for (const [pattern, data] of sorted) {
        if (data.count > 0) {
            const percent = ((data.count / ts1005Errors.length) * 100).toFixed(1);
            console.log(`${pattern.toUpperCase()}: ${data.count} (${percent}%)`);
            console.log(`  Examples:`);
            data.examples.slice(0, 3).forEach(ex => {
                const match = ex.match(/([^:]+):(\d+),(\d+).*$/);
                if (match) {
                    console.log(`    - ${match[1]} line ${match[2]}`);
                }
            });
            console.log('');
        }
    }

    // Extract file hotspots
    console.log('🔥 Top 20 Files with Most TS1005 Errors:\n');

    const fileErrors = {};
    for (const error of ts1005Errors) {
        const match = error.match(/([^:]+):/);
        if (match) {
            const file = match[1].trim();
            fileErrors[file] = (fileErrors[file] || 0) + 1;
        }
    }

    const sortedFiles = Object.entries(fileErrors)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    for (const [file, count] of sortedFiles) {
        const shortFile = file.replace(/^src\//, '');
        console.log(`  ${count.toString().padStart(4)} - ${shortFile}`);
    }

    // Save report
    const reportPath = path.join(__dirname, '../reports/ts1005-analysis.json');
    await fs.writeFile(reportPath, JSON.stringify({
        total: ts1005Errors.length,
        patterns: Object.fromEntries(
            Object.entries(patterns).map(([k, v]) => [k, { count: v.count }])
        ),
        topFiles: sortedFiles.slice(0, 50)
    }, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Analysis complete`);
    console.log(`📁 Report saved: ${reportPath}`);
}

analyzeTS1005().catch(console.error);
