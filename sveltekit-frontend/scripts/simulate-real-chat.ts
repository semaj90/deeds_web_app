import { GET } from '../src/routes/api/chat/stream/+server.ts';

async function run() {
  const url = new URL('http://localhost:5173/api/chat/stream?q=Explain%20how%20Qdrant%20works&mode=ollama');
  
  const mockEvent = {
    url,
    locals: {
      user: { id: '1', role: 'admin' }
    },
    getClientAddress: () => '127.0.0.1',
    request: new Request(url)
  };

  try {
    const response = await GET(mockEvent as any);
    console.log('Response status:', response.status);
    
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          console.log(decoder.decode(value));
        }
      }
    }
  } catch (err) {
    console.error('Chat stream failed:', err);
  }
}

run().catch(console.error);
