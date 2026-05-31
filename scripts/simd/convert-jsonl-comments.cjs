const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

function usage() {
  console.error('Usage: node scripts/simd/convert-jsonl-comments.cjs <file.jsonl>');
  process.exit(2);
}

const infile = process.argv[2];
if (!infile) usage();

const absIn = path.resolve(infile);
if (!fs.existsSync(absIn)) {
  console.error('File not found:', absIn);
  process.exit(3);
}

const repairsDir = path.resolve('.tmp/repairs');
if (!fs.existsSync(repairsDir)) fs.mkdirSync(repairsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const base = path.basename(absIn);
const backupPath = path.join(repairsDir, `${base}.backup.${timestamp}`);

// compute original file checksum and size before any writes
let origStat = null;
let origSha256 = null;
try {
  origStat = fs.statSync(absIn);
  const buf = fs.readFileSync(absIn);
  const h = crypto.createHash('sha256');
  h.update(buf);
  origSha256 = h.digest('hex');
} catch (e) {
  // fallback: leave nulls
}

fs.copyFileSync(absIn, backupPath);
console.log('Backed up to', backupPath);

const tmpOut = absIn + '.converted.tmp';
const inp = fs.createReadStream(absIn, { encoding: 'utf8' });
const out = fs.createWriteStream(tmpOut, { encoding: 'utf8' });

const rl = readline.createInterface({ input: inp, crlfDelay: Infinity });

const commentRe = /^\s*(?:\/\/|#)\s?(.*)$/; // capture the comment text

let leadingComments = [];
let sawNonComment = false;
let wroteMeta = false;

rl.on('line', (line) => {
  if (!sawNonComment) {
    if (line.match(commentRe) || line.trim() === '') {
      // collect trimmed comment text (preserve empty lines as empty string)
      const m = line.match(commentRe);
      leadingComments.push(m ? m[1] : '');
      return; // continue reading
    }
    // first non-comment line
    sawNonComment = true;
    if (leadingComments.length > 0) {
      const meta = {
        _meta: {
          comments: leadingComments,
          source: infile,
          convertedAt: new Date().toISOString(),
          meta_version: 'toon-1',
          encoding: 'toon-v1',
          original: {
            size: origStat ? origStat.size : null,
            mtime: origStat ? origStat.mtime.toISOString() : null,
            sha256: origSha256,
          },
          converter: {
            tool: 'convert-jsonl-comments.cjs',
            backup: backupPath,
            runAt: new Date().toISOString(),
          },
        },
      };
      out.write(JSON.stringify(meta) + '\n');
      wroteMeta = true;
    }
    // write the current line (first non-comment) and continue
    out.write(line + '\n');
    return;
  }
  // already past header, just write lines unchanged
  out.write(line + '\n');
});

rl.on('close', () => {
  // If file had only comments or was empty, we should still write a meta line
  if (!sawNonComment) {
    if (leadingComments.length === 0) {
      console.error('No content found in file (empty) — no conversion performed.');
      try { fs.unlinkSync(tmpOut); } catch (e) {}
      process.exit(0);
    }
    const meta = {
      _meta: {
        comments: leadingComments,
        source: infile,
        convertedAt: new Date().toISOString(),
        meta_version: 'toon-1',
        encoding: 'toon-v1',
        original: {
          size: origStat ? origStat.size : null,
          mtime: origStat ? origStat.mtime.toISOString() : null,
          sha256: origSha256,
        },
        converter: {
          tool: 'convert-jsonl-comments.cjs',
          backup: backupPath,
          runAt: new Date().toISOString(),
        },
      },
    };
    out.write(JSON.stringify(meta) + '\n');
    wroteMeta = true;
  }
  out.end(() => {
    // replace original file with converted version
    fs.renameSync(tmpOut, absIn);
    console.log('Converted file written to', absIn);
    console.log('Original backed up at', backupPath);
  });
});
