const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, 'atlas/build-openspec-workboard-v1.mjs');
let content = fs.readFileSync(targetFile, 'utf8');

const isCrlf = content.includes('\r\n');
const eol = isCrlf ? '\r\n' : '\n';

const oldTarget = [
  "  writeFileSync(reportPath, `${JSON.stringify(result, null, 2)}\\n`, 'utf8');",
  "  writeFileSync(markdownPath, `${markdown}\\n`, 'utf8');"
].join(eol);

const safeReplacement = [
  "  function safeWriteReportFile(targetPath, textContent) {",
  "    const stagingPath = `${targetPath}.staging.${Date.now()}`;",
  "    const backupPath = `${targetPath}.bak`;",
  "    writeFileSync(stagingPath, textContent, 'utf8');",
  "    const staged = readFileSync(stagingPath, 'utf8');",
  "    if (staged.length !== textContent.length) {",
  "      throw new Error(`STAGING_VALIDATION_FAILED: length mismatch ${staged.length} vs ${textContent.length}`);",
  "    }",
  "    if (targetPath.endsWith('.json')) {",
  "      const parsed = JSON.parse(staged);",
  "      if (!parsed || typeof parsed !== 'object') {",
  "        throw new Error('STAGING_VALIDATION_FAILED: invalid JSON object');",
  "      }",
  "    }",
  "    if (existsSync(targetPath)) {",
  "      try {",
  "        copyFileSync(targetPath, backupPath);",
  "      } catch (err) {",
  "        console.warn(`[WARN] Failed to create backup of ${targetPath}:`, err.message);",
  "      }",
  "    }",
  "    try {",
  "      renameSync(stagingPath, targetPath);",
  "    } catch (renameErr) {",
  "      console.warn(`[WARN] Atomic rename failed (${renameErr.message}), falling back to guarded in-place write`);",
  "      writeFileSync(targetPath, textContent, 'utf8');",
  "      if (existsSync(stagingPath)) {",
  "        try { unlinkSync(stagingPath); } catch {}",
  "      }",
  "    }",
  "  }",
  "",
  "  safeWriteReportFile(reportPath, `${JSON.stringify(result, null, 2)}\\n`);",
  "  safeWriteReportFile(markdownPath, `${markdown}\\n`);"
].join(eol);

if (!content.includes(oldTarget)) {
  console.error("Target block not found in file!");
  process.exit(1);
}

content = content.replace(oldTarget, safeReplacement);
fs.writeFileSync(targetFile, content, 'utf8');
console.log("Successfully patched build-openspec-workboard-v1.mjs with safe staged write + backup + fallback!");
