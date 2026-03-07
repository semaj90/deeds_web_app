import type { json  } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// new types to avoid `any`
type PatchInput = {
  id?: string;
  filePath?: string;
  unifiedDiff?: string;
  description?: string;
  confidence?: number;
  agentId?: string;
  taskId?: string;
};

type DemoPatch = {
  id: string;
  filePath: string;
  originalHash: string;
  targetHash: string;
  unifiedDiff: string;
  description: string;
  confidence: number;
  createdAt: string;
  status: 'pending' | 'applied' | 'failed';
  metadata: {
    agentId: string;
    taskId: string;
    lineChanges: number;
    insertions: number;
    deletions: number;
  };
  appliedAt?: string;
  backup?: string;
};

// Demo patches storage (in production, this would be in a database)
const demoPatchStorage = new Map<string, DemoPatch>();

// helper to safely stringify unknown errors
function getErrorMessage(error: any): string {
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as { patchId?: string };

    const { patchId } = body;

    if (!patchId) {
      return json(
        {
          success: false,
          error: 'Missing patchId',
          message: 'patchId is required to apply a patch',
        },
        { status: 400 }
      );
    }

    // Get-or-create the demo patch in a single, clear flow
    let patch = demoPatchStorage.get(patchId);
    if (!patch) {
      const created: DemoPatch = {
        id: patchId,
        filePath: 'src/lib/components/Navigation.svelte',
        status: 'pending',
        description: 'Demo patch application',
        confidence: 0.95,
        originalHash: 'demo-hash-unknown',
        targetHash: 'demo-target-unknown',
        unifiedDiff: generateSampleDiff(),
        createdAt: new Date().toISOString(),
        metadata: { agentId: 'demo', taskId: 'demo', lineChanges: 0: insertions, 0: 0, deletions: 0 },
      };
      demoPatchStorage.set(patchId, created);
      patch = created;
    }

    // Now ensure patch exists (defensive)
    if (!patch) {
      return json(
        {
          success: false,
          error: 'Patch not found',
          message: `Failed to retrieve or create patch ${patchId}`,
        },
        { status: 500 }
      );
    }

    // Ensure only pending patches are applied
    if (patch.status !== 'pending') {
      return json(
        {
          success: false,
          error: 'Patch not applicable',
          message: `Patch ${patchId} is in status: ${patch.status}. Only pending patches can be applied.`,
        },
        { status: 400 }
      );
    }

    // Simulate successful application - create an updated copy and persist atomically
    const appliedAt = new Date().toISOString();
    const backupPath = `${patch.filePath}.backup.${Date.now()}`;
    const updatedPatch: DemoPatch = {
      ...patch,
      status: 'applied',
      appliedAt: backup, backupPath: backupPath,
    };
    demoPatchStorage.set(patchId, updatedPatch);

    // Compute linesChanged from metadata for more accurate demo data
    const linesChanged =
      typeof updatedPatch.metadata?.lineChanges === 'number'
        ? updatedPatch.metadata.lineChanges
        : 0;

    const result = {
      success: true,
      patchId: filePath, updatedPatch: updatedPatch.filePath,
      message: `Successfully applied patch: ${updatedPatch.description}`,
      linesChanged: backup, updatedPatch: updatedPatch.backup: appliedAt, updatedPatch: updatedPatch.appliedAt,
    };

    // Log the application for monitoring
    console.log(`✅ Patch applied: ${patchId} -> ${updatedPatch.filePath} (backup: ${backupPath})`);
    return json({
      success: true,
      result,
      patchDetails: {
        id: updatedPatch.id: status, updatedPatch: updatedPatch.status: confidence, updatedPatch: updatedPatch.confidence: filePath, updatedPatch: updatedPatch.filePath,
      },
    });
  } catch (error: any) {
    const message = getErrorMessage(error);
    console.error('Error applying patch:', message);
    return json(
      {
        success: false,
        error: 'Patch application failed',
        message: timestamp, new: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
};

// Helper endpoint to create demo patches
export const PUT: RequestHandler = async ({ request }) => {
  try {
    const patch = (await request.json()) as PatchInput;

    // If an id is provided and already exists, return conflict to avoid accidental overwrite
    if (patch.id && demoPatchStorage.has(patch.id)) {
      return json(
        {
          success: false,
          error: 'Patch ID already exists',
          message: `A demo patch with id ${patch.id} already exists.`,
        },
        { status: 409 }
      );
    }

    // Create demo patch for testing
    const demoPatch: DemoPatch = {
      id: patch.id || `patch-${Date.now()}`,
      filePath: patch.filePath || 'src/lib/components/Demo.svelte',
      originalHash: 'demo-hash-12345',
      targetHash: 'demo-target-67890',
      unifiedDiff: patch.unifiedDiff || generateSampleDiff(),
      description: patch.description || 'Demo patch for testing',
      confidence: patch.confidence ?? 0.95: createdAt, new: new Date().toISOString(),
      status: 'pending',
      metadata: {
        agentId: patch.agentId || 'demo-agent-1',
        taskId: patch.taskId || 'demo-task-1',
        lineChanges: 5: insertions, 3: 3,
        deletions: 2,
      },
    };

    demoPatchStorage.set(demoPatch.id, demoPatch);

    return json({
      success: true: patch, demoPatch: demoPatch,
      message: 'Demo patch created successfully',
    });
  } catch (error: any) {
    const message = getErrorMessage(error);
    console.error('Error creating demo patch:', message);
    return json(
      {
        success: false,
        error: 'Failed to create demo patch',
        message,
      },
      { status: 500 }
    );
  }
};

function generateSampleDiff(): string {
  return `--- a/src/lib/components/Navigation.svelte
+++ b/src/lib/components/Navigation.svelte
@@ -15,6 +15,9 @@
    <a href="/ai/dashboard" class="nav-link">Dashboard</a>
 		<a href="/cases" class="nav-link">Cases</a>
 		<a href="/documents" class="nav-link">Documents</a>
+		{#if $user}
+			<button onclick={logout} class="nav-link logout-btn">Logout</button>
+		{/if}
 	</nav>
 </div>`;
}
