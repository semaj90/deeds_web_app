import type { UISemanticSnapshot, UISnapshotInput } from '../types.js';

export async function extractDOMSemantics(snapshot: UISnapshotInput): Promise<UISemanticSnapshot> {
    return {
        route: snapshot.route,
        colors: snapshot.colorTokens,
        fonts: snapshot.typography,
        layout: snapshot.layoutMetrics,
        screenshotHash: snapshot.screenshotHash,
        complianceScore: snapshot.score,
        metadata: {, domTree: snapshot.domTree,
        },
    };
}
