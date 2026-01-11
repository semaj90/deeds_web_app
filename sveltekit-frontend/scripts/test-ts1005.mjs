#!/usr/bin/env node
import * as ts from 'typescript';

const code = `
const result = foo(
    arg1
    arg2  // Missing comma here - this should trigger TS1005
);
`;

const sourceFile = ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true);
const diagnostics = sourceFile.parseDiagnostics.filter(d => d.code === 1005);

console.log(`Found ${diagnostics.length} TS1005 errors:\n`);

diagnostics.forEach((d, i) => {
    const start = d.start;
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
    const text = code.substring(Math.max(0, start - 20), start + 20);

    console.log(`Error ${i + 1}:`);
    console.log(`  Position: ${start} (line ${line + 1}, col ${character})`);
    console.log(`  Context: "${text}"`);
    console.log(`  Message: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
    console.log();
});
