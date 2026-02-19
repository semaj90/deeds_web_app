#!/usr/bin/env node

import net from 'net';

/**
 * Finds the next available port starting from a given port
 * @param {number} startPort - Port to start searching from
 * @param {number} maxTries - Maximum number of ports to try
 * @returns {Promise<number>} - Available port number
 */
export async function findFreePort(startPort = 5173, maxTries = 50) {
  // Defensive clamp so callers can't request an absurdly large scan
  const tries = Math.min(Math.max(1, Number(maxTries) || 50), 1000);
  for (let port = startPort; port < startPort + tries; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports found in range ${startPort}-${startPort + tries - 1}`);
}

/**
 * Check if a specific port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - True if port is available
 */
export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false); // Port is in use
      } else {
        resolve(false); // Other error, consider unavailable
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true); // Port is available
    });

    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find multiple free ports for microservices
 * @param {number[]} preferredPorts - Array of preferred port numbers
 * @returns {Promise<Object>} - Map of service names to ports
 */
export async function findServicePorts(preferredPorts = [5173, 8080, 8094, 8095]) {
  const result = {};
  const usedPorts = new Set();

  for (let i = 0; i < preferredPorts.length; i++) {
    let port = preferredPorts[i];

    // If preferred port is taken, find next available
    while (!(await isPortAvailable(port)) || usedPorts.has(port)) {
      port++;
      if (port > 65535) {
        throw new Error('No available ports found');
      }
    }

    usedPorts.add(port);
    result[`service${i}`] = port;
  }

  return result;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const startPort = parseInt(process.argv[2]) || 5173;
  const maxTries = parseInt(process.argv[3]) || 10;

  findFreePort(startPort, maxTries)
    .then((port) => {
      console.log(port); // Just output the port number for easy parsing
      process.exit(0);
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
