import type { ServerResponse } from 'node:http';

export const MCP_RESPONSE_FINISH_TIMEOUT_MS = 15_000;

export function waitForMcpResponseFinish(
  response: Pick<ServerResponse, 'writableFinished' | 'on' | 'off'>,
  timeoutMs = MCP_RESPONSE_FINISH_TIMEOUT_MS,
): Promise<'finished' | 'closed' | 'timeout'> {
  if (response.writableFinished) return Promise.resolve('finished');

  return new Promise((resolve) => {
    let settled = false;
    const settle = (status: 'finished' | 'closed' | 'timeout') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      response.off('finish', onFinish);
      response.off('close', onClose);
      resolve(status);
    };
    const onFinish = () => settle('finished');
    const onClose = () => settle('closed');
    const timer = setTimeout(() => settle('timeout'), Math.max(0, timeoutMs));

    response.on('finish', onFinish);
    response.on('close', onClose);
    if (response.writableFinished) settle('finished');
  });
}
