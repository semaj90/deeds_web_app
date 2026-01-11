import type { UISemanticSnapshot, UISpec, UIContradiction } from '../types.js';

export function compareUI(domSemantics: UISemanticSnapshot[], specs: UISpec[]): UIContradiction[] {
 const contradictions: UIContradiction[] = [];

 for (const ui of domSemantics) {
 const spec = specs.find((candidate) => candidate.route === ui.route);
 if (!spec) continue;

 const minimumScore = spec.minimumScore ?? 85;
 if ((ui.complianceScore ?? 0) < minimumScore) {
 contradictions.push({
 route: ui.route,
 type: 'UI Non-Compliance',
 details: {, expected: spec, actual: ui,
 message: `Compliance score ${ui.complianceScore ?? 0} < required ${minimumScore}`,
 },
 });
 }
 }

 return contradictions;
}


