#!/usr/bin/env node
/**
 * TEST: Pattern validation on single file
 */

import fs from 'fs/promises';

const testFile = 'src/lib/services/llm-router.ts';

const PATTERN = {
    name: 'Semicolon should be comma in interface/type',
    regex: /:\s*([a-zA-Z_$][a-zA-Z0-9_$<>[\]|]+)\s*;\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g,
    replacement: ': $1, $2:'
};

async function test() {
    console.log('🧪 Testing corrected pattern on llm-router.ts\n');

    let content = await fs.readFile(testFile, 'utf-8');
    console.log('Original line 23:');
    console.log(content.split('\n')[22]);

    const matches = content.match(PATTERN.regex);
    console.log(`\n✅ Found ${matches ? matches.length : 0} matches`);
    if (matches) {
        matches.forEach((m, i) => console.log(`   ${i + 1}. "${m}"`));
    }

    content = content.replace(PATTERN.regex, PATTERN.replacement);

    console.log('\nFixed line 23:');
    console.log(content.split('\n')[22]);

    await fs.writeFile(testFile + '.test', content, 'utf-8');
    console.log('\n✅ Test output saved to llm-router.ts.test');
}

test().catch(console.error);
