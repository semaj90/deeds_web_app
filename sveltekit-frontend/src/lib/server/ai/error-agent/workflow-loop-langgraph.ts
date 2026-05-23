import { END, START, Annotation, StateGraph } from '@langchain/langgraph';

import {
  classifyWorkflowInput,
  runWorkflowLoop,
  type WorkflowClassification,
  type WorkflowLoopDeps,
  type WorkflowLoopInput,
  type WorkflowLoopResult,
  type WorkflowRepairResult,
  type WorkflowSmokeResult,
} from './workflow-loop.js';

const WorkflowLoopState = Annotation.Root({
  input: Annotation<WorkflowLoopInput>(),
  classification: Annotation<WorkflowClassification | null>(),
  repair: Annotation<WorkflowRepairResult | null>(),
  smoke: Annotation<WorkflowSmokeResult | null>(),
  result: Annotation<WorkflowLoopResult | null>(),
});

type WorkflowLoopStateType = typeof WorkflowLoopState.State;

function buildWorkflowLoopGraph(deps: WorkflowLoopDeps = {}) {
  return new StateGraph(WorkflowLoopState)
    .addNode('step_classify', async (state: WorkflowLoopStateType) => {
      const classification = classifyWorkflowInput(state.input);
      return { classification };
    })
    .addNode('step_repair', async (state: WorkflowLoopStateType) => {
      if (!state.classification) {
        throw new Error('workflow-loop-langgraph: classify node must run before repair.');
      }
      if (deps.repair) {
        return {
          repair: await deps.repair(state.input, state.classification),
        };
      }
      const defaultResult = await runWorkflowLoop(state.input, {
        ...deps,
        smoke: async () => ({ passed: true, command: 'noop', outputSummary: 'noop' }),
        log: async () => undefined,
      });
      return { repair: defaultResult.repair };
    })
    .addNode('step_smoke', async (state: WorkflowLoopStateType) => {
      if (!state.classification || !state.repair) {
        throw new Error('workflow-loop-langgraph: repair node must run before smoke.');
      }
      if (deps.smoke) {
        return {
          smoke: await deps.smoke(state.input, state.classification, state.repair),
        };
      }
      const defaultResult = await runWorkflowLoop(state.input, {
        ...deps,
        repair: async () => state.repair as WorkflowRepairResult,
        log: async () => undefined,
      });
      return { smoke: defaultResult.smoke };
    })
    .addNode('step_log', async (state: WorkflowLoopStateType) => {
      if (!state.classification || !state.repair || !state.smoke) {
        throw new Error('workflow-loop-langgraph: smoke node must run before log.');
      }
      const result = await runWorkflowLoop(state.input, {
        ...deps,
        repair: async () => state.repair as WorkflowRepairResult,
        smoke: async () => state.smoke as WorkflowSmokeResult,
      });
      return { result };
    })
    .addEdge(START, 'step_classify')
    .addEdge('step_classify', 'step_repair')
    .addEdge('step_repair', 'step_smoke')
    .addEdge('step_smoke', 'step_log')
    .addEdge('step_log', END)
    .compile();
}

export async function runWorkflowLoopLangGraph(
  input: WorkflowLoopInput,
  deps: WorkflowLoopDeps = {},
): Promise<WorkflowLoopResult> {
  const graph = buildWorkflowLoopGraph(deps);
  const finalState = await graph.invoke({
    input,
    classification: null,
    repair: null,
    smoke: null,
    result: null,
  });

  if (!finalState.result) {
    throw new Error('workflow-loop-langgraph: graph completed without result payload.');
  }

  return finalState.result;
}
