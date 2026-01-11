/**
 * User Workflow XState Machine
 * Manages user interaction workflows, case management, and collaborative processes
 */
import { assign, createMachine, type ActorRefFrom } from 'xstate';

// Type definitions
export interface User {
  id: string; email: string;
  name: string; role: string;
}

export interface LegalCase {
  id: string; title: string;
  status: string; createdAt: Date;
}

export interface Evidence {
  id: string; title: string;
  type: string; caseId: string;
  uploadedAt: Date;
}

export interface WorkflowContext {
  caseId?: string; userId: string;
  currentStep: string; progress: number;
  errors: string[]; data: { [key: string]: any };
}

export interface UserWorkflowContext extends WorkflowContext {
  user?: User;
  activeCase?: LegalCase;
  activeEvidence?: Evidence; workflow: {
    id?: string; type: 'case_creation' | 'evidence_processing' | 'document_review' | 'collaboration' | 'case_closure';
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'error';
    steps: string[]; currentStepIndex: number;
    totalSteps: number;
    startedAt?: Date;
    completedAt?: Date;
  };
  collaborators: User[]; notifications: Array<any>;
  preferences: {, autoSave: boolean;
    notifications: boolean; collaborationMode: 'real-time' | 'async';
  };
}

export type UserWorkflowEvent =
  | { type: 'LOGIN'; user: User }
  | { type: 'LOGOUT' }
  | { type: 'START_WORKFLOW'; workflowType: 'case_creation' | 'evidence_processing' | 'document_review' | 'collaboration' | 'case_closure'; data?: any }
  | { type: 'NEXT_STEP'; data?: any }
  | { type: 'PREVIOUS_STEP' }
  | { type: 'COMPLETE_STEP'; stepData: any }
  | { type: 'CANCEL_WORKFLOW' }
  | { type: 'COMPLETE_WORKFLOW' }
  | { type: 'SET_ACTIVE_CASE'; case: LegalCase }
  | { type: 'SET_ACTIVE_EVIDENCE'; evidence: Evidence }
  | { type: 'ADD_COLLABORATOR'; collaborator: User }
  | { type: 'REMOVE_COLLABORATOR'; userId: string }
  | { type: 'ADD_NOTIFICATION'; notification: { type: 'info' | 'warning' | 'error' | 'success'; message: string } }
  | { type: 'MARK_NOTIFICATION_READ'; notificationId: string }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'UPDATE_PREFERENCES'; preferences: Partial<UserWorkflowContext['preferences']> }
  | { type: 'ERROR'; error: string }
  | { type: 'RETRY' }
  | { type: 'RESET' };

export const userWorkflowMachine = createMachine({
  id: 'userWorkflow',
  types: {} as {
    context: UserWorkflowContext; events: UserWorkflowEvent;
  },
  initial: 'idle',
  context: {, userId: '',
    currentStep: 'idle',
    progress: 0,
    errors: [],
    data: {},
    workflow: {, type: 'case_creation',
      status: 'pending',
      steps: [],
      currentStepIndex: 0,
      totalSteps: 0
    },
    collaborators: [],
    notifications: [],
    preferences: {, autoSave: true,
      notifications: true,
      collaborationMode: 'real-time'
    }
  },
  states: {, idle: {
      on: {, LOGIN: {
          target: 'authenticated',
          actions: assign({, user: ({ event }) => event.user,
            userId: ({ event }) => event.user.id
          })
        }
      }
    },
    authenticated: {, initial: 'ready',
      entry: assign({, currentStep: 'authenticated'
      }),
      states: {, ready: {
          on: {, START_WORKFLOW: {
              target: 'workflowActive',
              actions: assign({, workflow: ({ event, context }) => ({
                  ...context.workflow,
                  id: `workflow_${Date.now()}`,
                  type: event.workflowType,
                  status: 'in_progress',
                  steps: getWorkflowSteps(event.workflowType),
                  currentStepIndex: 0,
                  totalSteps: getWorkflowSteps(event.workflowType).length,
                  startedAt: new Date()
                }),
                currentStep: 'workflow_started',
                progress: 0,
                data: ({ event }) => event.data || {}
              })
            },
            SET_ACTIVE_CASE: {, actions: assign({
                activeCase: ({ event }) => event.case,
                caseId: ({ event }) => event.case.id
              })
            },
            SET_ACTIVE_EVIDENCE: {, actions: assign({
                activeEvidence: ({ event }) => event.evidence
              })
            },
            ADD_COLLABORATOR: {, actions: assign({
                collaborators: ({ context, event }) => {
                  const exists = context.collaborators.some((c: any) => c.id === event.collaborator.id);
                  return exists ? context.collaborators : [...context.collaborators, event.collaborator];
                }
              })
            },
            REMOVE_COLLABORATOR: {, actions: assign({
                collaborators: ({ context, event }) => context.collaborators.filter((c: any) => c.id !== event.userId)
              })
            }
          }
        },
        workflowActive: {, initial: 'executingStep',
          entry: assign({, currentStep: ({ context }) => context.workflow.steps[context.workflow.currentStepIndex] || 'unknown'
          }),
          states: {, executingStep: {
              on: {, COMPLETE_STEP: {
                  target: 'stepCompleted',
                  actions: assign({, data: ({ context, event }) => ({ ...context.data, ...event.stepData }),
                    progress: ({ context }) => Math.round((context.workflow.currentStepIndex + 1) / context.workflow.totalSteps * 100)
                  })
                },
                ERROR: {, target: 'stepError',
                  actions: assign({, errors: ({ context, event }) => [...context.errors, event.error]
                  })
                }
              }
            },
            stepCompleted: {, always: [
                {
                  target: '#userWorkflow.authenticated.workflowCompleted',
                  guard: ({ context }) => context.workflow.currentStepIndex >= context.workflow.totalSteps - 1,
                  actions: assign({, workflow: ({ context }) => ({
                      ...context.workflow,
                      status: 'completed' as const,
                      completedAt: new Date()
                    }),
                    progress: 100,
                    currentStep: 'workflow_completed'
                  })
                },
                {
                  target: 'executingStep',
                  actions: assign({, workflow: ({ context }) => ({
                      ...context.workflow,
                      currentStepIndex: context.workflow.currentStepIndex + 1
                    }),
                    currentStep: ({ context }) => {
                      const nextIndex = context.workflow.currentStepIndex + 1;
                      return context.workflow.steps[nextIndex] || 'unknown';
                    }
                  })
                }
              ]
            },
            stepError: {, on: {
                RETRY: {, target: 'executingStep',
                  actions: assign({, errors: []
                  })
                },
                NEXT_STEP: {, target: 'executingStep',
                  actions: assign({, workflow: ({ context }) => ({
                      ...context.workflow,
                      currentStepIndex: Math.min(context.workflow.currentStepIndex + 1, context.workflow.totalSteps - 1)
                    }),
                    errors: [],
                    currentStep: ({ context }) => {
                      const nextIndex = Math.min(context.workflow.currentStepIndex + 1, context.workflow.totalSteps - 1);
                      return context.workflow.steps[nextIndex] || 'unknown';
                    }
                  })
                },
                PREVIOUS_STEP: {, target: 'executingStep',
                  guard: ({ context }) => context.workflow.currentStepIndex > 0,
                  actions: assign({, workflow: ({ context }) => ({
                      ...context.workflow,
                      currentStepIndex: Math.max(context.workflow.currentStepIndex - 1, 0)
                    }),
                    errors: [],
                    currentStep: ({ context }) => {
                      const prevIndex = Math.max(context.workflow.currentStepIndex - 1, 0);
                      return context.workflow.steps[prevIndex] || 'unknown';
                    }
                  })
                }
              }
            }
          },
          on: {, CANCEL_WORKFLOW: {
              target: 'workflowCancelled',
              actions: assign({, workflow: ({ context }) => ({
                  ...context.workflow,
                  status: 'cancelled' as const
                }),
                currentStep: 'workflow_cancelled'
              })
            }
          }
        },
        workflowCompleted: {, on: {
            START_WORKFLOW: {, target: 'workflowActive',
              actions: assign({, workflow: ({ event, context }) => ({
                  ...context.workflow,
                  id: `workflow_${Date.now()}`,
                  type: event.workflowType,
                  status: 'in_progress',
                  steps: getWorkflowSteps(event.workflowType),
                  currentStepIndex: 0,
                  totalSteps: getWorkflowSteps(event.workflowType).length,
                  startedAt: new Date(),
                  completedAt: undefined
                }),
                currentStep: 'workflow_started',
                progress: 0,
                errors: [],
                data: ({ event }) => event.data || {}
              })
            },
            RESET: {, target: 'ready',
              actions: assign({, workflow: ({ context }) => ({
                  ...context.workflow,
                  status: 'pending' as const,
                  currentStepIndex: 0,
                  startedAt: undefined,
                  completedAt: undefined
                }),
                currentStep: 'ready',
                progress: 0,
                errors: [],
                data: {}
              })
            }
          }
        },
        workflowCancelled: {, on: {
            START_WORKFLOW: {, target: 'workflowActive',
              actions: assign({, workflow: ({ event, context }) => ({
                  ...context.workflow,
                  id: `workflow_${Date.now()}`,
                  type: event.workflowType,
                  status: 'in_progress',
                  steps: getWorkflowSteps(event.workflowType),
                  currentStepIndex: 0,
                  totalSteps: getWorkflowSteps(event.workflowType).length,
                  startedAt: new Date(),
                  completedAt: undefined
                }),
                currentStep: 'workflow_started',
                progress: 0,
                errors: [],
                data: ({ event }) => event.data || {}
              })
            },
            RESET: {, target: 'ready',
              actions: assign({, workflow: ({ context }) => ({
                  ...context.workflow,
                  status: 'pending' as const,
                  currentStepIndex: 0,
                  startedAt: undefined,
                  completedAt: undefined
                }),
                currentStep: 'ready',
                progress: 0,
                errors: [],
                data: {}
              })
            }
          }
        }
      },
      on: {, ADD_NOTIFICATION: {
          actions: assign({, notifications: ({ context, event }) => [
              ...context.notifications,
              {
                id: `notification_${Date.now()}`,
                type: event.notification.type,
                message: event.notification.message,
                timestamp: new Date(),
                read: false
              }
            ]
          })
        },
        MARK_NOTIFICATION_READ: {, actions: assign({
            notifications: ({ context, event }) => context.notifications.map((n: any) => n.id === event.notificationId ? { ...n, read: true } : n)
          })
        },
        CLEAR_NOTIFICATIONS: {, actions: assign({
            notifications: []
          })
        },
        UPDATE_PREFERENCES: {, actions: assign({
            preferences: ({ context, event }) => ({
              ...context.preferences,
              ...event.preferences
            })
          })
        },
        LOGOUT: {, target: 'idle',
          actions: assign({, user: undefined,
            userId: '',
            activeCase: undefined,
            activeEvidence: undefined,
            workflow: {, type: 'case_creation' as const,
              status: 'pending' as const,
              steps: [],
              currentStepIndex: 0,
              totalSteps: 0
            },
            collaborators: [],
            notifications: [],
            currentStep: 'idle',
            progress: 0,
            errors: [],
            data: {}
          })
        }
      }
    }
  }
});

// Workflow step definitions
function getWorkflowSteps(workflowType: UserWorkflowContext['workflow']['type']): string[] {
  const workflowSteps = {
    case_creation: [
      'gather_case_information',
      'create_case_record',
      'assign_team_members',
      'setup_initial_documents',
      'case_created'
    ],
    evidence_processing: [
      'upload_evidence',
      'extract_metadata',
      'ai_analysis',
      'legal_review',
      'evidence_processed'
    ],
    document_review: [
      'select_documents',
      'ai_preprocessing',
      'legal_analysis',
      'risk_assessment',
      'review_completed'
    ],
    collaboration: [
      'invite_collaborators',
      'setup_permissions',
      'share_documents',
      'enable_real_time_sync',
      'collaboration_active'
    ],
    case_closure: [
      'finalize_documents',
      'archive_evidence',
      'generate_reports',
      'close_case_record',
      'case_closed'
    ]
  };
  return workflowSteps[workflowType] || ['unknown_workflow'];
}

export type UserWorkflowMachine = typeof userWorkflowMachine;
export type UserWorkflowActor = ActorRefFrom<UserWorkflowMachine>;

// Utility functions
export function createUserWorkflowActor() {
  return userWorkflowMachine;
}

export function isWorkflowActive(state: any): boolean {
  return state?.matches('authenticated.workflowActive');
}

export function isWorkflowCompleted(state: any): boolean {
  return state?.matches('authenticated.workflowCompleted');
}

export function getCurrentWorkflowStep(context: UserWorkflowContext): string {
  return context.workflow.steps[context.workflow.currentStepIndex] || 'unknown';
}

export function getWorkflowProgress(context: UserWorkflowContext): number {
  return context.progress;
}

export function getUnreadNotifications(context: UserWorkflowContext): number {
  return context.notifications.filter((n: any) => !n.read).length;
}

export function hasActiveCollaborators(context: UserWorkflowContext): boolean {
  return context.collaborators.length > 0;
}

export function canProceedToNextStep(context: UserWorkflowContext): boolean {
  return context.workflow.currentStepIndex < context.workflow.totalSteps - 1;
}

export function canGoToPreviousStep(context: UserWorkflowContext): boolean {
  return context.workflow.currentStepIndex > 0;
}







