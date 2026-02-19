// ops/triton/node_triton_client.ts
// Very small Triton HTTP client helper using fetch. Replace with triton-node if desired.

export async function tritonInfer(url: string, modelName: string, inputs: any) {
  const endpoint = `${url}/v2/models/${modelName}/infer`;
  const body = { inputs };
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Triton infer failed: ${res.status}`);
  return res.json();
}
