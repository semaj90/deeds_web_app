import { createConnection } from 'node:net';

export async function probeReadOnlyListenerV1(url, timeoutMs = 3_000) {
  try {
    const target = new URL(url);
    if (target.protocol !== 'http:') return 'UNSUPPORTED_SCHEME';
    const port = Number(target.port || 80);
    return await new Promise((resolve) => {
      const socket = createConnection({ host: target.hostname, port });
      const finish = (status) => {
        socket.destroy();
        resolve(status);
      };
      socket.setTimeout(timeoutMs, () => finish('UNAVAILABLE'));
      socket.once('connect', () => finish('LISTENER_REACHABLE'));
      socket.once('error', () => finish('UNAVAILABLE'));
    });
  } catch {
    return 'INVALID_URL';
  }
}
