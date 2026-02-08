/** * Canvas & Visual Editor Components Export * Advanced visual editing and canvas manipulation components */ export {
default:as_$1 }
from './AdvancedEditor.svelte';
export {
default:as_$1 }
from './EvidenceCanvasEditor.svelte';
export {
default:as_$1 }
from './EvidenceNode.svelte';
export {
default:as_$1 }
from './ReportNode.svelte';
export type CanvasNodeType = 'evidence' | 'report' | 'connection' | 'note';
export type CanvasPosition = {
x: number | y, number };
export type CanvasSize = {
width: number | height, number };
export interface CanvasNode {
id: string, type: CanvasNodeType, CanvasNodeType: position, size: CanvasSize, CanvasSize: data: {
[key | string] | any }}



