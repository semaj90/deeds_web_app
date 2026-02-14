// src/lib/stores/machineStores.ts
import { browser } from '$app/environment';
import { crewAIOrchestrationMachine } from '$lib/state/crewAIOrchestrationMachine';
import { useMachine } from '$lib/utils/xstate-svelte-adapter';

/**
 * CrewAI Orchestration Store
 * Multi-agent AI workflow orchestration with full state management
 */
export function createCrewAIOrchestrationStore() {
    // Only run on client
    if (!browser) {
        return {
            state$: { subscribe: () => {} },
            send: () => {},
            isOrchestrating$: { subscribe: () => {} },
            isCompleted$: { subscribe: () => {} },
            isFailed$: { subscribe: () => {} },
            activeAgents$: { subscribe: () => {} },
            agentResponses$: { subscribe: () => {} },
            recommendations$: { subscribe: () => {} },
            qualityScore$: { subscribe: () => {} },
            orchestrationError$: { subscribe: () => {} },
            retryCount$: { subscribe: () => {} },
            processingTime$: { subscribe: () => {} },
            failedAgents$: { subscribe: () => {} },
            userIntent$: { subscribe: () => {} },
            startReview: () => {},
            acceptRecommendation: () => {},
            cancelReview: () => {},
            retryReview: () => {},
            reset: () => {},
            userActivity: () => {},
            userIdle: () => {}
        };
    }

    const { state$, send } = useMachine(crewAIOrchestrationMachine);

    // Core state subscribers
    const isOrchestrating$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.matches('reviewing') || s.matches('synthesizing'))) };
    const isCompleted$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.matches('completed'))) };
    const isFailed$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.matches('failed'))) };

    // Context subscribers
    const activeAgents$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.context.activeAgents)) };
    const agentResponses$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.context.agentResponses)) };
    const recommendations$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.context.currentRecommendations)) };
    const qualityScore$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.context.qualityScore)) };
    const orchestrationError$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.context.lastError)) };
    const retryCount$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.context.retryCount)) };
    const processingTime$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.context.processingTime)) };
    const failedAgents$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.context.failedAgents)) };
    const userIntent$ = { subscribe: (run: any) => state$.subscribe((s: any) => run(s.context.userIntent)) };

    return {
        state$,
        send,
        // State subscribers
        isOrchestrating$,
        isCompleted$,
        isFailed$,
        // Context subscribers
        activeAgents$,
        agentResponses$,
        recommendations$,
        failedAgents$,
        qualityScore$,
        processingTime$,
        orchestrationError$,
        retryCount$,
        userIntent$,
        // Actions
        startReview: (task: any) => send({ type: 'START_REVIEW', task }),
        acceptRecommendation: (recommendationId: string) => send({ type: 'ACCEPT_RECOMMENDATION', recommendationId }),
        retryReview: () => send({ type: 'RETRY' }),
        cancelReview: () => send({ type: 'CANCEL' }),
        reset: () => send({ type: 'RESET' }),
        userActivity: (activity: string) => send({ type: 'USER_ACTIVITY', activity }),
        userIdle: () => send({ type: 'USER_IDLE' })
    };
}
