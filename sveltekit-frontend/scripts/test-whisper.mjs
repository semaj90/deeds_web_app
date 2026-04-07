#!/usr/bin/env node
/**
 * Test whisper transcription with proper multipart/form-data
 */

// Create a minimal WAV (1 second of silence at 16kHz mono 16-bit)
const sampleRate = 16000;
const numChannels = 1;
const bitsPerSample = 16;
const numSamples = sampleRate; // 1 second
const dataSize = numSamples * numChannels * (bitsPerSample / 8);

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + dataSize, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(numChannels, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
header.writeUInt16LE(bitsPerSample, 34);
header.write('data', 36);
header.writeUInt32LE(dataSize, 40);

const audioData = Buffer.alloc(dataSize); // silence
const wav = Buffer.concat([header, audioData]);

console.log(`Created test WAV: ${wav.length} bytes (${(wav.length / 1024).toFixed(1)} KB)`);

// Build multipart/form-data body
const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
const body = Buffer.concat([
  Buffer.from(`--${boundary}\r\n`),
  Buffer.from(`Content-Disposition: form-data; name="file"; filename="test-silence.wav"\r\n`),
  Buffer.from(`Content-Type: audio/wav\r\n\r\n`),
  wav,
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);

console.log(`Sending ${body.length} bytes to /api/whisper/transcribe...`);

try {
  const response = await fetch('http://127.0.0.1:5173/api/whisper/transcribe', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Cookie': 'session=dev-bypass',
    },
    body,
  });

  console.log(`Status: ${response.status} ${response.statusText}`);
  const contentType = response.headers.get('content-type');

  if (contentType?.includes('json')) {
    const json = await response.json();
    console.log('Response:', JSON.stringify(json, null, 2));
  } else {
    const text = await response.text();
    console.log('Response:', text.slice(0, 500));
  }
} catch (err) {
  console.error('Fetch error:', err.message);
}
