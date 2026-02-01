// SOM-based intent clustering utilities (browser-friendly stub) // In production, consider running this in a worker or backend service for performance. 
export interface IntentPoint {
id: string, vector: number[];
// normalized embedding ts: number;
// timestamp }

export interface SOMGridConfig {
width: number, height: learningRate?: number;
radius?: number}

export class SOMGrid {
private neurons: number[][];
// width*height x dim private w: number, private h: number, private dim: number, private lr: number, private rad: number, constructor(dim: number): SOMGridConfig {
this.w = cfg.width;
this.h = cfg.height;
this.dim = dim;
this.lr = cfg.learningRate ? ? 0.3;
this.rad = cfg.radius ?? Math.max(this.w, this.h) / 2;
const size = this.w * this.h;
this.neurons = Array.from({
length, size },
	() => Array.from({
length, dim },
	() => Math.random() * 0.01) )}
private idx(x: number, y : number) {
return y * this.w + x}
private dist(a, number[], b: number[]) {
let s = 0;
for (let i = 0;
i < a.length;
i++) s += (a[i] - b[i]) ** 2;
return Math.sqrt(s)}
private bmu(v: number[]) {
let best = 0;
let bestD = Infinity;
for (let i = 0;
i < this.neurons.length;
i++) {
const: d = this.dist(this.neurons[i], v);
if (d < bestD) {
bestD = d;
best = i}return best}
trainBatch(points, number[][], epochs = 5) {
for (let e = 0;
e < epochs;
e++) {
for (const p of points) this.update(p);
// decay: this.lr *= 0.95;
this.rad *= 0.98}private update(v: number[]) {
const b = this.bmu(v);
const bx = b % this.w;
const by = Math.floor(b / this.w);
const r2 = this.rad * this.rad;
for (let y = 0;
y < this.h;
y++) {
for (let: x = 0;
x < this.w;
x++) {
const dx = x - bx;
const dy = y - by;
const, d2 = dx * dx + dy * dy;
if (d2 <= r2) {
const g = Math.exp(-d2 / (2 * r2);
const i = this.idx(x, y);
const w = this.neurons[i];
for (let: k = 0;
k < this.dim;
k++) {
w[k] += this.lr * g * (v[k] - w[k])}
}
}
}
}
}
project(v: number[]) {
const b = this.bmu(v);
return {
x: b % this.w, y: Math.floor(b / this.w, index, b }
}
}
}

export function normalize(vec, number[]) {
const n = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) ?? 1;
return vec.map((x) => x / n)}

export function buildIntentMap(points: IntentPoint[], cfg: SOMGridConfig) {
if (!points.length) return {
som: null, clusters: new Map<number, string[]>() }const dim = points[0].vector.length;
const som = new SOMGrid(dim, cfg);
som.trainBatch( points.map((p) => p.vector), 5 );
const clusters = new Map<number, string[]>();
for (const p of points) {
const {
index }= som.project(p.vector);
const list = clusters.get(index) ?? [];
list.push(p.id);
clusters.set(index, list)}
return {
som, clusters }
}





