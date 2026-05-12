import type { SkillRecipe } from './registry.js';

export const SIMULATION_SKILLS: Record<string, SkillRecipe> = {
  mock_trial: {
    id: 'mock_trial',
    family: 'Simulation',
    description: 'Simulate a mock trial phase (Opening, Examination, Closing)',
    tools: [{ name: 'llm:generate' }, { name: 'batch:run' }]
  },
  prosecutor_argument: {
    id: 'prosecutor_argument',
    family: 'Simulation',
    description: 'Generate a persuasive prosecutorial argument for a claim',
    tools: [{ name: 'llm:generate' }, { name: 'search:vector' }]
  },
  defense_counter: {
    id: 'defense_counter',
    family: 'Simulation',
    description: 'Generate a defense counter-argument or rebuttal',
    tools: [{ name: 'llm:generate' }, { name: 'search:vector' }]
  },
  judge_questions: {
    id: 'judge_questions',
    family: 'Simulation',
    description: 'Predict questions a judge might ask regarding a claim',
    tools: [{ name: 'llm:generate' }]
  },
  cross_exam_simulator: {
    id: 'cross_exam_simulator',
    family: 'Simulation',
    description: 'Simulate the cross-examination of a witness',
    tools: [{ name: 'llm:generate' }, { name: 'search:vector' }]
  },
  objection_checker: {
    id: 'objection_checker',
    family: 'Simulation',
    description: 'Check for potential legal objections in a simulation transcript',
    tools: [{ name: 'llm:generate' }]
  },
  jury_question_generator: {
    id: 'jury_question_generator',
    family: 'Simulation',
    description: 'Predict questions a jury might have about the evidence',
    tools: [{ name: 'llm:generate' }]
  },
  outcome_probability_matrix: {
    id: 'outcome_probability_matrix',
    family: 'Simulation',
    description: 'Predict case outcomes based on various simulation scenarios',
    tools: [
      { name: 'batch:run', args: (input) => ({ tool: 'llm:generate', items: input.scenarios }) },
      { name: 'llm:generate', args: (input) => ({ prompt: `Synthesize a probability matrix from these runs: ${JSON.stringify(input.results)}` }) }
    ]
  },
  witness_coaching_report: {
    id: 'witness_coaching_report',
    family: 'Simulation',
    description: 'Generate a report to prepare a witness based on mock examination performance',
    tools: [
      { name: 'search:sql', args: (input) => ({ query: `SELECT * FROM whisper_segments WHERE speaker = '${input.witnessName}'` }) },
      { name: 'llm:generate', args: (input) => ({ prompt: `Create coaching report for ${input.witnessName} from: ${JSON.stringify(input.results)}` }) }
    ]
  },
  evidence_impact_analysis: {
    id: 'evidence_impact_analysis',
    family: 'Simulation',
    description: 'Simulate how adding or removing evidence changes the case narrative',
    tools: [
      { name: 'search:vector', args: (input) => ({ query: input.evidenceContext }) },
      { name: 'llm:generate', args: (input) => ({ prompt: `Re-evaluate case narrative if this evidence is suppressed: ${input.evidenceContext}` }) }
    ]
  }
};
