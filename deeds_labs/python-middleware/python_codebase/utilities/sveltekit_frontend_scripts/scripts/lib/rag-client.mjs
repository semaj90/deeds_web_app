import fetch from "node-fetch";

export async function suggestFix(errorText) {
  const response = await fetch(process.env.RAG_ENDPOINT + "/suggest_fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: errorText })
  });
  if (!response.ok) throw new Error(await response.text());
  return await response.json(); // -> {suggestedFix, confidence, embedding}
}

export async function applyFix(file, patch) {
  const response = await fetch(process.env.RAG_ENDPOINT + "/apply_fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file, patch })
  });
  return await response.json(); // -> {ok: boolean, message: string}
}
