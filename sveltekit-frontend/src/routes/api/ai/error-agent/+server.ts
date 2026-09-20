import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runWorkflowLoopLangGraph } from '$lib/server/ai/error-agent/workflow-loop-langgraph.js';
import { dispatchPlanOnlyRepairRequest } from '$lib/server/ai/error-agent/repair-dispatch.js';
import { buildErrorAgentRepairRequestV1 } from '$lib/server/ai/error-agent/repair-request.js';
import { publishToQueue } from '$lib/server/rabbitmq.js';
import {
  failureFingerprint,
  readOpenSpecControllerReport,
  reconcileOpenSpecSelection,
  retrySuppressed,
  runAllowlistedSmokeProfile,
  selectOpenSpecTask,
} from '$lib/server/ai/error-agent/openspec-controller.js';
import { z } from 'zod';

const errorAgentInputSchema = z.object({
  runId: z.string().optional(),
  query: z.string().min(1),
  hmmErrorClass: z.enum([
    'meta_hygiene',
    'stale_migration',
    'schema_mismatch',
    'vector_infra_missing',
    'env_url_mismatch',
    'route_contract_mismatch',
    'api_validation_gap',
    'ssr_safety_violation',
    'unknown'
  ]),
  caseId: z.string().optional(),
  userId: z.string().optional(),
  targetPath: z.string().optional(),
  workspaceRevision: z.string().optional(),
  modelRevision: z.string().optional(),
  sourceRefs: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  taskKey: z.string().optional(),
  completionEnvelopeRevision: z.string().optional(),
  threadId: z.string().optional(),
  controllerReportChecksum: z.string().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  const devBypass = process.env.NODE_ENV !== 'production' && process.env.ERROR_AGENT_DEV_BYPASS === 'true';
  if (!locals.user?.id && !devBypass) {
    return json({
      ok: false,
      result: null,
      selection: null,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required.' },
    }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validated = errorAgentInputSchema.parse(body);

    if (locals.user?.id && validated.userId && String(locals.user.id) !== validated.userId) {
      return json({
        ok: false,
        result: null,
        selection: null,
        error: { code: 'USER_ID_MISMATCH', message: 'The requested user does not match the authenticated session.' },
      }, { status: 403 });
    }

    const controller = readOpenSpecControllerReport();
    const selection = selectOpenSpecTask(controller, {
      taskKey: validated.taskKey,
      controllerReportChecksum: validated.controllerReportChecksum,
      completionEnvelopeRevision: validated.completionEnvelopeRevision,
    });
    const repairRequest = selection.repairRequest
      ? buildErrorAgentRepairRequestV1(selection, {
          requestId: selection.repairRequest.requestId,
          workflowInput: {
            query: validated.query,
            hmmErrorClass: validated.hmmErrorClass,
            caseId: validated.caseId,
            targetPath: validated.targetPath,
            workspaceRevision: validated.workspaceRevision,
            modelRevision: validated.modelRevision,
            sourceRefs: validated.sourceRefs,
            threadId: validated.threadId,
          },
        })
      : null;
    const governedSelection = repairRequest
      ? { ...selection, repairRequest }
      : selection;
    const workerQueueEnabled = process.env.ERROR_AGENT_WORKER_QUEUE_ENABLED === 'true';
    const dispatch = repairRequest
      ? await dispatchPlanOnlyRepairRequest(repairRequest, {
          enabled: workerQueueEnabled,
          ...(workerQueueEnabled
            ? { publisher: { publish: publishToQueue } }
            : {}),
        })
      : null;

    const metadata = validated.metadata ?? {};
    const currentFailureFingerprint = failureFingerprint({
      taskKey: governedSelection.taskKey,
      gate: governedSelection.change,
      blocker: governedSelection.blockerKey ?? 'NONE',
      controllerReportChecksum: governedSelection.controllerReportChecksum,
      workspaceRevision: validated.workspaceRevision,
      sourceRevision: typeof metadata.sourceRevision === 'string' ? metadata.sourceRevision : undefined,
      evidenceChecksum: governedSelection.evidenceHash,
    });
    const previousFingerprint = typeof metadata.previousFailureFingerprint === 'string'
      ? metadata.previousFailureFingerprint
      : undefined;
    if (retrySuppressed(previousFingerprint, currentFailureFingerprint)) {
      return json({
        ok: false,
        result: null,
        selection: governedSelection,
        dispatch,
        error: { code: 'RETRY_SUPPRESSED', message: 'The same blocker fingerprint has already been observed with unchanged evidence.' },
        failureFingerprint: currentFailureFingerprint,
      }, { status: 409 });
    }

    const result = await runWorkflowLoopLangGraph({
      ...validated,
      userId: locals.user?.id ? String(locals.user.id) : (validated.userId ?? 'dev-error-agent'),
      selection: governedSelection,
      planOnly: true,
    }, {
      smoke: async () => {
        const smoke = await runAllowlistedSmokeProfile(selection.smokeProfile, { change: selection.change });
        return {
          passed: smoke.passed,
          command: smoke.command,
          outputSummary: smoke.outputSummary,
        };
      },
      log: async () => undefined,
    });

    const refreshedController = readOpenSpecControllerReport();
    const reconciliationStatus = reconcileOpenSpecSelection(selection, refreshedController, result.smoke.passed);
    const gan = {
      created: result.gan?.created ?? true,
      wired: true,
      proven: Boolean(result.gan?.proven) && reconciliationStatus === 'PROVEN_CURRENT',
      done: Boolean(result.gan?.proven) && reconciliationStatus === 'PROVEN_CURRENT',
      proofRefs: result.gan?.proofRefs ?? [],
      promotionAuthorized: false as const,
    };

    return json({
      ok: true,
      result: {
        ...result,
        openspec: { selection: governedSelection, dispatch, reconciliationStatus, failureFingerprint: currentFailureFingerprint },
        gan,
      },
      selection: governedSelection,
      dispatch,
      reconciliationStatus,
      failureFingerprint: currentFailureFingerprint,
    });
  } catch (err: any) {
    console.error('[ErrorAgent API] Error:', err);
    const message = err instanceof Error ? err.message : 'Error-agent request failed.';
    const status = /OPENSPEC_(NO_ACTIONABLE_TASK|TASK_NOT_ACTIONABLE|CONTROLLER_REPORT_STALE|CHANGE_NAME_INVALID|COMPLETION_ENVELOPE_BLOCKED|COMPLETION_ENVELOPE_STALE|COMPLETION_SCOPE_UNSAFE|COMPLETION_ENVELOPE_INVALID|COMPLETION_ENVELOPE_MISSING)/.test(message) ? 409 : 500;
    return json({ ok: false, result: null, selection: null, error: { code: message, message } }, { status });
  }
};
