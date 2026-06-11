import { parseLargeJsonToMsgpack } from '../../../../../crates/atlas_packet_parser/index.js';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import readline from 'readline';

export interface ArtifactProfile {
  artifact_path: string;
  sha256: string;
  size_bytes: number;
  format: 'ndjson' | 'json_array';
  row_count_estimate: number;
  sample_path: string;
  manifest_path: string;
}

export interface OffsetInfo {
  packetId: string;
  byteStart: number;
  byteEnd: number;
}

/**
 * Profile artifact (Lane 1 safety gate) without loading large files into memory.
 */
export async function profileArtifact(filePath: string): Promise<ArtifactProfile> {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(resolvedPath);
  const sizeBytes = stats.size;

  const hash = crypto.createHash('sha256');
  const readStream = fs.createReadStream(resolvedPath);

  return new Promise((resolve, reject) => {
    readStream.on('data', (chunk) => {
      hash.update(chunk);
    });

    readStream.on('error', (err) => reject(err));

    readStream.on('end', async () => {
      try {
        const sha256 = hash.digest('hex');

        // Create readline stream to estimate rows and take sample
        const rl = readline.createInterface({
          input: fs.createReadStream(resolvedPath),
          crlfDelay: Infinity,
        });

        let rowCountEstimate = 0;
        const sampleLines: string[] = [];
        const maxSampleLines = 5;
        let firstChar = '';

        for await (const line of rl) {
          rowCountEstimate++;
          const trimmed = line.trim();
          if (rowCountEstimate === 1) {
            firstChar = trimmed[0];
          }
          if (sampleLines.length < maxSampleLines && trimmed.length > 0) {
            sampleLines.push(trimmed);
          }
        }

        let format: 'ndjson' | 'json_array' = 'ndjson';
        let isNdjson = true;
        if (firstChar === '[') {
          format = 'json_array';
          isNdjson = false;
        }

        const manifestDir = path.resolve('memory/manifests');
        if (!fs.existsSync(manifestDir)) {
          fs.mkdirSync(manifestDir, { recursive: true });
        }

        const samplePath = 'memory/manifests/sample.json';
        const manifestPath = 'memory/manifests/artifact.manifest.json';

        let sampleContent = '';
        if (isNdjson) {
          sampleContent = sampleLines.join('\n');
        } else {
          sampleContent = '[\n  ' + sampleLines.map(l => l.replace(/^,/, '').trim()).join(',\n  ') + '\n]';
        }

        fs.writeFileSync(path.resolve(samplePath), sampleContent);

        const profile: ArtifactProfile = {
          artifact_path: resolvedPath,
          sha256,
          size_bytes: sizeBytes,
          format,
          row_count_estimate: rowCountEstimate,
          sample_path: samplePath,
          manifest_path: manifestPath,
        };

        fs.writeFileSync(path.resolve(manifestPath), JSON.stringify(profile, null, 2));
        resolve(profile);
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Materialize packets to MessagePack chunks using the Rust N-API parser.
 */
export async function materializePackets(
  filePath: string,
  outputDir: string = 'memory/packets',
  chunkSize: number = 10000
): Promise<any> {
  const resolvedPath = path.resolve(filePath);
  const resolvedOutDir = path.resolve(outputDir);
  const resultJson = parseLargeJsonToMsgpack(resolvedPath, resolvedOutDir, chunkSize);
  return JSON.parse(resultJson);
}
