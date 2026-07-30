#!/usr/bin/env node

const message = [
  'dimension_384_detected',
  '384-dimensional code indexing is rejected by the native EmbeddingGemma 768 contract.',
  'Use scripts/atlas/index-code-768.mjs instead.',
].join(' ');

console.error(message);
process.exitCode = 2;
