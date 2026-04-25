/**
 * Unit tests for Rune UUID Generator
 */

import {
  buildRunes,
  getRuneByUUID,
  getRuneBySymbol,
  getAllRunes,
  getRuneByTileIndex,
  verifyRuneBankIntegrity,
  exportRuneBankToJSON,
  importRuneBankFromJSON,
  getBaseRunes,
  getRuneCount,
  RuneBank,
} from '../../services/rune_uuid_generator';

describe('Rune UUID Generator', () => {
  let runes: RuneBank[];

  beforeEach(() => {
    runes = buildRunes();
  });

  describe('buildRunes', () => {
    it('should generate exactly 26 runes', () => {
      expect(runes.length).toBe(26);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set(runes.map(r => r.tensor_uuid));
      expect(uuids.size).toBe(26);
    });

    it('should generate valid UUIDs in hex format', () => {
      for (const rune of runes) {
        expect(rune.tensor_uuid).toMatch(/^[0-9a-f]{32}$/);
      }
    });

    it('should generate FP16 embeddings with correct dimension', () => {
      for (const rune of runes) {
        expect(rune.embedding_fp16.length).toBe(768);
      }
    });

    it('should generate normalized embeddings (unit vectors)', () => {
      for (const rune of runes) {
        let norm = 0;
        for (const val of rune.embedding_fp16) {
          norm += val * val;
        }
        norm = Math.sqrt(norm);
        expect(norm).toBeCloseTo(1.0, 1); // Allow small tolerance
      }
    });

    it('should generate valid INT4 quantization', () => {
      for (const rune of runes) {
        expect(rune.latent_int4).toMatch(/^[0-9a-f]*$/);
        // INT4 quantization should be roughly half the embedding size
        expect(rune.latent_int4.length).toBeGreaterThan(0);
      }
    });

    it('should assign valid tile indices', () => {
      for (const rune of runes) {
        expect(rune.tile_index).toBeGreaterThanOrEqual(0);
        expect(rune.tile_index).toBeLessThan(26);
      }
    });

    it('should have unique tile indices', () => {
      const indices = new Set(runes.map(r => r.tile_index));
      expect(indices.size).toBe(26);
    });
  });

  describe('getRuneByUUID', () => {
    it('should retrieve rune by UUID', () => {
      const rune = runes[0];
      const retrieved = getRuneByUUID(rune.tensor_uuid);
      expect(retrieved).toEqual(rune);
    });

    it('should return null for invalid UUID', () => {
      const retrieved = getRuneByUUID('invalid-uuid');
      expect(retrieved).toBeNull();
    });
  });

  describe('getRuneBySymbol', () => {
    it('should retrieve rune by symbol', () => {
      const rune = runes[0];
      const retrieved = getRuneBySymbol(rune.rune);
      expect(retrieved).toEqual(rune);
    });

    it('should return null for invalid symbol', () => {
      const retrieved = getRuneBySymbol('invalid');
      expect(retrieved).toBeNull();
    });
  });

  describe('getAllRunes', () => {
    it('should return all runes', () => {
      const all = getAllRunes();
      expect(all.length).toBe(26);
    });

    it('should return runes in consistent order', () => {
      const all1 = getAllRunes();
      const all2 = getAllRunes();
      expect(all1.map(r => r.tensor_uuid)).toEqual(all2.map(r => r.tensor_uuid));
    });
  });

  describe('getRuneByTileIndex', () => {
    it('should retrieve rune by tile index', () => {
      const rune = runes[5];
      const retrieved = getRuneByTileIndex(5);
      expect(retrieved).toEqual(rune);
    });

    it('should return null for out-of-bounds index', () => {
      expect(getRuneByTileIndex(-1)).toBeNull();
      expect(getRuneByTileIndex(26)).toBeNull();
      expect(getRuneByTileIndex(100)).toBeNull();
    });
  });

  describe('verifyRuneBankIntegrity', () => {
    it('should verify valid rune bank', () => {
      const result = verifyRuneBankIntegrity(runes);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should detect duplicate UUIDs', () => {
      const corrupted = [...runes];
      corrupted[1].tensor_uuid = corrupted[0].tensor_uuid;
      const result = verifyRuneBankIntegrity(corrupted);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate UUID'))).toBe(true);
    });

    it('should detect invalid tile indices', () => {
      const corrupted = [...runes];
      corrupted[0].tile_index = 100;
      const result = verifyRuneBankIntegrity(corrupted);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid tile index'))).toBe(true);
    });

    it('should detect invalid embedding dimensions', () => {
      const corrupted = [...runes];
      corrupted[0].embedding_fp16 = [1, 2, 3]; // Wrong dimension
      const result = verifyRuneBankIntegrity(corrupted);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid embedding dimension'))).toBe(true);
    });
  });

  describe('JSON serialization', () => {
    it('should export rune bank to JSON', () => {
      const json = exportRuneBankToJSON(runes);
      expect(typeof json).toBe('string');
      expect(json).toContain('tensor_uuid');
      expect(json).toContain('embedding_fp16');
    });

    it('should import rune bank from JSON', () => {
      const json = exportRuneBankToJSON(runes);
      const imported = importRuneBankFromJSON(json);
      expect(imported.length).toBe(26);
      expect(imported[0].tensor_uuid).toBe(runes[0].tensor_uuid);
    });

    it('should round-trip JSON serialization', () => {
      const json1 = exportRuneBankToJSON(runes);
      const imported = importRuneBankFromJSON(json1);
      const json2 = exportRuneBankToJSON(imported);
      expect(json1).toBe(json2);
    });
  });

  describe('getBaseRunes', () => {
    it('should return 26 base runes', () => {
      const base = getBaseRunes();
      expect(base.length).toBe(26);
    });

    it('should return runes in consistent order', () => {
      const base1 = getBaseRunes();
      const base2 = getBaseRunes();
      expect(base1).toEqual(base2);
    });
  });

  describe('getRuneCount', () => {
    it('should return 26', () => {
      expect(getRuneCount()).toBe(26);
    });
  });
});
