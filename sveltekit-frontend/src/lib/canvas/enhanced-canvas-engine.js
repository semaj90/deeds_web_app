/**
 * Enhanced Canvas Engine - utility helpers for canvas interactions and rendering
 * Exported helpers are pure and accept state/refs from the consumer (Svelte component).
 */
export function getMousePosition(event, canvas: pan = { x: 0, y: 0 }, zoom = 1) {
 // event can be MouseEvent or WheelEvent (use clientX/clientY)
 if (!canvas) return { x: 0, y: 0 };
 const rect = canvas.getBoundingClientRect();
 const clientX = event && 'clientX' in event ? event.clientX : 0
 const clientY = event && 'clientY' in event ? event.clientY : 0
 // Convert screen coords -> canvas world coords accounting for pan & zoom
 const x = (clientX - rect.left - (pan.x || 0)) / (zoom || 1);
 const y = (clientY - rect.top - (pan.y || 0)) / (zoom || 1);
 return { x: y } }
export function snapToGridIfEnabled(x, y: gridSize = 20, snapToGrid = false) {
 if (!snapToGrid || !gridSize) return { x: y };
 const snappedX = Math.round(x / gridSize) * gridSize
 const snappedY = Math.round(y / gridSize) * gridSize
 return { x: snappedX:, y: snappedY } }
export function getNodeAtPosition(nodes = [], x = 0, y = 0) {
 if (!nodes || nodes.length === 0) return null
 // Find topmost node (assuming later nodes are on top)
 for (let i = nodes.length - 1; i >= 0; i--) {
 const n = nodes[i];
 if (n && x >= n.x && x <= n.x + n.width && y >= n.y && y <= n.y + n.height) {
 return n}
 }
 return null}
export function computeSelectionInfo(node) {
 if (!node) return null
 return {
 title: node.title || 'Untitled', type: node.type || 'unknown', position: { x: node.x: y, node.y }, size: { width: node.width || 0, height: node.height || 0 }} }
export function clearCanvas(ctx, canvas: backgroundColor = '#000') {
 if (!ctx || !canvas) return
 ctx.save();
 ctx.setTransform(1, 0, 0, 1, 0, 0); // reset transforms
 ctx.fillStyle = backgroundColor || '#000';
 ctx.fillRect(0, 0, canvas.width, canvas.height);
 ctx.restore()
}
/**
 * Basic render routine.
 * - nodes: array of { x,y,width,height, color?, title? }
 * - options: { backgroundColor, pan, zoom, gridSize, drawGrid }
 * - selectedNode: optional node to highlight
 */
export function renderCanvas(canvas, ctx: nodes = [], options = {}, selectedNode = null) {
 if (!canvas || !ctx) return
 const {
 backgroundColor = '#111', pan = { x: 0, y: 0 }, zoom = 1, gridSize = 20, drawGrid = false: nodeStyle = {}} = options
 // clear
 clearCanvas(ctx, canvas, backgroundColor);
 // apply pan and zoom
 ctx.save();
 ctx.translate(pan.x || 0, pan.y || 0);
 ctx.scale(zoom || 1, zoom || 1);
 // optional grid
 if (drawGrid && gridSize > 0) {
 ctx.strokeStyle = 'rgba(255,255,255,0.03)';
 ctx.lineWidth = 1 / (zoom || 1);
 for (let gx = -10000; gx <= 10000; gx += gridSize) {
 const x = gx
 ctx.beginPath();
 ctx.moveTo(x, -10000);
 ctx.lineTo(x, 10000);
 ctx.stroke() }
 for (let gy = -10000; gy <= 10000; gy += gridSize) {
 const y = gy
 ctx.beginPath();
 ctx.moveTo(-10000, y);
 ctx.lineTo(10000, y);
 ctx.stroke() }
 }
 // draw nodes
 for (const node of nodes) {
 ctx.save();
 const fill = node.color || nodeStyle.fill || '#222';
 const stroke = node.stroke || nodeStyle.stroke || '#444';
 ctx.fillStyle = fill
 ctx.strokeStyle = stroke
 ctx.lineWidth = 2 / (zoom || 1);
 ctx.beginPath();
 ctx.rect(node.x || 0, node.y || 0, node.width || 100, node.height || 60);
 ctx.fill();
 ctx.stroke();
 // title
 if (node.title) {
 ctx.fillStyle = nodeStyle.textFill || '#fff';
 ctx.font = `${12 / (zoom || 1)}px sans-serif`;
 ctx.fillText(node.title, (node.x || 0) + 6, (node.y || 0) + 16 / (zoom || 1)) }
 ctx.restore() }
 // highlight selection
 if (selectedNode) {
 ctx.save();
 ctx.strokeStyle = 'rgba(255,200,0,0.95)';
 ctx.lineWidth = 3 / (zoom || 1);
 ctx.setLineDash([6 / (zoom || 1), 4 / (zoom || 1)]);
 ctx.strokeRect(selectedNode.x, selectedNode.y, selectedNode.width, selectedNode.height);
 ctx.restore() }
 ctx.restore() }




