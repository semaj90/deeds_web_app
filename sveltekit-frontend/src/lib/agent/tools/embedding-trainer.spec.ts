import { describe, it, expect } from "vitest";
import { createEmbeddingTrainer, generateRetrievalLabels, generateHardNegatives } from "$lib/server/learning/embedding-trainer";

describe("Embedding Trainer", () => {
  describe("createEmbeddingTrainer", () => {
    it("creates a trainer with default configuration", () => {
      const config = {
        type: 'sentence_transformers',
        model_name: 'embeddinggemma:latest',
        device: 'cuda',
        batch_size: 32,
        learning_rate: 1e-4,
        epochs: 10,
        data_source: 'agent_runs',
      };

      const trainer = createEmbeddingTrainer(config);

      expect(trainer.config).toEqual(config);
      expect(trainer.stats).toBeNull();
    });

    it("creates a trainer with Quaterion configuration", () => {
      const config = {
        type: 'quaterion',
        model_name: 'quaterion-embedding',
        device: 'cuda',
        batch_size: 16,
        learning_rate: 5e-5,
        epochs: 5,
        data_source: 'agent_runs',
      };

      const trainer = createEmbeddingTrainer(config);

      expect(trainer.config.type).toBe('quaterion');
    });
  });

  describe("generateRetrievalLabels", () => {
    it("generates labels based on co-success rates", () => {
      const candidates = [
        {
          packet_key: 'packet_b',
          source_ref: 'src/file.ts',
          score: 0.95,
          evidence: {
            successful_runs: 95,
            failed_runs: 5,
          },
        },
        {
          packet_key: 'packet_c',
          source_ref: 'src/file.ts',
          score: 0.07,
          evidence: {
            successful_runs: 7,
            failed_runs: 93,
          },
        },
      ];

      const labels = generateRetrievalLabels('query_1', candidates);

      expect(labels.packet_b).toBeCloseTo(0.95, 1);
      expect(labels.packet_c).toBeCloseTo(0.07, 1);
    });
  });

  describe("generateHardNegatives", () => {
    it("identifies hard negatives from failed runs", () => {
      const candidates = [
        {
          packet_key: 'packet_a',
          source_ref: 'src/file.ts',
          score: 0.9,
          evidence: {
            successful_runs: 100,
            failed_runs: 0,
          },
        },
        {
          packet_key: 'packet_b',
          source_ref: 'src/file.ts',
          score: 0.8,
          evidence: {
            successful_runs: 0,
            failed_runs: 100,
          },
        },
      ];

      const hardNegatives = generateHardNegatives('query_1', candidates);

      expect(hardNegatives).toHaveLength(1);
      expect(hardNegatives[0].packet_key).toBe('packet_b');
      expect(hardNegatives[0].reason).toBe('hard_negative');
    });
  });
});
