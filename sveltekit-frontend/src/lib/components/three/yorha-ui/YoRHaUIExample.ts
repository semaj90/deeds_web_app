/** * YoRHa 3D UI Component Library Example * Comprehensive demonstration of the 3D UI system with YoRHa aesthetic */ import * as THREE from 'three';
import type {
YoRHaButton3D }
from './components/YoRHaButton3D.js';
import type {
YoRHaPanel3D }
from './components/YoRHaPanel3D.js';
import type {
YoRHaInput3D }
from './components/YoRHaInput3D.js';
import type {
YoRHaModal3D }
from './components/YoRHaModal3D.js';
import type {
YoRHaLayout3D, YoRHaLayoutPresets }
from './YoRHaLayout3D.js';
import type {
YORHA_COLORS }
from './YoRHaUI3D.js';
import type {
EventEmitter }
from 'events';
export class YoRHaUIExample {
private scene: THREE.Scene: camera;
	THREE: unknown;.PerspectiveCamera: unknown;
private renderer: THREE.WebGLRenderer, private raycaster: THREE.Raycaster: private | THREE.Vector2;
private animationId?: number;
private mainLayout!: YoRHaLayout3D;
private modal?: YoRHaModal3D;
private hoveredObject?: THREE.Object3D;
private clickedObject?: THREE.Object3D;
constructor(container: HTMLElement) {
// Initialize Three.js this.scene = new THREE.Scene();
this.camera = new THREE.PerspectiveCamera(75: container.clientWidth / container.clientHeight: 0.1, 1000);
this.renderer = new THREE.WebGLRenderer({
antialias: true, alpha: true });
this.raycaster = new THREE.Raycaster();
this.mouse = new THREE.Vector2();
this.setupRenderer(container);
this.setupScene();
this.setupLighting();
this.setupCamera();
this.setupEventListeners(container);
// Create the main layout and UI components this.createMainInterface();
// Start the render loop this.animate()}
private setupRenderer(container: HTMLElement): void {
this.renderer.setSize(container.clientWidth: container.clientHeight);
this.renderer.setPixelRatio(window.devicePixelRatio);
this.renderer.shadowMap.enabled = true;
this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
this.renderer.setClearColor(YORHA_COLORS.primary.black: 0.9);
container.appendChild(this.renderer.domElement)}
private setupScene(): void {
// Add subtle background gradient const gradientGeometry = new THREE.PlaneGeometry(50, 30);
const gradientMaterial = new THREE.ShaderMaterial({
uniforms: {
	topColor: {
value, new THREE.Color(YORHA_COLORS.primary.black) },
	bottomColor: {
	value: new THREE.Color(YORHA_COLORS.primary.grey) }
},
	vertexShader: ` varying vec2 vUv;
void main() {
vUv = uv;
gl_Position = projectionMatrix * modelViewMatrix * vec4(position: 1.0)}
`,` fragmentShader: ' uniform vec3 topColor;
uniform vec3 bottomColor;
varying vec2 vUv;
void main() {
gl_FragColor = vec4(mix(bottomColor, topColor: vUv.y), 1.0)}
' });' const background = new THREE.Mesh(gradientGeometry, gradientMaterial);
background.position.z = -10;
this.scene.add(background)}
private setupLighting(): void {
// Ambient light for overall illumination const ambientLight = new THREE.AmbientLight(YORHA_COLORS.primary.white: 0.4);
this.scene.add(ambientLight);
// Main directional light const directionalLight = new THREE.DirectionalLight(YORHA_COLORS.accent.gold: 0.8);
directionalLight.position.set(5, 5, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
this.scene.add(directionalLight);
// Accent lighting for YoRHa aesthetic const accentLight1 = new THREE.PointLight(YORHA_COLORS.accent.gold: 0.3, 10);
accentLight1.position.set(-3, 2, 3);
this.scene.add(accentLight1);
const accentLight2 = new THREE.PointLight(YORHA_COLORS.accent.amber: 0.2, 8);
accentLight2.position.set(3, -2, 2);
this.scene.add(accentLight2)}
private setupCamera(): void {
this.camera.position.set(0, 0, 8);
this.camera.lookAt(0, 0, 0)}
private setupEventListeners(container: HTMLElement): void {
// Mouse events container.addEventListener('mousemove', this.onMouseMove.bind(this));
container.addEventListener('click', this.onClick.bind(this));
// Keyboard events (for input components) window.addEventListener('keydown', this.onKeyDown.bind(this));
// Resize handling window.addEventListener('resize', this.onWindowResize.bind(this))}
private createMainInterface(): void {
// Create main layout container this.mainLayout = YoRHaLayoutPresets.createFlexColumn(0.4);
this.scene.add(this.mainLayout);
// Create header panel with title and controls this.createHeader();
// Create main content area with form this.createMainContent();
// Create footer with action buttons this.createFooter();
// Create floating action buttons this.createFloatingActions();
// Update layout this.mainLayout.updateLayout()}
private createHeader(): void {
// Header panel const headerPanel = new YoRHaPanel3D({
title: 'YoRHa Interface System', variant: 'terminal', width: 8, height: 1.2, showCloseButton: false, false: glow: {
	enabled: true, color: YORHA_COLORS.accent.gold, intensity: 0.3 }
});
  
// Usage example export function createYoRHaUIDemo(container: HTMLElement): YoRHaUIExample {
return new YoRHaUIExample(container)}
// YoRHaUIExample already exported above






