const fs = require('fs');

const path = 'src/sveltekit-gpu-cache-integration.ts';
let content = fs.readFileSync(path, 'utf8');

// Fix 1: The cached data logic
const oldLogic = `if (cached != null) {typeof cached === 'object' && 'data' in (cached as object)
						? (cached as { data, unknown }).data
						: cached;`;

const newLogic = `if (cached != null) {
				const data = typeof cached === 'object' && 'data' in (cached as object)
					? (cached as { data: unknown }).data
					: cached;`;

if (content.includes('typeof cached === \'object\'')) {
    // Attempt relaxed replacement if exact string doesn't match due to whitespace
    const regex = /if \(cached != null\) \{typeof cached === 'object' && 'data' in \(cached as object\)[\s\S]+?\? \(cached as \{ data, unknown \}\)\.data[\s\S]+?: cached;/;
    if (regex.test(content)) {
        content = content.replace(regex, newLogic);
        console.log('Fixed cached data logic');
    } else {
        console.log('Could not find cached data logic pattern');
    }
}

// Fix 2: The regex artifact
if (content.includes('$1?.$2')) {
    content = content.replace('if ($1?.$2) {', 'if (response.ok) {');
    console.log('Fixed regex artifact');
}

fs.writeFileSync(path, content);
