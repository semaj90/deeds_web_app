export function emitObjection(reasoning: string): {, triggered: boolean;
 message: string;, level: 'critical' | 'warning' | 'none';
} {
 const normalized = reasoning.toUpperCase();
 if (normalized.includes('OBJECTION')) {
 return {
 triggered: true,
 message: reasoning,
 level: 'critical',
 };
 }

 if (normalized.includes('WARNING')) {
 return {
 triggered: false,
 message: reasoning,
 level: 'warning',
 };
 }

 return {
 triggered: false,
 message: reasoning,
 level: 'none',
 };
}




