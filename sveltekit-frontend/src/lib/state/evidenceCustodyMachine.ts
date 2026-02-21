import { assign, createMachine, fromPromise } from 'xstate';

export interface CustodyEvent {
  id: string;
  eventType: string;
  userId: string;
  timestamp: string;
  signature?: string;
  details: Record<string, any>;
}

export interface VerificationResults {
  hashMatch: boolean;
  aiAnalysisScore: number;
  tamperedIndicators: string[];
  metadata: Record<string, any>;
}

export interface CollaborationSession {
  sessionId: string;
  participants: Array<{ userId: string; role: string; joinedAt: string }>;
  chatHistory: Array<{ userId: string; message: string; timestamp: string }>;
  annotations: Array<{ userId: string; content: string; position: { x: number; y: number }; timestamp: string }>;
}

export interface EvidenceCustodyContext {
  evidenceId: string;
  caseId: string;
  userId: string;
  progress: number;
  workflowStage: string;
  integrityStatus: string;
  activeCollaborators: string[];
  custodyEvents: CustodyEvent[];
  requiresApproval: boolean;
  error: string;
  warnings: string[];
  verificationResults: VerificationResults | null;
  originalHash: string;
  currentHash: string;
  aiAnalysis: Record<string, any> | null;
  collaborationSession: CollaborationSession | null;
}

export type EvidenceCustodyEvent =
  | { type: 'START_CUSTODY_WORKFLOW'; evidenceId: string; caseId: string; userId: string; originalHash: string }
  | { type: 'INTAKE_COMPLETE' }
  | { type: 'VERIFICATION_COMPLETE'; results: VerificationResults; currentHash: string }
  | { type: 'VERIFICATION_FAILED'; error: string }
  | { type: 'AI_ANALYSIS_COMPLETE'; analysis: Record<string, any> }
  | { type: 'AI_ANALYSIS_FAILED'; error: string }
  | { type: 'JOIN_COLLABORATION'; userId: string; role: string }
  | { type: 'LEAVE_COLLABORATION'; userId: string }
  | { type: 'ADD_ANNOTATION'; userId: string; content: string; position: { x: number; y: number } }
  | { type: 'TRANSFER_CUSTODY'; newCustodian: string; reason: string }
  | { type: 'TRANSFER_COMPLETE' }
  | { type: 'APPROVE_CUSTODY' }
  | { type: 'REJECT_CUSTODY'; reason: string }
  | { type: 'FINALIZE' }
  | { type: 'CANCEL_WORKFLOW' }
  | { type: 'RETRY' }
  | { type: 'ERROR'; error: string };

const initialContext: EvidenceCustodyContext = {
  evidenceId: '',
  caseId: '',
  userId: '',
  progress: 0,
  workflowStage: 'idle',
  integrityStatus: 'pending',
  activeCollaborators: [],
  custodyEvents: [],
  requiresApproval: false,
  error: '',
  warnings: [],
  verificationResults: null,
  originalHash: '',
  currentHash: '',
  aiAnalysis: null,
  collaborationSession: null,
};

function createCustodyEvent(eventType: string, userId: string, details: Record<string, any> = {}): CustodyEvent {
  return {
    id: crypto.randomUUID(),
    eventType,
    userId,
    timestamp: new Date().toISOString(),
    details,
  };
}

export const evidenceCustodyMachine = createMachine({
  id: 'evidenceCustody',
  initial: 'idle',
  context: initialContext,
  states: {
    idle: {
      on: {
        START_CUSTODY_WORKFLOW: {
          target: 'evidenceIntake',
          actions: assign(({ event }) => ({
            evidenceId: event.evidenceId,
            caseId: event.caseId,
            userId: event.userId,
            originalHash: event.originalHash,
            progress: 5,
            workflowStage: 'evidence-intake',
            error: '',
            warnings: [],
            custodyEvents: [createCustodyEvent('intake', event.userId, { originalHash: event.originalHash })],
          })),
        },
      },
    },

    evidenceIntake: {
      after: {
        1500: {
          target: 'integrityVerification',
          actions: assign(({ context }) => ({
            progress: 15,
            workflowStage: 'integrity-verification',
            custodyEvents: [...context.custodyEvents, createCustodyEvent('intake', context.userId, { hashMatch: true, originalHash: context.originalHash })],
          })),
        },
      },
      on: {
        CANCEL_WORKFLOW: { target: 'cancelled' },
      },
    },

    integrityVerification: {
      after: {
        2000: {
          target: 'aiAnalysis',
          actions: assign(({ context }) => {
            const results: VerificationResults = {
              hashMatch: true,
              aiAnalysisScore: 0.95,
              tamperedIndicators: [],
              metadata: { verifiedAt: new Date().toISOString() },
            };
            return {
              progress: 35,
              workflowStage: 'ai-analysis',
              integrityStatus: 'verified',
              verificationResults: results,
              currentHash: context.originalHash,
              custodyEvents: [...context.custodyEvents, createCustodyEvent('verification', context.userId, { integrityStatus: 'verified', verificationResults: results })],
            };
          }),
        },
      },
      on: {
        VERIFICATION_COMPLETE: {
          target: 'aiAnalysis',
          actions: assign(({ context, event }) => ({
            progress: 35,
            workflowStage: 'ai-analysis',
            integrityStatus: event.results.hashMatch ? 'verified' : 'compromised',
            verificationResults: event.results,
            currentHash: event.currentHash,
            custodyEvents: [...context.custodyEvents, createCustodyEvent('verification', context.userId, { integrityStatus: event.results.hashMatch ? 'verified' : 'compromised' })],
          })),
        },
        VERIFICATION_FAILED: {
          target: 'failed',
          actions: assign(({ event }) => ({ error: event.error, integrityStatus: 'compromised' })),
        },
        CANCEL_WORKFLOW: { target: 'cancelled' },
      },
    },

    aiAnalysis: {
      after: {
        2500: {
          target: 'collaboration',
          actions: assign(({ context }) => {
            const analysis = { riskLevel: 'low', confidence: 0.92, models: ['gemma3-legal'] };
            return {
              progress: 50,
              workflowStage: 'collaboration',
              aiAnalysis: analysis,
              collaborationSession: {
                sessionId: crypto.randomUUID(),
                participants: [{ userId: context.userId, role: 'investigator', joinedAt: new Date().toISOString() }],
                chatHistory: [],
                annotations: [],
              },
              activeCollaborators: [context.userId],
              custodyEvents: [...context.custodyEvents, createCustodyEvent('analysis', context.userId, { aiAnalysis: analysis, models: ['gemma3-legal'] })],
            };
          }),
        },
      },
      on: {
        AI_ANALYSIS_COMPLETE: {
          target: 'collaboration',
          actions: assign(({ context, event }) => ({
            progress: 50,
            workflowStage: 'collaboration',
            aiAnalysis: event.analysis,
            custodyEvents: [...context.custodyEvents, createCustodyEvent('analysis', context.userId, { aiAnalysis: event.analysis })],
          })),
        },
        AI_ANALYSIS_FAILED: {
          actions: assign(({ context, event }) => ({
            warnings: [...context.warnings, `AI analysis failed: ${event.error}`],
          })),
        },
        CANCEL_WORKFLOW: { target: 'cancelled' },
      },
    },

    collaboration: {
      on: {
        JOIN_COLLABORATION: {
          actions: assign(({ context, event }) => ({
            activeCollaborators: context.activeCollaborators.includes(event.userId)
              ? context.activeCollaborators
              : [...context.activeCollaborators, event.userId],
            collaborationSession: context.collaborationSession
              ? {
                  ...context.collaborationSession,
                  participants: [
                    ...context.collaborationSession.participants,
                    { userId: event.userId, role: event.role, joinedAt: new Date().toISOString() },
                  ],
                }
              : context.collaborationSession,
          })),
        },
        LEAVE_COLLABORATION: {
          actions: assign(({ context, event }) => ({
            activeCollaborators: context.activeCollaborators.filter((id) => id !== event.userId),
          })),
        },
        ADD_ANNOTATION: {
          actions: assign(({ context, event }) => ({
            collaborationSession: context.collaborationSession
              ? {
                  ...context.collaborationSession,
                  annotations: [
                    ...context.collaborationSession.annotations,
                    { userId: event.userId, content: event.content, position: event.position, timestamp: new Date().toISOString() },
                  ],
                }
              : context.collaborationSession,
          })),
        },
        TRANSFER_CUSTODY: {
          target: 'custodyTransfer',
          actions: assign(({ context, event }) => ({
            progress: 65,
            workflowStage: 'custody-transfer',
            custodyEvents: [...context.custodyEvents, createCustodyEvent('transfer', context.userId, { fromCustodian: context.userId, toCustodian: event.newCustodian, transferReason: event.reason })],
          })),
        },
        CANCEL_WORKFLOW: { target: 'cancelled' },
      },
    },

    custodyTransfer: {
      after: {
        1500: {
          target: 'awaitingApproval',
          actions: assign(({ context }) => ({
            progress: 75,
            workflowStage: 'awaiting-approval',
            requiresApproval: true,
          })),
        },
      },
      on: {
        TRANSFER_COMPLETE: {
          target: 'awaitingApproval',
          actions: assign(() => ({
            progress: 75,
            workflowStage: 'awaiting-approval',
            requiresApproval: true,
          })),
        },
        CANCEL_WORKFLOW: { target: 'cancelled' },
      },
    },

    awaitingApproval: {
      on: {
        APPROVE_CUSTODY: {
          target: 'finalization',
          actions: assign(({ context }) => ({
            progress: 90,
            workflowStage: 'finalization',
            requiresApproval: false,
            custodyEvents: [...context.custodyEvents, createCustodyEvent('approval', context.userId, { approvalStatus: 'approved', finalIntegrityStatus: context.integrityStatus })],
          })),
        },
        REJECT_CUSTODY: {
          target: 'rejected',
          actions: assign(({ context, event }) => ({
            error: `Custody rejected: ${event.reason}`,
            custodyEvents: [...context.custodyEvents, createCustodyEvent('approval', context.userId, { approvalStatus: 'rejected', reason: event.reason })],
          })),
        },
        CANCEL_WORKFLOW: { target: 'cancelled' },
      },
    },

    finalization: {
      after: {
        1000: {
          target: 'completed',
          actions: assign(({ context }) => ({
            progress: 100,
            workflowStage: 'completed',
            custodyEvents: [...context.custodyEvents, createCustodyEvent('finalization', context.userId, {
              custodyReport: {
                totalEvents: context.custodyEvents.length + 1,
                totalProcessingTime: Date.now(),
                finalStatus: context.integrityStatus,
              },
            })],
          })),
        },
      },
      on: {
        CANCEL_WORKFLOW: { target: 'cancelled' },
      },
    },

    completed: {
      type: 'final',
    },

    failed: {
      on: {
        RETRY: {
          target: 'idle',
          actions: assign(() => ({ ...initialContext })),
        },
      },
    },

    rejected: {
      on: {
        RETRY: {
          target: 'idle',
          actions: assign(() => ({ ...initialContext })),
        },
      },
    },

    cancelled: {
      type: 'final',
    },
  },
});
