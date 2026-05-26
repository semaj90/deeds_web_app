import { execSync } from "node:child_process";
import fs from "node:fs";

export function extractLogSignals(filePath) {
  try {
    // grab only meaningful lines
    const output = execSync(
      `rg -n "error|warn|fail|exception|timeout" "${filePath}" | head -n 200`,
      { encoding: "utf-8" }
    );

    return output;
  } catch {
    return "";
  }
}

export async function summarizeLog(gemmaClient, text) {
  if (!text) return null;

  const prompt = `
Extract key failure patterns from this log.

Return JSON:
{
  "patterns": [],
  "modules": [],
  "rootCauses": []
}

LOG:
${text.slice(0, 12000)}
`;

  const res = await gemmaClient(prompt);
  return res;
}
