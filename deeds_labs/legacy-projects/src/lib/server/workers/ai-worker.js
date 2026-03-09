const { parentPort, workerData } = require('worker_threads');

async function handleTask(data) {
  switch (data.type) {
    case 'search': {
      // lazy-load fuse to keep worker small until needed
      const Fuse = require('fuse.js');
      const dataset = data.dataset || [];
      const query = data.query || '';
      const fuse = new Fuse(dataset, {
        keys: ['title', 'content'],
        includeScore: true,
        includeMatches: true,
      });
      const results = fuse.search(query);
      return { success: true, result: results };
    }
    case 'ai': {
      // Simulate heavy AI computation -- replace with actual Gemma calls in future
      await new Promise((r) => setTimeout(r, 200));
      const prompt = data.prompt || '';
      return { success: true, result: { summary: `AI processed (worker): ${prompt}` } };
    }
    default:
      throw new Error(`Unknown worker task: ${data.type}`);
  }
}

handleTask(workerData)
  .then((res) => {
    parentPort.postMessage(res);
  })
  .catch((err) => {
    parentPort.postMessage({ success: false, error: err.message || String(err) });
  });
