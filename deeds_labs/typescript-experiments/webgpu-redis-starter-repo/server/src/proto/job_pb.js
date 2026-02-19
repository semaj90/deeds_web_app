// Mock protobuf module for testing
const $protobuf = require("protobufjs/minimal");

// Mock webgpu namespace
const webgpu = {};

// Mock JobStatus enum
webgpu.JobStatus = {
  PENDING: 0,
  RUNNING: 1,
  COMPLETED: 2,
  FAILED: 3,
  CANCELLED: 4,
  PAUSED: 5
};

// Mock Meta message
webgpu.Meta = {
  create: (properties) => properties || {},
  encode: (message) => ({ finish: () => Buffer.from(JSON.stringify(message)) }),
  decode: (buffer) => JSON.parse(buffer.toString())
};

// Mock Job message
webgpu.Job = {
  create: (properties) => properties || {},
  encode: (message) => ({ finish: () => Buffer.from(JSON.stringify(message)) }),
  decode: (buffer) => JSON.parse(buffer.toString())
};

// Mock Result message
webgpu.Result = {
  create: (properties) => properties || {},
  encode: (message) => ({ finish: () => Buffer.from(JSON.stringify(message)) }),
  decode: (buffer) => JSON.parse(buffer.toString())
};

module.exports = { webgpu };