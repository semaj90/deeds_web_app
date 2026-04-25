import fs from 'fs';
import { glob } from 'glob';

async function healImports() {
    console.log('🩹 Starting Agentic Healer: Fixing broken store references...');

    // Find all source files
    const files = await glob('src/**/*.{svelte,ts,js}', { ignore: 'node_modules/**' });
    let fixedCount = 0;

    for (const file of files) {
        let content = fs.readFileSync(file, 'utf-8');
        let changed = false;

        // HEALING RULE: Fix 'user' store import path
        // Matches: import { user } from '$lib/stores/user';
        const userImportRegex = /from\s+['"]\$lib\/stores\/user['"];?/g;

        if (userImportRegex.test(content)) {
            content = content.replace(userImportRegex, "from '$lib/stores/user.svelte';");
            changed = true;
            console.log(`   ✅ Fixed import path in ${file}`);
        }

        // HEALING RULE: Remove '$' prefix for Rune Class usage
        // Note: This is a safe heuristic for the 'user' store specifically
        if (changed) {
            const storeSubscriptionRegex = /\$user(\.|\[)/g;
            if (storeSubscriptionRegex.test(content)) {
                content = content.replace(storeSubscriptionRegex, 'user$1');
                console.log(`   ✅ Removed $ subscription prefixes in ${file}`);
            }
        }

        if (changed) {
            fs.writeFileSync(file, content);
            fixedCount++;
        }
    }

    console.log(`\n🎉 Healing Complete. Fixed references in ${fixedCount} files.`);
}

healImports();
