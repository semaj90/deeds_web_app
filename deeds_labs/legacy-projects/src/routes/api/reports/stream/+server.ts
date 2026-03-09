// @ts-expect-error
import { initRedis, getSSEStream } from '$lib/server/reports/stream';

export const GET = async () => {
  await initRedis();
  const stream = getSSEStream();
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
};
