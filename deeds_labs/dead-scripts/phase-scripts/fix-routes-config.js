import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/lib/data/routes-config.ts');

try {
  let content = fs.readFileSync(filePath, 'utf8');

  // Pattern: "}, // === SECTION ===" -> "},\n// === SECTION ===\n"
  // This moves the comment to its own line
  content = content.replace(/}, \/\/ ===/g, '},\n// ===');

  // Pattern: "[ // === SECTION ===" -> "[\n// === SECTION ===\n"
  content = content.replace(/\[ \/\/ ===/g, '[\n// ===');

  // Also handle cases where it might just be "// ===" without the comma/bracket predecessor on the same line
  // Be careful not to match existing valid lines.
  // The file view showed "export const allRoutes ... = [ // ==="

  fs.writeFileSync(filePath, content, 'utf8');
  console.log("Fixed routes-config.ts comments.");
} catch (e) {
  console.error("Failed to fix routes-config:", e);
}
