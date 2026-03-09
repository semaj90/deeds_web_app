import { writable } from 'svelte/store';

export const liveReports = writable<any[]>([]);

export function connectReportsStream() {
  const evtSource = new EventSource('/api/reports/stream');
  evtSource.addEventListener('message', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'report-updated') {
        liveReports.update((arr) => [data, ...arr]);
      }
    } catch (err) {
      console.error('SSE parse error', err);
    }
  });

  evtSource.onerror = (err) => {
    console.warn('SSE connection lost', err);
    setTimeout(connectReportsStream, 5000);
  };

  return evtSource;
}
