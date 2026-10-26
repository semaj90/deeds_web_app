import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const weightFiles = {
  W_enc_768_128: { file: 'W_enc_768_128.npy', shape: [128, 768] },
  b_enc_128: { file: 'b_enc_128.npy', shape: [128] },
  W_enc_128_64: { file: 'W_enc_128_64.npy', shape: [64, 128] },
  b_enc_64: { file: 'b_enc_64.npy', shape: [64] },
  W_dec_64_128: { file: 'W_dec_64_128.npy', shape: [128, 64] },
  b_dec_128: { file: 'b_dec_128.npy', shape: [128] },
  W_dec_128_768: { file: 'W_dec_128_768.npy', shape: [768, 128] },
  b_dec_768: { file: 'b_dec_768.npy', shape: [768] },
};

function parseFloat32Npy(filePath, expectedShape) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 10 || buffer[0] !== 0x93 || buffer.toString('ascii', 1, 6) !== 'NUMPY') {
    throw new Error(`INVALID_NPY_MAGIC:${filePath}`);
  }

  const major = buffer[6];
  const headerOffset = major === 1 ? 10 : major === 2 ? 12 : 0;
  if (headerOffset === 0) throw new Error(`UNSUPPORTED_NPY_VERSION:${major}.${buffer[7]}`);
  const headerLength = major === 1 ? buffer.readUInt16LE(8) : buffer.readUInt32LE(8);
  const header = buffer.toString('latin1', headerOffset, headerOffset + headerLength);
  const dtype = header.match(/['"]descr['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1];
  const shapeText = header.match(/['"]shape['"]\s*:\s*\(([^)]*)\)/i)?.[1];
  if (dtype !== '<f4' && dtype !== '|f4' && dtype !== '=f4') {
    throw new Error(`UNSUPPORTED_NPY_DTYPE:${dtype ?? 'missing'}`);
  }
  if (!shapeText) throw new Error('INVALID_NPY_SHAPE:missing');
  const shape = shapeText.split(',').map((value) => value.trim()).filter(Boolean).map(Number);
  if (JSON.stringify(shape) !== JSON.stringify(expectedShape)) {
    throw new Error(`INVALID_NPY_SHAPE:${shape.join('x')}:expected:${expectedShape.join('x')}`);
  }

  const count = shape.reduce((product, dimension) => product * dimension, 1);
  const dataOffset = headerOffset + headerLength;
  if (buffer.length !== dataOffset + count * 4) throw new Error(`INVALID_NPY_BYTE_LENGTH:${filePath}`);
  const view = new DataView(buffer.buffer, buffer.byteOffset + dataOffset, count * 4);
  return Float32Array.from({ length: count }, (_, index) => view.getFloat32(index * 4, true));
}

export function loadJuneAutoencoderWeights(weightsDirectory) {
  return Object.fromEntries(Object.entries(weightFiles).map(([name, spec]) => [
    name,
    parseFloat32Npy(path.join(weightsDirectory, spec.file), spec.shape),
  ]));
}

export function juneAutoencoderForward(input768, weights) {
  if (input768.length !== 768 || Array.from(input768).some((value) => !Number.isFinite(value))) {
    throw new Error('INVALID_INPUT:expected_768_finite_values');
  }

  const applyDenseTanh = (input, matrix, bias, rows, columns) => {
    if (matrix.length !== rows * columns || bias.length !== rows) {
      throw new Error(`INVALID_LAYER_SHAPE:${rows}x${columns}`);
    }
    const output = new Float64Array(rows);
    for (let row = 0; row < rows; row++) {
      let sum = bias[row];
      const offset = row * columns;
      for (let column = 0; column < columns; column++) {
        sum += input[column] * matrix[offset + column];
      }
      output[row] = Math.tanh(sum);
    }
    return output;
  };

  const hidden128 = applyDenseTanh(input768, weights.W_enc_768_128, weights.b_enc_128, 128, 768);
  const latent = applyDenseTanh(hidden128, weights.W_enc_128_64, weights.b_enc_64, 64, 128);
  const decoded128 = applyDenseTanh(latent, weights.W_dec_64_128, weights.b_dec_128, 128, 64);
  const reconstruction = applyDenseTanh(decoded128, weights.W_dec_128_768, weights.b_dec_768, 768, 128);

  return {
    reconstruction,
    latent,
    asHistoricalTuple: () => [reconstruction, latent],
  };
}

function runCli() {
  const weightsArgument = process.argv.find((argument) => argument.startsWith('--weights-dir='));
  if (!weightsArgument) throw new Error('USAGE:--weights-dir=<path>');
  const weightsDirectory = path.resolve(weightsArgument.slice('--weights-dir='.length));
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!Array.isArray(request.inputs)) throw new Error('INVALID_REQUEST:inputs_required');
  const weights = loadJuneAutoencoderWeights(weightsDirectory);
  const outputs = request.inputs.map((input) => {
    const result = juneAutoencoderForward(input, weights);
    return {
      reconstruction: Array.from(result.reconstruction),
      latent: Array.from(result.latent),
    };
  });
  process.stdout.write(JSON.stringify({ outputs }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
