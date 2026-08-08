import { describe, it, expect } from "vitest";
import { generateLabelsFromHypergraph, validateLabelQuality } from "$lib/server/learning/label-generator";

describe("Label Generator", () => {
  describe("generateLabelsFromHypergraph", () => {
    it("generates positive labels for high co-success rates", () => {
      const evidence = [
        {
          packet_a: { packet_key: "packet_a", source_ref: "", successful_runs: 100, failed_runs: 0 },
          packet_b: { packet_key: "packet_b", source_ref: "", successful_runs: 100, failed_runs: 0 },
          co_success: 0.95,
          co_retrieved_count: 100,
        },
      ];

      const labels = generateLabelsFromHypergraph(evidence);

      expect(labels).toHaveLength(1);
      expect(labels[0].packet_a_key).toBe("packet_a");
      expect(labels[0].packet_b_key).toBe("packet_b");
      expect(labels[0].score).toBe(1.0);
      expect(labels[0].label_type).toBe("positive");
    });

    it("generates hard negative labels for low co-success rates", () => {
      const evidence = [
        {
          packet_a: { packet_key: "packet_a", source_ref: "", successful_runs: 0, failed_runs: 100 },
          packet_b: { packet_key: "packet_b", source_ref: "", successful_runs: 0, failed_runs: 100 },
          co_success: 0.07,
          co_retrieved_count: 100,
        },
      ];

      const labels = generateLabelsFromHypergraph(evidence);

      expect(labels).toHaveLength(1);
      expect(labels[0].score).toBe(0.65);
      expect(labels[0].label_type).toBe("hard_negative");
    });

    it("generates weak positive labels for moderate co-success rates", () => {
      const evidence = [
        {
          packet_a: { packet_key: "packet_a", source_ref: "", successful_runs: 50, failed_runs: 50 },
          packet_b: { packet_key: "packet_b", source_ref: "", successful_runs: 50, failed_runs: 50 },
          co_success: 0.5,
          co_retrieved_count: 100,
        },
      ];

      const labels = generateLabelsFromHypergraph(evidence);

      expect(labels).toHaveLength(1);
      expect(labels[0].score).toBe(0.90);
      expect(labels[0].label_type).toBe("positive");
    });
  });

  describe("validateLabelQuality", () => {
    it("validates good label quality with diversity", () => {
      const labels = [
        {
          packet_a_key: "packet_a",
          packet_b_key: "packet_b",
          score: 1.0,
          label_type: "positive",
          evidence: { co_success: 0.95, co_retrieved_count: 100, successful_runs: 100, failed_runs: 0 },
        },
        {
          packet_a_key: "packet_a",
          packet_b_key: "packet_c",
          score: 0.65,
          label_type: "hard_negative",
          evidence: { co_success: 0.07, co_retrieved_count: 100, successful_runs: 0, failed_runs: 100 },
        },
      ];

      const quality = validateLabelQuality(labels);

      expect(quality.valid).toBe(true);
      expect(quality.issues).toHaveLength(0);
    });

    it("detects too few hard negatives", () => {
      const labels = [
        {
          packet_a_key: "packet_a",
          packet_b_key: "packet_b",
          score: 1.0,
          label_type: "positive",
          evidence: { co_success: 0.95, co_retrieved_count: 100, successful_runs: 100, failed_runs: 0 },
        },
        {
          packet_a_key: "packet_a",
          packet_b_key: "packet_c",
          score: 1.0,
          label_type: "positive",
          evidence: { co_success: 0.95, co_retrieved_count: 100, successful_runs: 100, failed_runs: 0 },
        },
      ];

      const quality = validateLabelQuality(labels);

      expect(quality.valid).toBe(false);
      expect(quality.issues).toContain("Too few hard negatives");
    });

    it("detects all positive labels", () => {
      const labels = [
        {
          packet_a_key: "packet_a",
          packet_b_key: "packet_b",
          score: 1.0,
          label_type: "positive",
          evidence: { co_success: 0.95, co_retrieved_count: 100, successful_runs: 100, failed_runs: 0 },
        },
        {
          packet_a_key: "packet_a",
          packet_b_key: "packet_c",
          score: 1.0,
          label_type: "positive",
          evidence: { co_success: 0.95, co_retrieved_count: 100, successful_runs: 100, failed_runs: 0 },
        },
      ];

      const quality = validateLabelQuality(labels);

      expect(quality.valid).toBe(false);
      expect(quality.issues).toContain("All labels are positive");
    });
  });
});
