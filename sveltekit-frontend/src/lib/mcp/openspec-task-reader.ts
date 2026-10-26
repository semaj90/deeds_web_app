// src/lib/mcp/openspec-task-reader.ts
import { stat, readFile } from "node:fs/promises";

export type OpenSpecTaskReadResult =
  | { status: "OK"; taskId: string; locator: string; card: unknown }
  | { status: "CARD_NOT_AVAILABLE"; taskId: string; locator: string; reason: string };

export async function readOpenSpecTaskFast(
  taskId: string,
  locatorPath: string,
  reportCardPath: string,
  timeoutMs = 1500
): Promise<OpenSpecTaskReadResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1. Fast stat check: never block waiting for missing report cards
    const cardStat = await stat(reportCardPath).catch(() => null);
    if (!cardStat || !cardStat.isFile()) {
      return {
        status: "CARD_NOT_AVAILABLE",
        taskId,
        locator: `${locatorPath}#L559`,
        reason: `Report card missing at ${reportCardPath}; returning locator-only immediately.`
      };
    }

    const raw = await readFile(reportCardPath, { encoding: "utf-8", signal: controller.signal });
    return { status: "OK", taskId, locator: `${locatorPath}#L559`, card: JSON.parse(raw) };
  } catch (err) {
    return {
      status: "CARD_NOT_AVAILABLE",
      taskId,
      locator: `${locatorPath}#L559`,
      reason: err instanceof Error ? err.message : "Bounded read timeout exceeded"
    };
  } finally {
    clearTimeout(timer);
  }
}
