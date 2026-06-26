#!/usr/bin/env node
/**
 * Packet Validator Worker Thread
 * Validates packet JSON using simdjson N-API bridge (if available)
 * Falls back to native JSON.parse if addon unavailable
 */

import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';

let fastJsonParse = null;

// Try to load simdjson bridge
try {
  const addon = require('../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
  if (typeof addon.fastJsonParse === 'function') {
    fastJsonParse = addon.fastJsonParse;
    parentPort.postMessage({
      type: 'progress',
      message: 'simdjson N-API bridge loaded'
    });
  } else {
    parentPort.postMessage({
      type: 'progress',
      message: 'simdjson bridge not available, using V8 JSON.parse'
    });
  }
} catch (e) {
  parentPort.postMessage({
    type: 'progress',
    message: `Could not load simdjson bridge: ${e.message}, using V8 JSON.parse`
  });
}

function validatePacketSchema(packet) {
  // Required fields for a valid topology projection packet
  const required = [
    'packet_key', 'feature_id', 'source_ref',
    'som_row', 'som_col',
    'manifold_x', 'manifold_y', 'manifold_z', 'manifold_w',
    'qdrant_point_id'
  ];

  const errors = [];

  for (const field of required) {
    if (packet[field] === null || packet[field] === undefined) {
      errors.push(`missing required field: ${field}`);
    }
  }

  // Validate manifold coordinates are in valid range
  for (const coord of ['manifold_x', 'manifold_y', 'manifold_z', 'manifold_w']) {
    if (typeof packet[coord] === 'number') {
      if (isNaN(packet[coord]) || !isFinite(packet[coord])) {
        errors.push(`invalid manifold coordinate ${coord}: ${packet[coord]}`);
      }
    }
  }

  // Validate SOM coordinates are integers
  for (const coord of ['som_row', 'som_col']) {
    if (typeof packet[coord] !== 'number' || !Number.isInteger(packet[coord])) {
      errors.push(`invalid SOM coordinate ${coord}: ${packet[coord]}`);
    }
  }

  return errors;
}

async function validatePackets() {
  try {
    const { filePath } = workerData;

    parentPort.postMessage({
      type: 'progress',
      message: `Reading packets from ${filePath}`
    });

    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse JSON (using simdjson if available)
    let data;
    if (fastJsonParse) {
      try {
        data = fastJsonParse(content);
        parentPort.postMessage({
          type: 'progress',
          message: 'Parsed JSON with simdjson (native)'
        });
      } catch (e) {
        parentPort.postMessage({
          type: 'progress',
          message: `simdjson parse failed, falling back to V8: ${e.message}`
        });
        data = JSON.parse(content);
      }
    } else {
      data = JSON.parse(content);
    }

    if (!data.packets || !Array.isArray(data.packets)) {
      throw new Error('Invalid packet data structure: packets array not found');
    }

    parentPort.postMessage({
      type: 'progress',
      message: `Validating ${data.packets.length} packets`
    });

    let valid = 0;
    let invalid = 0;
    const errors = [];

    for (let i = 0; i < data.packets.length; i++) {
      const packet = data.packets[i];
      const schemaErrors = validatePacketSchema(packet);

      if (schemaErrors.length === 0) {
        valid++;
      } else {
        invalid++;
        if (errors.length < 10) {
          errors.push(`Packet ${i} (${packet.packet_key}): ${schemaErrors.join('; ')}`);
        }
      }
    }

    parentPort.postMessage({
      type: 'result',
      valid,
      invalid,
      errors
    });
  } catch (err) {
    parentPort.postMessage({
      type: 'error',
      message: err.message
    });
    process.exit(1);
  }
}

validatePackets();
