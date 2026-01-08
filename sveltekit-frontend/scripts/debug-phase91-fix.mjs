
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

// Import the actual fixer logic (we'll adapt the core logic here to avoid module issues)
const filePath = path.resolve('src/lib/server/adapters/service-integrations.ts');
console.log(`🔧 Debugging fixes for: ${filePath}`);

const originalContent = fs.readFileSync(filePath, 'utf-8');

// --- SIMULATED FIXER LOGIC (Copied from phase90/phase91) ---
const sourceFile = ts.createSourceFile(
    filePath,
    originalContent,
    ts.ScriptTarget.Latest,
    true
);

const edits = [];
const appliedOffsets = new Set();

function visit(node) {
    // PHASE 91: PRIORITY TYPE-SAFE PATTERNS
    // Only apply the high-confidence ones we injected

    // 1. Union Type Piping (High Confidence: 0.92)
    if (ts.isUnionTypeNode(node)) {
        // Check if types are adjacent without a pipe
        let lastEnd = -1;
        node.types.forEach(t => {
            if (lastEnd !== -1) {
                const between = originalContent.substring(lastEnd, t.pos);
                if (!between.includes('|') && !between.includes(',')) {
                    // Start of the next type node is often where we want to insert,
                    // or end of previous.
                    // The AST might be messed up, so we look strictly at the text gap.
                    edits.push({
                        start: lastEnd,
                        end: lastEnd, // Insertion
                        text: ' | ',
                        type: 'UnionTypeFix'
                    });
                }
            }
            lastEnd = t.end;
        });
    }

    // 2. For Statement Semicolons (High Confidence: 0.94)
    if (ts.isForStatement(node)) {
        if (!node.initializer && !originalContent.substring(node.pos, node.statement.pos).includes(';')) {
             // Basic check - this logic is simplified for the debug script
             // We want to see if the real fixer is doing something similar
        }
    }

    // Standard recursive visit
    ts.forEachChild(node, visit);
}

visit(sourceFile);

// Sort edits reverse
edits.sort((a, b) => b.start - a.start);

let modifiedContent = originalContent;
console.log(`\n🎯 Found ${edits.length} potential edits.`);

edits.forEach(edit => {
    // Apply edit
    const before = modifiedContent.substring(0, edit.start);
    const after = modifiedContent.substring(edit.end);
    modifiedContent = before + edit.text + after;

    console.log(`\n[${edit.type}] at offset ${edit.start}:`);
    console.log(`  Context: "${originalContent.substring(Math.max(0, edit.start - 20), Math.min(originalContent.length, edit.start + 20)).replace(/\n/g, '\\n')}"`);
    console.log(`  Insert: "${edit.text}"`);
});

// Compare syntax errors
const pOld = ts.createSourceFile('old.ts', originalContent, ts.ScriptTarget.Latest);
const dOld = pOld.parseDiagnostics();
console.log(`\nOld Syntax Errors: ${dOld.length}`);

const pNew = ts.createSourceFile('new.ts', modifiedContent, ts.ScriptTarget.Latest);
const dNew = pNew.parseDiagnostics();
console.log(`New Syntax Errors: ${dNew.length}`);

if (dNew.length > dOld.length) {
    console.log("⚠️  REGRESSION DETECTED (Simulated)");
    if (dNew.length > 0) {
        console.log("First new error:", dNew[0].messageText, "at", dNew[0].start);
        const errPos = dNew[0].start;
        console.log(`  Code: "${modifiedContent.substring(errPos - 20, errPos + 20).replace(/\n/g, '\\n')}"`);
    }
} else {
    console.log("✅ Improvement or Neutral");
}
