/**
 * MCP Tool Response Unwrapper
 * Safely extracts text from various MCP tool response formats
 */

export function unwrapMcpText(resp) {
  if (resp == null) return "";
  if (typeof resp === "string") return resp;

  // FastMCP style: { content: [{ type:"text", text:"..." }, ...] }
  if (Array.isArray(resp.content)) {
    return resp.content
      .map((c) => (typeof c?.text === "string" ? c.text : ""))
      .filter(Boolean)
      .join("\n");
  }

  // Common alternates
  if (typeof resp.text === "string") return resp.text;
  if (typeof resp.result === "string") return resp.result;

  // Last resort
  try {
    return JSON.stringify(resp, null, 2);
  } catch {
    return String(resp);
  }
}

export function safeSlice(s, n = 800) {
  const t = (s ?? "").toString();
  return t.length > n ? t.slice(0, n) : t;
}

export function unwrapMcpJson(resp) {
  const text = unwrapMcpText(resp);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
