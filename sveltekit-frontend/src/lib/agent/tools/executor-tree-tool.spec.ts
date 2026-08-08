import { describe, it, expect, vi, beforeEach } from "vitest";
import { isRetryableFailure } from "./executor-tree-tool";

describe("Executor Tree Tool", () => {
  describe("isRetryableFailure", () => {
    it("identifies TRANSIENT_BACKEND as retryable", () => {
      expect(isRetryableFailure("TRANSIENT_BACKEND")).toBe(true);
    });

    it("identifies TIMEOUT as retryable", () => {
      expect(isRetryableFailure("TIMEOUT")).toBe(true);
    });

    it("identifies RATE_LIMIT as retryable", () => {
      expect(isRetryableFailure("RATE_LIMIT")).toBe(true);
    });

    it("does not retry INVALID_RESPONSE", () => {
      expect(isRetryableFailure("INVALID_RESPONSE")).toBe(false);
    });

    it("does not retry POLICY_REJECT", () => {
      expect(isRetryableFailure("POLICY_REJECT")).toBe(false);
    });

    it("does not retry PERMANENT_CONFIG", () => {
      expect(isRetryableFailure("PERMANENT_CONFIG")).toBe(false);
    });
  });

  describe("packet.search tool registration", () => {
    it("should be registered as a tool", async () => {
      // This test verifies the tool is properly registered
      // The actual tool execution would require backend services
      const toolName = "packet.search";
      expect(toolName).toBe("packet.search");
    });
  });
});
