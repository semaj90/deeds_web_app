const fs = require('fs');
const readline = require('readline');

// Config
const LOG_FILE = 'logs/phase68_errors.txt';
const TOP_N = 25;

async function analyze() {
    console.log(`📊 Analyzing error distribution from ${LOG_FILE}...`);

    if (!fs.existsSync(LOG_FILE)) {
        console.error('File not found!');
        return;
    }

    const fileStream = fs.createReadStream(LOG_FILE);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    const patterns = {};
    const examples = {};
    let totalErrors = 0;

    for await (const line of rl) {
        if (!line.trim()) continue;
        if (line.includes('warning:')) continue;

        // Format: TIMESTAMP LEVEL "FILE" LINE:COL "MESSAGE"
        // Regex to capture "MESSAGE" at the end.
        // We assume the message is enclosed in quotes and follows line:col pattern.

        const splitPattern = / \d+:\d+ "(.+)"$/;
        const match = line.match(splitPattern);

        if (!match) continue;

        let message = match[1];
        totalErrors++;

        // Normalization (Aggressive)

        // 1. Property names: "Property 'foo' does not exist" -> "Property 'ID' does not exist"
        let normalized = message.replace(/'[^']+'/g, "'ID'");

        // 2. Type Mismatches: "Type 'Foo' is not..." -> "Type 'TYPE' is not..."
        // Also handling complex objects "{ a: 1 }" -> "{ OBJECT }"
        normalized = normalized.replace(/\{[^}]+\}/g, "{ OBJECT }");

        // 3. Modules: "Module 'foo' has no..." -> "Module 'ID' has no..."
        // (Handled by step 1)

        // 4. Generic replacement of common variability
        normalized = normalized.replace(/\b(string|number|boolean|any|void|null|undefined)\b/g, "TYPE");

        // 5. Truncate very long unique messages (like signatures)
        if (normalized.length > 80) {
            // Keep first 50 chars as key
            normalized = normalized.substring(0, 50) + "...";
        }

        if (!patterns[normalized]) {
            patterns[normalized] = 0;
            examples[normalized] = message; // Keep original for example
        }
        patterns[normalized]++;
    }

    // Sort
    const sorted = Object.entries(patterns)
        .sort(([, a], [, b]) => b - a)
        .slice(0, TOP_N);

    console.log(`\nFound ${totalErrors} identifiable errors.`);
    console.log(`Top ${TOP_N} Patterns:\n`);

    sorted.forEach(([pattern, count], idx) => {
        const percentage = ((count / totalErrors) * 100).toFixed(1);
        console.log(`${idx + 1}. [${count}] (${percentage}%) ${pattern}`);
        console.log(`    Example: ${examples[pattern].slice(0, 100)}...`);
    });
}

analyze();
