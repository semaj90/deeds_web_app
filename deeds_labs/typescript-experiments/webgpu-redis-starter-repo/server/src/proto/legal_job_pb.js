// Mock legal protobuf module for testing
const $protobuf = require("protobufjs/minimal");

// Mock webgpu namespace for legal types
const webgpu = {};

// Mock LegalJobType enum
webgpu.LegalJobType = {
  CONTRACT_ANALYSIS: 0,
  CASE_RESEARCH: 1,
  DOCUMENT_REVIEW: 2,
  RISK_ASSESSMENT: 3,
  MULTI_AGENT_ANALYSIS: 4,
  EMBEDDING_GENERATION: 5,
  TENSOR_OPTIMIZATION: 6,
  RL_TRAINING: 7
};

// Mock CacheLocation enum
webgpu.CacheLocation = {
  GPU: 0,
  REDIS: 1,
  MINIO: 2,
  DISK_MMAP: 3,
  INDEXEDDB: 4
};

// Mock LegalMessage
webgpu.LegalMessage = {
  create: (properties) => properties || {},
  encode: (message) => ({ finish: () => Buffer.from(JSON.stringify(message)) }),
  decode: (buffer) => JSON.parse(buffer.toString())
};

// Mock LegalJob
webgpu.LegalJob = {
  create: (properties) => properties || {},
  encode: (message) => ({ finish: () => Buffer.from(JSON.stringify(message)) }),
  decode: (buffer) => JSON.parse(buffer.toString())
};

// Mock LegalResult
webgpu.LegalResult = {
  create: (properties) => properties || {},
  encode: (message) => ({ finish: () => Buffer.from(JSON.stringify(message)) }),
  decode: (buffer) => JSON.parse(buffer.toString())
};

// Mock LegalJobPayload
webgpu.LegalJobPayload = {
  create: (properties) => properties || {},
  encode: (message) => ({ finish: () => Buffer.from(JSON.stringify(message)) }),
  decode: (buffer) => JSON.parse(buffer.toString())
};

module.exports = { webgpu };