import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

/**
 * Detects which port the dev server is running on
 * Priority: 5173 (HTTP) > 5174-5177 (fallbacks) > 5178 (QUIC/Caddy)
 */
export async function detectActivePort(): Promise<number> {
  const HTTP_PORTS = [5173, 5174, 5175, 5176, 5177];
  const QUIC_PORT = 5178;

  // Check HTTP ports first
  for (const port of HTTP_PORTS) {
    if (await isPortInUse(port)) {
      console.log(`✅ Detected HTTP server on port ${port}`);
      return port;
    }
  }

  // Check QUIC/Caddy port as fallback
  if (await isPortInUse(QUIC_PORT)) {
    console.log(`✅ Detected QUIC/Caddy server on port ${QUIC_PORT}`);
    return QUIC_PORT;
  }

  // Default to 5173 if nothing detected
  console.warn('⚠️ No active server detected, defaulting to port 5173');
  return 5173;
}

/**
 * Checks if a port is in use
 */
async function isPortInUse(port: number): Promise<boolean> {
  try {
    const { stdout } = await execPromise(`netstat -ano | findstr :${port}`);
    return stdout.includes(`${port}`) && stdout.includes('LISTENING');
  } catch (error) {
    return false;
  }
}

/**
 * Gets the base URL for testing
 */
export async function getTestBaseURL(): Promise<string> {
  const port = await detectActivePort();
  return `http://localhost:${port}`;
}
