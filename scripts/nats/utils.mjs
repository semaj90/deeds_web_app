/**
 * NATS utility functions
 */

export async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function log(subject, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${subject}] ${message}`);
}

export function logError(subject, message) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [${subject}] ERROR: ${message}`);
}

export const NATS_CONFIG = {
  servers: process.env.NATS_SERVERS?.split(',') || ['nats://127.0.0.1:4222'],
  timeout: parseInt(process.env.NATS_TIMEOUT || '5000'),
  retries: parseInt(process.env.NATS_RETRIES || '3')
};

export const SUBJECTS = {
  // Workstation idle agent
  workstationIdleReview: 'workstation.idle.review',
  workstationStartupReview: 'workstation.startup.review',

  // Agent recommendations
  agentRecommendationCreated: 'agent.recommendation.created',
  agentRecommendationAccepted: 'agent.recommendation.accepted',
  agentRecommendationRejected: 'agent.recommendation.rejected',

  // Agent health
  agentHealthGPU: 'agent.health.gpu',
  agentHealthIndexes: 'agent.health.indexes',

  // RLM
  agentRLMUpdate: 'agent.rlm.update',

  // Legacy subjects
  agentTaskExecute: 'agent.task.execute',
  retrievalTurbovecRerank: 'retrieval.turbovec.rerank',
  gpuCuvsSearch: 'gpu.cuvs.search',
  gpuCudaRank: 'gpu.cuda.rank',
  engramFeedbackAsync: 'engram.feedback.async'
};
