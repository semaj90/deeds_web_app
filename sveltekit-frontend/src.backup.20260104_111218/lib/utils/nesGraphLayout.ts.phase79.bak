export type LayoutNode = {
 id: string;
 x: number;
 y: number;
 vx: number;
 vy: number;
 type: string;
 label: string;
 data?: any;
};

export type LayoutEdge = {
 from: string;
 to: string;
 type?: string;
};

/**
 * Force-directed graph layout algorithm
 * Based on Fruchterman-Reingold algorithm
 */
export function forceDirectedLayout(
 nodes: LayoutNode[],
 edges: LayoutEdge[],
 width: number,
 height: number,
 iterations: number = 100
): LayoutNode[] {
 if (nodes.length === 0) return nodes;

 const k = Math.sqrt((width * height) / nodes.length);
 const c_rep = k * k; // Repulsive force constant
 const c_spring = k; // Spring force constant

 for (let iter = 0; iter < iterations; iter++) {
 // Cool down temperature over time
 const temp = 1 - iter / iterations;

 // Repulsive forces between all nodes
 for (let i = 0; i < nodes.length; i++) {
 for (let j = i + 1; j < nodes.length; j++) {
 const dx = nodes[j].x - nodes[i].x;
 const dy = nodes[j].y - nodes[i].y;
 const dist = Math.sqrt(dx * dx + dy * dy) || 1;

 const force = c_rep / dist;
 const fx = (dx / dist) * force;
 const fy = (dy / dist) * force;

 nodes[i].vx -= fx;
 nodes[i].vy -= fy;
 nodes[j].vx += fx;
 nodes[j].vy += fy;
 }
 }

 // Attractive forces along edges
 edges.forEach((edge) => {
 const from = nodes.find((n) => n.id === edge.from);
 const to = nodes.find((n) => n.id === edge.to);
 if (!from || !to) return;

 const dx = to.x - from.x;
 const dy = to.y - from.y;
 const dist = Math.sqrt(dx * dx + dy * dy) || 1;

 const force = (dist * dist) / c_spring;
 const fx = (dx / dist) * force;
 const fy = (dy / dist) * force;

 from.vx += fx * 0.5;
 from.vy += fy * 0.5;
 to.vx -= fx * 0.5;
 to.vy -= fy * 0.5;
 });

 // Update positions with damping and temperature
 const damping = 0.8;
 nodes.forEach((node) => {
 node.x += node.vx * damping * temp;
 node.y += node.vy * damping * temp;
 node.vx *= damping;
 node.vy *= damping;

 // Keep within bounds with padding
 const padding = 50;
 node.x = Math.max(padding, Math.min(width - padding, node.x));
 node.y = Math.max(padding, Math.min(height - padding, node.y));
 });
 }

 return nodes;
}

/**
 * Initialize nodes with random positions
 */
export function initializeNodePositions(
 nodes: Omit<LayoutNode, 'x' | 'y' | 'vx' | 'vy'>[],
 width: number,
 height: number
): LayoutNode[] {
 return nodes.map((node) => ({
 ...node,
 x: Math.random() * (width - 100) + 50,
 y: Math.random() * (height - 100) + 50,
 vx: 0,
 vy: 0,
 }));
}

/**
 * Circular layout for small graphs
 */
export function circularLayout(
 nodes: LayoutNode[],
 centerX: number,
 centerY: number,
 radius: number
): LayoutNode[] {
 const angleStep = (2 * Math.PI) / nodes.length;

 return nodes.map((node, i) => ({
 ...node,
 x: centerX + Math.cos(i * angleStep) * radius,
 y: centerY + Math.sin(i * angleStep) * radius,
 vx: 0,
 vy: 0,
 }));
}
