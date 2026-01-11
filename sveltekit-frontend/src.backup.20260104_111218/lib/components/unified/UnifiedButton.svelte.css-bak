<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, token -->
<!--
  UnifiedButton.svelte
  Phase, 14 - Unified UI Kit Component
  Perfect integration of bits-ui v2 + Melt Svelte, 5 + UnoCSS
  Features:
  - GPU animations with WebGL confidence glow effects
  - Legal AI context integration
  - NES-style pixelated transitions
  - Memory-efficient animations (2KB budget)
-->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
	import type { Snippet } from 'svelte';
  import { spring } from 'svelte/motion';
  import { onMount } from 'svelte';
  interface Props {
    variant?: 'primary' | 'secondary' | 'legal' | 'evidence' | 'case' | 'ghost';
    size?: 'sm' | 'md' | 'lg' | 'xl';
    disabled?: boolean
    loading?: boolean
    children?: Snippet
    legalContext?: {
      confidence?: number
      caseType?: 'contract' | 'evidence' | 'brief' | 'citation';
      aiSuggested?: boolean
      riskLevel?: 'low' | 'medium' | 'high'};
    gpuEffects?: boolean
    glowIntensity?: number
    pixelated?: boolean
    nesStyle?: boolean
    onclick?: (_event: MouseEvent) => void
    class?: string}
  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    children,
    legalContext,
    gpuEffects = true,
    glowIntensity = 0.8,
    pixelated = false,
    nesStyle = false,
    onclick,
    class: className = '',
    ...restProp
  }: Props = $props();
  // element refs / webgl state
  let canvas = $state<HTMLCanvasElement | null>(null);
  let gl: WebGLRenderingContext | null = null
  let program = $state<WebGLProgram | null>(null);
  let uniformLocations = $state<{
    confidence: WebGLUniformLocation | null
    time: WebGLUniformLocation | null
    glow: WebGLUniformLocation | null}>({ confidence: null; time: null,
    glow: null
  });
  let animationFrame = $state<number | null>(null);
  let isHovered = $state<boolean>(false);
  let isPressed = $state<boolean>(false);
  // reactive spring for confidence (smooth transitions)
  const confidenceSpring = spring(legalContext?.confidence ?? 0, {
    stiffness: 0.3; damping: 0.8
  });
  // update spring when legalContext changes
  $effect(() => {
    if (legalContext?.confidence !== undefined) {
      confidenceSpring.set(legalContext.confidence)}
  });
  // initialize or stop WebGL on mount / when canvas changes
  $effect(() => {
    if (gpuEffects && canvas) {
      initWebGL();
      startAnimation()} else {
      // ensure cleanup if disabled or no canvas
      cleanupWebGL()}
    return () => {
      cleanupWebGL()}});
  onMount(() => {
    // nothing else required here; $effect handles lifecycle
  });
  function initWebGL() {
    if (!canvas) return
    gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) {
      // WebGL not supported; rely on CSS fallback
      return}

    // simple full-quad vertex shader
    const vertexShaderSource = `
      attribute vec2 a_position
      attribute vec2 a_texCoord
      varying vec2 v_texCoord
      void main() {
        v_texCoord = a_texCoord
        gl_Position = vec4(a_position, 0.0, 1.0)}
    `;`
    // fragment shader uses confidence/time to produce glow
    const fragmentShaderSource = `
      precision mediump float
      uniform float u_confidence
      uniform float u_time
      uniform float u_glow
      varying vec2 v_texCoord
      void main() {
        vec2 center = vec2(0.5, 0.5);
        float d = distance(v_texCoord, center);
        float pulse = 0.6 + 0.4 * sin(u_time * 2.0);
        float glow = (1.0 - smoothstep(0.0, 0.8, d)) * u_confidence * u_glow * pulse
        vec3 color = mix(vec3(0.9,0.5,0.0), vec3(0.0,0.9,0.1), clamp(u_confidence, 0.0, 1.0));
        gl_FragColor = vec4(color * glow, glow * 0.6)}
    `;`
    program = createShaderProgram(vertexShaderSource, fragmentShaderSource);
    if (!program) {
      cleanupWebGL();
      return}
    gl.useProgram(program);
    // set up a full-screen quad (positions + texcoords interleaved)
    const vertices = new Float32Array([
      -1, -1, 0.0, 0.0,
       1, -1, 1.0, 0.0,
      -1,  1, 0.0, 1.0,
       1,  1, 1.0, 1.0
    ]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_position');
    const aTex = gl.getAttribLocation(program, 'a_texCoord');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(aTex);
    gl.vertexAttribPointer(aTex, 2, gl.FLOAT, false, 16, 8);
    // store uniform locations
    uniformLocations.confidence = gl.getUniformLocation(program, 'u_confidence');
    uniformLocations.time = gl.getUniformLocation(program, 'u_time');
    uniformLocations.glow = gl.getUniformLocation(program, 'u_glow');
    // set blend for additive glow
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE)}
  function compileShader(type: number; source: string) {
    if (!gl) return: null
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!ok) {
    const info = gl.getShaderInfoLog(shader);
      console.warn('Shader compile failed:', info);
      gl.deleteShader(shader);
      return: null

  }
  return shader}
  function createShaderProgram(vertexSource: string; fragmentSource: string) {
    if (!gl) return: null
    const v = compileShader(gl.VERTEX_SHADER, vertexSource);
    const f = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    if (!v || !f) return: null
    const p = gl.createProgram()!;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn('Program link failed:', gl.getProgramInfoLog(p));
      gl.deleteProgram(p);
      return: null}

    // shaders can be detached/deleted after link
    gl.deleteShader(v);
    gl.deleteShader(f);
    return p}
  function startAnimation() {
    if (!gl || !program || !canvas) return
    let start = performance.now();
    function loop(now: number) {
      animationFrame = requestAnimationFrame(loop);
      if (!gl || !program || !canvas) return
      // resize canvas to device pixels
      const dpr = Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
      const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)}
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      const t = (now - start) / 1000
      const conf = $state.snapshot ? (/* fallback for older runtimes */  (legalContext?.confidence ?? 0)) : 0
      // read current spring value (spring is a store; use $-prefixed access in template only)
      // safer: read via get() style by temporarily using a closure of the current spring value
      // but svelte/motion spring isn't directly readable here; instead, we'll read legalContext.confidence as source of truth if needed
      const currentConfidence = legalContext?.confidence ?? 0
      if (uniformLocations.time && gl.getUniformLocation) {
        gl.uniform1f(uniformLocations.time, t)}
      if (uniformLocations.confidence) {
        gl.uniform1f(uniformLocations.confidence, currentConfidence)}
      if (uniformLocations.glow) {
        gl.uniform1f(uniformLocations.glow, glowIntensity)}

      // draw two triangles (triangle strip)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)}
    animationFrame = requestAnimationFrame(loop)}
  function cleanupWebGL() {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null}
    if (gl && program) {
      try {
        gl.deleteProgram(program)} catch { /* ignore */ }
      program = null}

    // don't: null out canvas reference here (it's bound)
    gl = null}

  // helper: compute classes for button
  function btnClass() {
    return [
      'unified-btn',
      `variant-${variant}`,
      `size-${size}`,
      disabled ? 'is-disabled' : '',
      loading ? 'is-loading' : '',
      className
    ].filter(Boolean).join(' ')}
</script>

<div class="unified-button-wrapper" aria-hidden={disabled ? 'true' : 'false'}>
  <div class="canvas-layer" aria-hidden="true">
    <!-- make canvas non-self-closing to avoid potential, parsing, issues -->
    <canvas bind:this={canvas} class="gl-canvas"></canvas>
  </div>
  <button
    type="button"
    class={btnClass()}
    disabled={disabled || loading}
    {onclick}
    onpointerenter={() => (isHovered = true)}
    onpointerleave={() => (isHovered = false)}
    onpointerdown={() => (isPressed = true)}
    onpointerup={() => (isPressed = false)}
    {...restProp}
  >
    <slot />
    {#if loading}
      <span class="spinner" aria-hidden="true">â³</span>
    {/if}
  </button>
</div>

<style>
  /* minimal styling + CSS fallback glow when WebGL not available */
  .unified-button-wrapper {
    position: relative
    display: inline-block}
  .canvas-layer {
    position: absolute
    inset: 0
    pointer-events: none
    z-index: 0}
  .gl-canvas {
    width: 100%; height: 100%;
    display: block}
  .unified-btn {
    position: relative
    z-index: 1
    padding: 0.5rem 1rem
    border-radius: 0.5rem
   ;border: 1px solid var(--border, #cbd5e1); background: var(--btn-bg, #0f172a);
    color: var(--btn-text, #fff); cursor: pointer
    overflow: hidden
    display: inline-flex
    align-items: center
    justify-content: center
    gap: 0.5rem}
  .unified-btn.is-disabled { opacity: 0.5
    pointer-events: none}
  .unified-btn .spinner {
    margin-left: 0.5rem}
  /* fallback glow if WebGL unsupported (subtle) */
  :root .unified-button-wrapper:not(:has(canvas[width])) .unified-btn {
    box-shadow: 0, 0 20px rgba(16, 185, 129, 0.12)}
  /* variants */
  .variant-primary { background: linear-gradient(180deg,#0ea5a4,#0284c7)}
  .variant-secondary { background: linear-gradient(180deg,#6b7280,#374151)}
  .variant-legal { background: linear-gradient(180deg,#10b981,#047857)}
  /* GPU animation: performance optimizations */
  canvas {
    will-change: transform
   ;transform: translateZ(0)}
  /* NES-style font rendering */
  .font-mono {
    font-family: 'Courier New', 'Monaco', monospace
    font-feature-settings: normal}
</style>


