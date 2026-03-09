/// <reference lib="webworker" />
self.onmessage = async (event: MessageEvent) => {
  const { task } = event.data;
  if (!task) return;
  if (task.type === 'ai') {
    const summary = `Simulated AI summary for: ${task.prompt ?? ''}`;
    postMessage({ taskId: task.id, result: summary });
  } else if (task.type === 'search') {
    // naive in-worker search (should be replaced by indexeddb-backed search)
    const dataset = task.dataset || [];
    const query = (task.query || '').toLowerCase();
    const results = dataset.filter((d: any) =>
      (d.title + ' ' + (d.content || '')).toLowerCase().includes(query)
    );
    postMessage({ taskId: task.id, result: results });
  } else {
    postMessage({ taskId: task.id, error: 'Unsupported client worker task' });
  }
};
