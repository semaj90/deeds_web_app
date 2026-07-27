import { describe, it, expect } from "vitest";
import { RawObservationSchema } from "$lib/server/unknown/observation-ingester";

describe("Phase 109 Stage 1: Observation Ingestion", () => {
  const testWorkspaceId = "test-workspace-001";

  describe("Valid observations", () => {
    it("Test 1: Scanner observation", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:001",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/lib/server/auth.ts",
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 2: LDR observation", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:002",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/lib/db.ts",
        source_kind: "ldr"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 3: User submission", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:003",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/routes/+page.svelte",
        source_kind: "user_submission"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 4: Edge case", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:004",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/Button.svelte",
        source_kind: "edge_case"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 5: Minimal", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:005",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/minimal.ts",
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });
  });

  describe("Identity validation", () => {
    it("Test 6: Missing observation_id", () => {
      const result = RawObservationSchema.safeParse({
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/test.ts",
        source_kind: "scanner"
      });
      expect(result.success).toBe(false);
    });

    it("Test 7: Empty observation_id", () => {
      const result = RawObservationSchema.safeParse({
        observation_id: "",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/test.ts",
        source_kind: "scanner"
      });
      expect(result.success).toBe(false);
    });

    it("Test 8: Missing workspace_id", () => {
      const result = RawObservationSchema.safeParse({
        observation_id: "obs:2026-07-26:test:008",
        potential_source_ref: "src/test.ts",
        source_kind: "scanner"
      });
      expect(result.success).toBe(false);
    });

    it("Test 9: Empty workspace_id", () => {
      const result = RawObservationSchema.safeParse({
        observation_id: "obs:2026-07-26:test:009",
        workspace_id: "",
        potential_source_ref: "src/test.ts",
        source_kind: "scanner"
      });
      expect(result.success).toBe(false);
    });

    it("Test 10: Missing source_ref", () => {
      const result = RawObservationSchema.safeParse({
        observation_id: "obs:2026-07-26:test:010",
        workspace_id: testWorkspaceId,
        source_kind: "scanner"
      });
      expect(result.success).toBe(false);
    });

    it("Test 11: Empty source_ref", () => {
      const result = RawObservationSchema.safeParse({
        observation_id: "obs:2026-07-26:test:011",
        workspace_id: testWorkspaceId,
        potential_source_ref: "",
        source_kind: "scanner"
      });
      expect(result.success).toBe(false);
    });

    it("Test 12: Invalid source_kind", () => {
      const result = RawObservationSchema.safeParse({
        observation_id: "obs:2026-07-26:test:012",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/test.ts",
        source_kind: "invalid"
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Paths and optionals", () => {
    it("Test 13: Windows path", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:013",
        workspace_id: testWorkspaceId,
        potential_source_ref: "C:\\Users\\project\\src\\auth.ts",
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 14: Mixed path", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:014",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src\\lib\\Button.svelte",
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 15: POSIX path", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:015",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/lib/Button.svelte",
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 16: With feature_id", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:016",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/test.ts",
        potential_feature_id: "test.feature",
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 17: With feature_label", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:017",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/test.ts",
        potential_feature_label: "Test",
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 18: With evidence_payload", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:018",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/test.ts",
        evidence_payload: { field: "value" },
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 19: All optional fields", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:019",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/complete.ts",
        potential_feature_id: "complete.feature",
        potential_feature_label: "Complete",
        evidence_payload: { stage: "testing" },
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("Test 20: Special chars", () => {
      const obs = {
        observation_id: "obs:2026-07-26:special-chars_001",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/test.ts",
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 21: Long ID", () => {
      const obs = {
        observation_id: "obs:" + "x".repeat(200),
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/test.ts",
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });

    it("Test 22: All source_kinds", () => {
      const kinds = ["scanner", "ldr", "user_submission", "edge_case"];
      for (const kind of kinds) {
        const obs = {
          observation_id: `obs:2026-07-26:${kind}`,
          workspace_id: testWorkspaceId,
          potential_source_ref: "src/test.ts",
          source_kind: kind
        };
        expect(RawObservationSchema.safeParse(obs).success).toBe(true);
      }
    });

    it("Test 23: Complex payload", () => {
      const obs = {
        observation_id: "obs:2026-07-26:test:023",
        workspace_id: testWorkspaceId,
        potential_source_ref: "src/test.ts",
        evidence_payload: {
          nested: { level1: { level2: ["a", "b"] } },
          number: 42
        },
        source_kind: "scanner"
      };
      expect(RawObservationSchema.safeParse(obs).success).toBe(true);
    });
  });
});
