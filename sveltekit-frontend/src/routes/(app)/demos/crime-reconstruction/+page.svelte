<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  // ── Scene inputs ──────────────────────────────────────────────────────────
  let who   = $state('');
  let what  = $state('');
  let why   = $state('');
  let how   = $state('');
  let location = $state('');
  let timeOfDay = $state('dusk');
  let genMode  = $state<'t2v' | 'i2v'>('i2v');

  // ── Reconstruction state ──────────────────────────────────────────────────
  let stage    = $state<string>('idle');
  let progress = $state<Record<string, 'pending'|'running'|'done'|'error'>>({});
  let videoUrl    = $state<string | null>(null);
  let keyframeUrl = $state<string | null>(null);
  let videoPrompt = $state('');
  let pointCount  = $state(0);
  let errorMsg    = $state('');

  // ── WebGPU state ──────────────────────────────────────────────────────────
  let canvas: HTMLCanvasElement;
  let gpuDevice: GPUDevice | null = null;
  let gpuContext: GPUCanvasContext | null = null;
  let renderPipeline: GPURenderPipeline | null = null;
  let pointCloudPipeline: GPURenderPipeline | null = null;
  let cameraBuffer: GPUBuffer | null = null;
  let pointBuffer: GPUBuffer | null = null;
  let pointCount3D = $state(0);
  let animFrame: number;
  let gpuReady = $state(false);
  let gpuError = $state('');

  // ── Camera (orbit) ────────────────────────────────────────────────────────
  let camTheta  = $state(0.3);   // horizontal angle (radians)
  let camPhi    = $state(0.5);   // vertical angle
  let camRadius = $state(5.0);
  let dragging  = false;
  let lastMouse = { x: 0, y: 0 };

  // ── Timeline ──────────────────────────────────────────────────────────────
  let timelineT  = $state(0);    // 0–1
  let playing    = $state(false);
  let playTimer: ReturnType<typeof setInterval>;

  // OBJ objects in scene
  type SceneObject = {
    id: string;
    name: string;
    vertices: Float32Array;
    indices: Uint32Array;
    gpuVBuf: GPUBuffer | null;
    gpuIBuf: GPUBuffer | null;
    keyframes: Array<{ t: number; x: number; y: number; z: number; ry: number }>;
  };
  let sceneObjects = $state<SceneObject[]>([]);
  let selectedId   = $state<string | null>(null);

  // ── Service URL ───────────────────────────────────────────────────────────
  const IMAGE_SVC = 'http://localhost:8092';

  // ─────────────────────────────────────────────────────────────────────────
  // WebGPU Init
  // ─────────────────────────────────────────────────────────────────────────

  async function initWebGPU() {
    if (!navigator.gpu) { gpuError = 'WebGPU not supported in this browser'; return; }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) { gpuError = 'No WebGPU adapter'; return; }

    gpuDevice = await adapter.requestDevice({
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
      },
    });

    gpuContext = canvas.getContext('webgpu') as GPUCanvasContext;
    const format = navigator.gpu.getPreferredCanvasFormat() as GPUTextureFormat;
    gpuContext.configure({ device: gpuDevice, format, alphaMode: 'premultiplied' });

    // Camera uniform buffer (mat4+mat4+vec4+4f = 160 bytes, align to 256)
    cameraBuffer = gpuDevice.createBuffer({
      size: 256,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    await buildPointCloudPipeline(format);
    gpuReady = true;
    scheduleRender();
  }

  async function buildPointCloudPipeline(format: GPUTextureFormat) {
    if (!gpuDevice) return;

    const wgslResp = await fetch('/shaders/crime-scene.wgsl');
    const wgsl = await wgslResp.text();

    const module = gpuDevice.createShaderModule({ code: wgsl });

    const bindGroupLayout = gpuDevice.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' } },
      ],
    });

    pointCloudPipeline = gpuDevice.createRenderPipeline({
      layout: gpuDevice.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex:   { module, entryPoint: 'vs_pointcloud' },
      fragment: { module, entryPoint: 'fs_pointcloud',
                  targets: [{ format,
                    blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha',
                                      operation: 'add' },
                              alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' } }
                  }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: {
        format: 'depth24plus',
        depthWriteEnabled: true,
        depthCompare: 'less',
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render Loop
  // ─────────────────────────────────────────────────────────────────────────

  let depthTexture: GPUTexture | null = null;

  function scheduleRender() {
    animFrame = requestAnimationFrame(renderFrame);
  }

  function renderFrame() {
    if (!gpuDevice || !gpuContext || !pointCloudPipeline || !cameraBuffer) {
      scheduleRender(); return;
    }

    const w = canvas.width;
    const h = canvas.height;

    // Rebuild depth texture if canvas resized
    if (!depthTexture || depthTexture.width !== w || depthTexture.height !== h) {
      depthTexture?.destroy();
      depthTexture = gpuDevice.createTexture({
        size: [w, h], format: 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }

    // ── Upload camera matrices ─────────────────────────────────────────────
    const eye = orbitEye(camTheta, camPhi, camRadius);
    const vp  = viewProj(eye, [0,0,0], [0,1,0], 60, w/h, 0.01, 100);
    const camData = new Float32Array(256 / 4);
    camData.set(vp,         0);   // view_proj (mat4 = 16 floats)
    camData.set(vp,        16);   // view (simplified: same as vp for now)
    camData.set(eye,       32);   // position xyz
    camData[36] = 0.01;           // near
    camData[37] = 100.0;          // far
    camData[38] = 4.0;            // point_size (pixels)
    camData[39] = performance.now() / 1000;
    gpuDevice.queue.writeBuffer(cameraBuffer, 0, camData);

    // ── Render pass ────────────────────────────────────────────────────────
    const cmd = gpuDevice.createCommandEncoder();
    const pass = cmd.beginRenderPass({
      colorAttachments: [{
        view: gpuContext.getCurrentTexture().createView(),
        clearValue: { r: 0.06, g: 0.07, b: 0.09, a: 1.0 },
        loadOp: 'clear', storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: depthTexture.createView(),
        depthClearValue: 1.0, depthLoadOp: 'clear', depthStoreOp: 'store',
      },
    });

    // Draw point cloud if loaded
    if (pointBuffer && pointCount3D > 0) {
      const bindGroup = gpuDevice.createBindGroup({
        layout: pointCloudPipeline.getBindGroupLayout(0) as GPUBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: cameraBuffer } },
          { binding: 1, resource: { buffer: pointBuffer } },
        ],
      });
      pass.setPipeline(pointCloudPipeline);
      pass.setBindGroup(0, bindGroup);
      // 6 vertices per point (billboard quad)
      pass.draw(6, pointCount3D);
    }

    pass.end();
    gpuDevice.queue.submit([cmd.finish()]);
    scheduleRender();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Camera math (column-major, WebGPU NDC)
  // ─────────────────────────────────────────────────────────────────────────

  function orbitEye(theta: number, phi: number, r: number): [number, number, number] {
    return [
      r * Math.sin(phi) * Math.sin(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.cos(theta),
    ];
  }

  function viewProj(
    eye: [number,number,number],
    at:  number[],
    up:  number[],
    fovDeg: number,
    aspect: number,
    near: number,
    far: number,
  ): Float32Array {
    // Look-at
    const f = normalize3(sub3(at as any, eye));
    const r = normalize3(cross3(f, up as any));
    const u = cross3(r, f);

    const view = new Float32Array(16);
    view[0]=r[0]; view[4]=r[1]; view[8]=r[2];   view[12]=-dot3(r,eye);
    view[1]=u[0]; view[5]=u[1]; view[9]=u[2];   view[13]=-dot3(u,eye);
    view[2]=-f[0];view[6]=-f[1];view[10]=-f[2]; view[14]=dot3(f,eye);
    view[3]=0;    view[7]=0;    view[11]=0;      view[15]=1;

    // Perspective (WebGPU depth 0→1)
    const fov = fovDeg * Math.PI / 180;
    const t   = 1 / Math.tan(fov / 2);
    const proj = new Float32Array(16);
    proj[0]=t/aspect; proj[5]=t;
    proj[10]=far/(near-far);   proj[11]=-1;
    proj[14]=far*near/(near-far);

    // VP = proj × view
    return mat4mul(proj, view);
  }

  function mat4mul(a: Float32Array, b: Float32Array): Float32Array {
    const o = new Float32Array(16);
    for (let i=0; i<4; i++) for (let j=0; j<4; j++)
      for (let k=0; k<4; k++) o[i+j*4] += a[i+k*4]*b[k+j*4];
    return o;
  }

  function normalize3(v: number[]): number[] {
    const l = Math.hypot(v[0],v[1],v[2])||1;
    return [v[0]/l, v[1]/l, v[2]/l];
  }
  function cross3(a: number[], b: number[]): number[] {
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  }
  function sub3(a: number[], b: number[]): number[] { return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
  function dot3(a: number[]|[number,number,number], b: number[]|[number,number,number]): number {
    return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Point Cloud Upload from API response
  // ─────────────────────────────────────────────────────────────────────────

  function uploadPointCloud(points: Array<{x:number,y:number,z:number,r:number,g:number,b:number}>) {
    if (!gpuDevice || points.length === 0) return;
    // struct Point: vec3+f32+vec4 = 8 floats = 32 bytes
    const data = new Float32Array(points.length * 8);
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const o = i * 8;
      data[o+0] = p.x; data[o+1] = p.y; data[o+2] = p.z; data[o+3] = 0;
      data[o+4] = p.r/255; data[o+5] = p.g/255; data[o+6] = p.b/255; data[o+7] = 1.0;
    }
    pointBuffer?.destroy();
    pointBuffer = gpuDevice.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(pointBuffer.getMappedRange()).set(data);
    pointBuffer.unmap();
    pointCount3D = points.length;
    pointCount = points.length;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OBJ Drag-and-Drop
  // ─────────────────────────────────────────────────────────────────────────

  function parseOBJ(text: string): { vertices: Float32Array; indices: Uint32Array } {
    const positions: number[] = [];
    const normals:   number[] = [];
    const finalVerts: number[] = [];
    const finalIdx:  number[] = [];
    let idx = 0;

    for (const line of text.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === 'v') {
        positions.push(+parts[1], +parts[2], +parts[3]);
      } else if (parts[0] === 'vn') {
        normals.push(+parts[1], +parts[2], +parts[3]);
      } else if (parts[0] === 'f') {
        // Fan triangulation
        const verts = parts.slice(1).map(s => {
          const [vi, , ni] = s.split('/').map(x => (+x || 1) - 1);
          return { vi, ni };
        });
        for (let i = 1; i < verts.length - 1; i++) {
          for (const { vi, ni } of [verts[0], verts[i], verts[i+1]]) {
            const px = positions[vi*3] ??0, py = positions[vi*3+1] ??0, pz = positions[vi*3+2] ??0;
            const nx = normals[ni*3] ??0,  ny = normals[ni*3+1] ??0,  nz = normals[ni*3+2] ??0;
            finalVerts.push(px, py, pz, nx, ny, nz, 0, 0);
            finalIdx.push(idx++);
          }
        }
      }
    }
    return {
      vertices: new Float32Array(finalVerts),
      indices:  new Uint32Array(finalIdx),
    };
  }

  function onOBJDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file || !file.name.endsWith('.obj')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { vertices, indices } = parseOBJ(text);
      const id = crypto.randomUUID();
      sceneObjects = [...sceneObjects, {
        id, name: file.name,
        vertices, indices,
        gpuVBuf: null, gpuIBuf: null,
        keyframes: [{ t: 0, x: 0, y: 0, z: 0, ry: 0 }],
      }];
    };
    reader.readAsText(file);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Crime Scene Reconstruction (SSE stream)
  // ─────────────────────────────────────────────────────────────────────────

  async function reconstruct() {
    if (!who || !what) return;
    stage = 'running';
    progress = { prompt: 'pending', keyframe: 'pending', video: 'pending', depth: 'pending' };
    videoUrl = null; keyframeUrl = null; videoPrompt = ''; errorMsg = '';

    try {
      const resp = await fetch(`${IMAGE_SVC}/reconstruct/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scene: { who, what, why, how, location, time_of_day: timeOfDay },
          mode: genMode,
          include_depth: true,
          include_pointcloud: true,
          num_frames: 25,
        }),
      });

      if (!resp.ok) { errorMsg = `Service error ${resp.status}`; stage = 'error'; return; }

      const reader = resp.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const evt = JSON.parse(line.slice(6));
          const { stage: s, status } = evt;

          progress = { ...progress, [s]: status };

          if (s === 'prompt' && status === 'done') videoPrompt = evt.prompt;

          if (s === 'keyframe' && status === 'done' && evt.image_base64) {
            keyframeUrl = `data:image/png;base64,${evt.image_base64}`;
          }

          if (s === 'video' && status === 'done') {
            if (evt.mp4_base64) {
              const blob = base64ToBlob(evt.mp4_base64, 'video/mp4');
              videoUrl = URL.createObjectURL(blob);
            }
          }

          if (s === 'depth' && status === 'done') {
            if (evt.pointcloud) uploadPointCloud(evt.pointcloud);
          }

          if (s === 'complete') stage = 'done';
          if (status === 'error') errorMsg = evt.error ?? 'Unknown error';
        }
      }
    } catch (e) {
      errorMsg = String(e);
      stage = 'error';
    }
  }

  function base64ToBlob(b64: string, mime: string): Blob {
    const bytes = atob(b64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Timeline playback
  // ─────────────────────────────────────────────────────────────────────────

  function addKeyframe() {
    if (!selectedId) return;
    sceneObjects = sceneObjects.map(o =>
      o.id === selectedId
        ? { ...o, keyframes: [...o.keyframes, { t: timelineT, x: 0, y: 0, z: 0, ry: 0 }].sort((a,b)=>a.t-b.t) }
        : o
    );
  }

  function togglePlay() {
    playing = !playing;
    if (playing) {
      playTimer = setInterval(() => {
        timelineT = (timelineT + 0.002) % 1;
      }, 16);
    } else {
      clearInterval(playTimer);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Mouse orbit controls
  // ─────────────────────────────────────────────────────────────────────────

  function onMouseDown(e: MouseEvent) { dragging = true; lastMouse = { x: e.clientX, y: e.clientY }; }
  function onMouseMove(e: MouseEvent) {
    if (!dragging) return;
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    camTheta += dx * 0.005;
    camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, camPhi + dy * 0.005));
    lastMouse = { x: e.clientX, y: e.clientY };
  }
  function onMouseUp() { dragging = false; }
  function onWheel(e: WheelEvent) {
    camRadius = Math.max(0.5, Math.min(20, camRadius + e.deltaY * 0.01));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  onMount(() => {
    canvas.width  = canvas.clientWidth  * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    initWebGPU();
  });

  onDestroy(() => {
    cancelAnimationFrame(animFrame);
    clearInterval(playTimer);
    gpuDevice?.destroy();
    pointBuffer?.destroy();
    cameraBuffer?.destroy();
    depthTexture?.destroy();
  });

  const stageLabel: Record<string,string> = {
    prompt: 'LLM expanding scene…',
    keyframe: 'FLUX.1-schnell keyframe…',
    video: 'Wan2.1 animating…',
    depth: 'DepthAnything v2…',
    complete: 'Done',
  };
  const stageIcon: Record<string,string> = {
    pending: 'circle', running: 'loader', done: 'check-circle', error: 'alert-circle'
  };
</script>

<svelte:head><title>Crime Scene Reconstruction — WebGPU</title></svelte:head>

<div class="flex h-screen bg-[#0d0e10] text-[#e8dcc8] overflow-hidden">

  <!-- ── Left panel: inputs ──────────────────────────────────────────────── -->
  <aside class="w-72 flex flex-col gap-3 p-4 border-r border-[#2a2a2a] overflow-y-auto shrink-0">
    <h2 class="text-sm font-bold tracking-widest text-[#c4a35a] uppercase">Scene Inputs</h2>

    {#each [
      { label: 'Who',      bind: 'who',      placeholder: 'suspect / victim / witnesses', val: who,      set: (v:string) => who = v },
      { label: 'What',     bind: 'what',     placeholder: 'crime type / actions',          val: what,     set: (v:string) => what = v },
      { label: 'Why',      bind: 'why',      placeholder: 'motive / context',              val: why,      set: (v:string) => why = v },
      { label: 'How',      bind: 'how',      placeholder: 'method / instruments',          val: how,      set: (v:string) => how = v },
      { label: 'Location', bind: 'location', placeholder: 'abandoned warehouse, rooftop…', val: location, set: (v:string) => location = v },
    ] as f}
      <div>
        <label class="text-[10px] text-[#888] uppercase tracking-widest">{f.label}</label>
        <input
          class="w-full mt-1 bg-[#181a1c] border border-[#2e2e2e] rounded px-2 py-1.5 text-xs focus:border-[#c4a35a] outline-none"
          placeholder={f.placeholder}
          value={f.val}
          oninput={(e) => f.set((e.target as HTMLInputElement).value)}
        />
      </div>
    {/each}

    <div class="flex gap-2">
      <div class="flex-1">
        <label class="text-[10px] text-[#888] uppercase tracking-widest">Time</label>
        <select class="w-full mt-1 bg-[#181a1c] border border-[#2e2e2e] rounded px-2 py-1.5 text-xs"
          bind:value={timeOfDay}>
          {#each ['dawn','morning','midday','dusk','night','overcast'] as t}
            <option>{t}</option>
          {/each}
        </select>
      </div>
      <div class="flex-1">
        <label class="text-[10px] text-[#888] uppercase tracking-widest">Mode</label>
        <select class="w-full mt-1 bg-[#181a1c] border border-[#2e2e2e] rounded px-2 py-1.5 text-xs"
          bind:value={genMode}>
          <option value="i2v">FLUX→Wan (i2v)</option>
          <option value="t2v">Wan only (t2v)</option>
        </select>
      </div>
    </div>

    <button
      class="mt-2 w-full py-2 rounded bg-[#c4a35a] text-[#0d0e10] text-xs font-bold hover:bg-[#d4b36a] disabled:opacity-40"
      disabled={!who || !what || stage === 'running'}
      onclick={reconstruct}
    >
      {stage === 'running' ? 'Reconstructing…' : 'Reconstruct Scene'}
    </button>

    <p class="mt-2 text-[10px] text-[#777]">
      Prefer the deterministic view?
      <a href="/demos/scene-intent-2d" class="text-[#c4a35a] underline underline-offset-2">
        View as 2D timeline
      </a>
    </p>

    <!-- Progress stages -->
    {#if stage !== 'idle'}
      <div class="mt-2 space-y-1">
        {#each Object.entries(progress) as [s, status]}
          <div class="flex items-center gap-2 text-[11px]">
            <Icon name={stageIcon[status] ?? 'circle'} class="w-3 h-3 {status === 'done' ? 'text-green-500' : status === 'error' ? 'text-red-500' : status === 'running' ? 'text-[#c4a35a]' : 'text-[#444]'}" />
            <span class="{status === 'running' ? 'text-[#c4a35a]' : status === 'done' ? 'text-[#aaa]' : 'text-[#555]'}">{stageLabel[s] ?? s}</span>
          </div>
        {/each}
        {#if errorMsg}
          <p class="text-red-400 text-[10px] mt-1">{errorMsg}</p>
        {/if}
      </div>
    {/if}

    <!-- Generated prompt preview -->
    {#if videoPrompt}
      <div class="mt-2 p-2 bg-[#181a1c] rounded border border-[#2a2a2a] text-[10px] text-[#888] italic leading-relaxed">
        {videoPrompt}
      </div>
    {/if}

    <!-- OBJ drop zone -->
    <div class="mt-4">
      <h3 class="text-[10px] text-[#888] uppercase tracking-widest mb-2">OBJ Objects</h3>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="border-2 border-dashed border-[#2a2a2a] rounded p-3 text-center text-[11px] text-[#555] hover:border-[#c4a35a] cursor-pointer"
        ondragover={(e) => e.preventDefault()}
        ondrop={onOBJDrop}
      >
        Drop .obj files here
      </div>
      {#each sceneObjects as obj}
        <div
          class="mt-1 px-2 py-1 rounded text-[11px] cursor-pointer {selectedId === obj.id ? 'bg-[#c4a35a]/20 text-[#c4a35a]' : 'bg-[#181a1c] text-[#888]'}"
          onclick={() => selectedId = obj.id}
          role="button" tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && (selectedId = obj.id)}
        >
          {obj.name} — {obj.vertices.length / 8 | 0} verts
        </div>
      {/each}
    </div>

    <!-- Camera controls hint -->
    <div class="mt-auto text-[10px] text-[#444] space-y-0.5">
      <p>Drag — orbit camera</p>
      <p>Scroll — zoom</p>
      <p>Points: {pointCount3D.toLocaleString()}</p>
      {#if gpuError}<p class="text-red-500">{gpuError}</p>{/if}
      {#if gpuReady}<p class="text-green-600">WebGPU ✓ RTX 3060 Ti</p>{/if}
    </div>
  </aside>

  <!-- ── Main: WebGPU viewport ───────────────────────────────────────────── -->
  <main class="flex-1 flex flex-col">
    <!-- Viewport -->
    <div class="flex-1 relative"
      ondragover={(e) => e.preventDefault()}
      ondrop={onOBJDrop}
    >
      <canvas
        bind:this={canvas}
        class="w-full h-full block"
        style="touch-action: none;"
        onmousedown={onMouseDown}
        onmousemove={onMouseMove}
        onmouseup={onMouseUp}
        onmouseleave={onMouseUp}
        onwheel={onWheel}
      ></canvas>

      <!-- Overlay: video preview (bottom-right) -->
      {#if videoUrl}
        <div class="absolute bottom-4 right-4 w-48 rounded overflow-hidden border border-[#c4a35a]/40 shadow-xl">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video src={videoUrl} autoplay loop muted playsinline class="w-full"></video>
        </div>
      {/if}

      <!-- Overlay: keyframe preview -->
      {#if keyframeUrl && !videoUrl}
        <div class="absolute bottom-4 right-4 w-48 rounded overflow-hidden border border-[#c4a35a]/40 shadow-xl">
          <img src={keyframeUrl} alt="FLUX keyframe" class="w-full" />
        </div>
      {/if}

      <!-- GPU not ready -->
      {#if !gpuReady && !gpuError}
        <div class="absolute inset-0 flex items-center justify-center text-[#555] text-sm">
          Initializing WebGPU…
        </div>
      {/if}
    </div>

    <!-- ── Timeline bar ─────────────────────────────────────────────────── -->
    <div class="h-20 border-t border-[#2a2a2a] bg-[#111213] px-4 flex flex-col justify-center gap-2">
      <div class="flex items-center gap-3">
        <button
          class="w-6 h-6 flex items-center justify-center rounded text-[#c4a35a] hover:bg-[#c4a35a]/10"
          onclick={togglePlay}
        >
          <Icon name={playing ? 'pause' : 'play'} class="w-4 h-4" />
        </button>
        <input
          type="range" min="0" max="1" step="0.001"
          bind:value={timelineT}
          class="flex-1 accent-[#c4a35a]"
        />
        <span class="text-[10px] text-[#555] w-10 text-right">{(timelineT * 100 | 0)}%</span>
        {#if selectedId}
          <button
            class="text-[10px] px-2 py-1 rounded border border-[#c4a35a]/30 text-[#c4a35a] hover:bg-[#c4a35a]/10"
            onclick={addKeyframe}
          >+ Key</button>
        {/if}
      </div>
      <!-- Keyframe ticks -->
      <div class="relative h-3 bg-[#181a1c] rounded">
        {#each sceneObjects.flatMap(o => o.keyframes) as kf}
          <div
            class="absolute top-0 h-full w-0.5 bg-[#c4a35a]"
            style="left: {kf.t * 100}%"
          ></div>
        {/each}
        <div
          class="absolute top-0 h-full w-px bg-white/60"
          style="left: {timelineT * 100}%"
        ></div>
      </div>
    </div>
  </main>

</div>
