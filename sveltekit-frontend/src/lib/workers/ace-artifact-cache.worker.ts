self.onmessage = async (event) => {
  const { key, artifact } = event.data;

  const cache = await caches.open('ace-artifacts-v1');
  await cache.put(
    `/ace/${key}`,
    new Response(JSON.stringify(artifact), {
      headers: { 'content-type': 'application/json' }
    })
  );

  self.postMessage({ ok: true, key });
};
export {};
