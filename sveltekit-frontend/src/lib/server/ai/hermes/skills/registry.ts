/**
 * Hermes Skill Recipe Registry
 * 
 * Defines 200+ actions as recipes (Layer 2) composed of stable tools.
 */

export interface SkillRecipe {
  id: string;
  family: string;
  description: string;
  stopOnFailure?: boolean; // Stop execution of the recipe if a tool fails
  parallel?: boolean;      // Execute tools in parallel
  tools: Array<{
    name: string;
    args?: (input: any) => Record<string, any>;
  }>;
}

export const SKILL_FAMILIES = [
  'Research', 'Evidence', 'Codebase', 'Graph', 'Vector / Cluster',
  'Memory', 'Batch', 'Repair', 'Legal / Case', 'Simulation',
  'GPU / Acceleration', 'UI / Diagnostics'
] as const;

import { RESEARCH_SKILLS } from './research.js';
import { CODEBASE_SKILLS } from './codebase.js';
import { GRAPH_SKILLS } from './graph.js';
import { EVIDENCE_SKILLS } from './evidence.js';
import { VECTOR_CLUSTER_SKILLS } from './vector-cluster.js';
import { LEGAL_CASE_SKILLS } from './legal-case.js';
import { SIMULATION_SKILLS } from './simulation.js';
import { MEMORY_SKILLS } from './memory.js';
import { BATCH_SKILLS } from './batch.js';
import { REPAIR_SKILLS } from './repair.js';
import { GPU_ACCELERATION_SKILLS } from './gpu-acceleration.js';
import { UI_DIAGNOSTICS_SKILLS } from './ui-diagnostics.js';

export const HERMES_SKILLS: Record<string, SkillRecipe> = {
  ...RESEARCH_SKILLS,
  ...CODEBASE_SKILLS,
  ...GRAPH_SKILLS,
  ...EVIDENCE_SKILLS,
  ...VECTOR_CLUSTER_SKILLS,
  ...LEGAL_CASE_SKILLS,
  ...SIMULATION_SKILLS,
  ...MEMORY_SKILLS,
  ...BATCH_SKILLS,
  ...REPAIR_SKILLS,
  ...GPU_ACCELERATION_SKILLS,
  ...UI_DIAGNOSTICS_SKILLS,
};

/**
 * Bulk registration helper for the 200+ actions.
 */
export function registerSkill(recipe: SkillRecipe) {
  HERMES_SKILLS[recipe.id] = recipe;
}

