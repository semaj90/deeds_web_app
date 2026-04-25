// Utility to detect and extract PNG images from a Buffer.
// Exports:
// - isPng(buffer): boolean
// - extractPngsFromBuffer(buffer): Buffer[]

// PNG signature
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buffer) {
  try {
    return (
      Buffer.isBuffer(buffer) &&
      buffer.length >= PNG_SIGNATURE.length &&
      buffer.slice(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
    );
  } catch (err) {
    return false;
  }
}

function extractPngsFromBuffer(buffer) {
  const results = [];
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length) return results;

  let idx = 0;
  while (idx <= buffer.length - PNG_SIGNATURE.length) {
    // Find next PNG signature
    const sigIndex = buffer.indexOf(PNG_SIGNATURE, idx);
    if (sigIndex === -1) break;

    // Walk chunks until IEND or until we run out of bytes
    let ptr = sigIndex + PNG_SIGNATURE.length;
    let endIndex = -1;
    while (ptr + 8 <= buffer.length) {
      // Need at least 8 bytes for length + type
      try {
        const chunkLength = buffer.readUInt32BE(ptr);
        const chunkType = buffer.slice(ptr + 4, ptr + 8).toString('ascii');
        const chunkTotal = 12 + chunkLength; // length(4) + type(4) + data(length) + crc(4)
        if (ptr + chunkTotal > buffer.length) {
          // Incomplete chunk, abort this PNG parse
          break;
        }
        ptr += chunkTotal;
        if (chunkType === 'IEND') {
          endIndex = ptr;
          break;
        }
      } catch (err) {
        // Parsing error, abort
        break;
      }
    }

    if (endIndex !== -1) {
      results.push(buffer.slice(sigIndex, endIndex));
      idx = endIndex;
    } else {
      // No valid IEND found after this signature; skip this signature to avoid infinite loop
      idx = sigIndex + 1;
    }
  }

  return results;
}

module.exports = {
  isPng,
  extractPngsFromBuffer,
};

// If invoked as a CLI, allow extracting PNGs from file paths passed as args.
// Example: node png-server-extractor.js input.bin
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');

  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node png-server-extractor.js <file1> [file2 ...]');
    process.exit(1);
  }

  for (const inputPath of args) {
    try {
      const data = fs.readFileSync(inputPath);
      const pngs = extractPngsFromBuffer(data);
      if (pngs.length === 0) {
        console.log(`${inputPath}: no PNGs found`);
        continue;
      }
      const dir = path.dirname(inputPath);
      const base = path.basename(inputPath, path.extname(inputPath));
      pngs.forEach((buf, i) => {
        const out = path.join(dir, `${base}-extracted-${i}.png`);
        fs.writeFileSync(out, buf);
        console.log(`Wrote ${out} (${buf.length} bytes)`);
      });
    } catch (err) {
      console.error(`Error processing ${inputPath}:`, err.message || err);
    }
  }
}
