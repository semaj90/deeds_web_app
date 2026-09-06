import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { runOrnithSynthesisNodeV1 } from './ornith-synthesis-node.js';

export interface OrnithSynthesisTurnV1 {
  prompt_plan: unknown;
  prompt_segment_content: unknown[];
}

export interface OrnithSynthesisGraphOptionsV1 {
  turns: OrnithSynthesisTurnV1[];
  baseUrl?: string;
  expectedModel?: string;
  fetchImpl?: typeof fetch;
}

export const OrnithSynthesisGraphStateV1 = Annotation.Root({
  turn: Annotation({ value: (x: number = 0, y?: number) => y ?? x }),
  syntheses: Annotation({ value: (x: string[] = [], y: string[] = []) => [...(x ?? []), ...(y ?? [])] }),
  error: Annotation({ value: (x?: string, y?: string) => y ?? x }),
});

export type OrnithSynthesisGraphStateTypeV1 = typeof OrnithSynthesisGraphStateV1.State;

/**
 * Builds an execution-only LangGraph for a bounded sequence of compiled
 * PromptPlan turns. The graph owns loop control only; PromptPlan validation,
 * model resolution, and generation remain owned by the shared Ornith adapter.
 */
export function buildBoundedOrnithSynthesisGraphV1(
  options: OrnithSynthesisGraphOptionsV1,
) {
  if (options.turns.length === 0) {
    throw new Error('ORNITH_SYNTHESIS_GRAPH_REQUIRES_TURN');
  }

  const graph = new StateGraph(OrnithSynthesisGraphStateV1)
    .addNode('ornith_synthesis_turn', async (state: OrnithSynthesisGraphStateTypeV1) => {
      const turn = state.turn ?? 0;
      const input = options.turns[turn];
      if (!input) {
        return { error: `ORNITH_SYNTHESIS_GRAPH_TURN_OUT_OF_RANGE:${turn}` };
      }

      const result = await runOrnithSynthesisNodeV1({
        prompt_plan: input.prompt_plan,
        prompt_segment_content: input.prompt_segment_content,
        step: turn,
        baseUrl: options.baseUrl,
        expectedModel: options.expectedModel,
        fetchImpl: options.fetchImpl,
      });

      return {
        turn: turn + 1,
        syntheses: result.synthesis ? [result.synthesis] : [],
        error: result.error,
      };
    })
    .addEdge(START, 'ornith_synthesis_turn')
    .addConditionalEdges('ornith_synthesis_turn', (state: OrnithSynthesisGraphStateTypeV1) => {
      if (state.error || (state.turn ?? 0) >= options.turns.length) return 'done';
      return 'continue';
    }, {
      continue: 'ornith_synthesis_turn',
      done: END,
    });

  return graph.compile();
}
