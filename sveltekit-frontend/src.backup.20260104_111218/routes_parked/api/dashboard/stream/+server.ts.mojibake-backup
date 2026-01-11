import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      controller.enqueue(
        `data: ${JSON.stringify({
          type: 'connected',
          message: 'Dashboard stream connected',
        })}\n\n`
      );

      // Simulate periodic updates (in production, this would be event-driven)
      const interval = setInterval(() => {
        try {
          // Send mock stats update every 30 seconds
          const stats = {
            type: 'stats',
            data: {
              activeCases: Math.floor(Math.random() * 20),
              pendingEvidence: Math.floor(Math.random() * 100),
              approvedEvidence: Math.floor(Math.random() * 200),
              personsOfInterest: Math.floor(Math.random() * 15),
            },
          };

          controller.enqueue(`data: ${JSON.stringify(stats)}\n\n`);
        } catch (error) {
          console.error('SSE error:', error);
          clearInterval(interval);
          controller.close();
        }
      }, 30000);

      // Clean up on client disconnect
      return () => {
        clearInterval(interval);
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
