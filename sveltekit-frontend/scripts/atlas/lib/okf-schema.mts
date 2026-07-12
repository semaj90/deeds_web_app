/**
 * OKF (OpenSpec Knowledge Framework) Schema Loader & Validator
 *
 * Loads and validates the .okf/ manifest + language/domain specs
 * Enforces contract: all evidence sources must be declared in manifest
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/** Feature domain evidence source */
export const FeatureEvidenceSchema = z.object({
  path_terms: z.string().array().optional(),
  imports: z.string().array().optional(),
  symbols: z.string().array().optional(),
  evidence_weight: z.enum(['high', 'medium', 'low']),
});

/** Symbol kind definition with AST labels or detection rules */
export const SymbolKindSchema = z.object({
  weight: z.number().min(0).max(1),
  description: z.string(),
  ast_labels: z.string().array().optional(),
  evidence_weight: z.enum(['high', 'medium', 'low']),
  // Detection rules (alternative to ast_labels)
  evidence: z.record(z.string().array()).optional(),
  imports: z.string().array().optional(),
  symbol_patterns: z.string().array().optional(),
  path_patterns: z.string().array().optional(),
  filename_patterns: z.string().array().optional(),
  path_markers: z.string().array().optional(),
});

/** Language specification */
export const LanguageSpecSchema = z.object({
  version: z.number(),
  language: z.string(),
  name: z.string(),
  extensions: z.string().array(),
  exclude_paths: z.string().array(),
  symbol_kinds: z.record(z.string(), SymbolKindSchema),
  features: z.record(z.string(), FeatureEvidenceSchema),
  validation: z.object({
    min_symbol_name_length: z.number(),
    max_symbol_name_length: z.number(),
    require_source_ref: z.boolean(),
    require_packet_key: z.boolean(),
    exclude_generated_markers: z.string().array(),
  }),
});

/** Extractor version info */
export const ExtractorSchema = z.object({
  version: z.string(),
  description: z.string(),
  supported_languages: z.string().array().optional(),
  symbol_kinds: z.string().array().optional(),
  features: z.string().array().optional(),
  entities: z.string().array().optional(),
});

/** Registry entry in manifest */
export const RegistryEntrySchema = z.object({
  path: z.string(),
  description: z.string(),
  schemas: z.string().array(),
});

/** OKF Manifest */
export const OKFManifestSchema = z.object({
  version: z.number(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  registries: z.record(z.string(), RegistryEntrySchema),
  extractors: z.record(z.string(), ExtractorSchema),
  pipeline: z.record(z.string(), z.string()),
});

export type LanguageSpec = z.infer<typeof LanguageSpecSchema>;
export type OKFManifest = z.infer<typeof OKFManifestSchema>;
export type ExtractorInfo = z.infer<typeof ExtractorSchema>;

// ============================================================================
// OKF LOADER
// ============================================================================

export class OKFLoader {
  private manifestPath: string;
  private okfRoot: string;
  private manifest: OKFManifest | null = null;
  private specs: Map<string, LanguageSpec> = new Map();

  constructor(okfRoot: string) {
    this.okfRoot = okfRoot;
    this.manifestPath = path.join(okfRoot, 'manifest.yaml');
  }

  /**
   * Load and validate the OKF manifest
   */
  async loadManifest(): Promise<OKFManifest> {
    if (this.manifest) return this.manifest;

    const content = fs.readFileSync(this.manifestPath, 'utf-8');
    const parsed = YAML.parse(content);

    this.manifest = OKFManifestSchema.parse(parsed);
    return this.manifest;
  }

  /**
   * Load a language specification
   */
  async loadLanguageSpec(language: string): Promise<LanguageSpec> {
    if (this.specs.has(language)) {
      return this.specs.get(language)!;
    }

    const manifest = await this.loadManifest();
    const registry = manifest.registries.languages;

    // Find the schema file for this language
    const specFile = `${language}.yaml`;
    if (!registry.schemas.includes(specFile)) {
      throw new Error(`Language '${language}' not declared in OKF manifest`);
    }

    const specPath = path.join(this.okfRoot, registry.path, specFile);
    if (!fs.existsSync(specPath)) {
      throw new Error(`Language spec not found: ${specPath}`);
    }

    const content = fs.readFileSync(specPath, 'utf-8');
    const parsed = YAML.parse(content);

    const spec = LanguageSpecSchema.parse(parsed);
    this.specs.set(language, spec);
    return spec;
  }

  /**
   * Get all supported languages
   */
  async getSupportedLanguages(): Promise<string[]> {
    const manifest = await this.loadManifest();
    const registry = manifest.registries.languages;

    return registry.schemas.map((s) => s.replace('.yaml', ''));
  }

  /**
   * Validate that all extractors declare their supported languages
   */
  async validateExtractorsConsistency(): Promise<{ valid: boolean; errors: string[] }> {
    const manifest = await this.loadManifest();
    const errors: string[] = [];

    for (const [extractorName, extractor] of Object.entries(manifest.extractors)) {
      if (!extractor.supported_languages) continue;

      for (const lang of extractor.supported_languages) {
        const registry = manifest.registries.languages;
        const specFile = `${lang}.yaml`;

        if (!registry.schemas.includes(specFile)) {
          errors.push(
            `Extractor '${extractorName}' declares unsupported language '${lang}'`
          );
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate pipeline order is topologically correct
   */
  validatePipelineOrder(): { valid: boolean; errors: string[] } {
    const manifest = this.manifest;
    if (!manifest) {
      return { valid: false, errors: ['Manifest not loaded'] };
    }

    const errors: string[] = [];
    const stages = Object.entries(manifest.pipeline)
      .map(([idx, name]) => ({ index: parseInt(idx), name }))
      .sort((a, b) => a.index - b.index);

    // Check indices are sequential
    for (let i = 0; i < stages.length; i++) {
      if (stages[i].index !== i + 1) {
        errors.push(
          `Pipeline index ${stages[i].index} is out of sequence (expected ${i + 1})`
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get feature domain mapping for a language
   */
  async getFeatureDomains(language: string): Promise<Record<string, typeof FeatureEvidenceSchema>> {
    const spec = await this.loadLanguageSpec(language);
    return spec.features;
  }
}

// ============================================================================
// CONTRACT VALIDATION
// ============================================================================

export async function validateOKFContract(okfRoot: string): Promise<{
  manifest: OKFManifest;
  languages: LanguageSpec[];
  valid: boolean;
  errors: string[];
}> {
  const loader = new OKFLoader(okfRoot);
  const manifest = await loader.loadManifest();
  const languages: LanguageSpec[] = [];
  const errors: string[] = [];

  // Validate manifest structure
  const pipelineValidation = loader.validatePipelineOrder();
  errors.push(...pipelineValidation.errors);

  // Validate all declared language specs exist and are valid
  for (const langFile of manifest.registries.languages.schemas) {
    const langName = langFile.replace('.yaml', '');

    try {
      const spec = await loader.loadLanguageSpec(langName);
      languages.push(spec);
    } catch (err: any) {
      errors.push(`Language '${langName}': ${err.message}`);
    }
  }

  // Validate extractor consistency
  const extractorCheck = await loader.validateExtractorsConsistency();
  errors.push(...extractorCheck.errors);

  return {
    manifest,
    languages,
    valid: errors.length === 0,
    errors,
  };
}
