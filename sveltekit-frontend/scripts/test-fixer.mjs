
const pattern = /\(([^)]+)\);\s*([^)]+)\)/g;
const text = "function getStringProp(doc: LegalDocument); key: string): string | undefined {";
const fixed = text.replace(pattern, (match, arg1, arg2) => `(${arg1}, ${arg2})`);
console.log("Original:", text);
console.log("Fixed:   ", fixed);
console.log("Match:", text.match(pattern));
