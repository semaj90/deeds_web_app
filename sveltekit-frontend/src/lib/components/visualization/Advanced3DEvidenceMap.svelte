<script lang="ts">
  // Migrated to $effect
  import { browser } from '$app/environment';
  import * as THREE from 'three';
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

  // Mock types for Three.js interactions
  interface Props {
    caseId: string;
    evidenceData?: any[];
    width?: number;
    height?: number;
  }

  let {
    caseId,
    evidenceData = [],
    width = 800,
    height = 600
  }: Props = $props();

  let container = $state<HTMLDivElement>();
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let frameId: number;
  let isMounted = false;

  $effect(() => {
    if (browser && container && !isMounted) {
        init();
        isMounted = true;
    }
  });

  function init() {
     if (!container) return;
     scene = new THREE.Scene();
     scene.background = new THREE.Color(0x0f1016);
     scene.fog = new THREE.FogExp2(0x0f1016, 0.002);

     camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 1, 1000);
     camera.position.set(400, 200, 0);
     camera.lookAt(0, 0, 0);

     renderer = new THREE.WebGLRenderer({ antialias: true });
     renderer.setPixelRatio(window.devicePixelRatio);
     renderer.setSize(container.clientWidth, container.clientHeight);
     container.appendChild(renderer.domElement);

     // Lights
     const dirLight = new THREE.DirectionalLight(0xffffff, 3);
     dirLight.position.set(1, 1, 1);
     scene.add(dirLight);

     const ambientLight = new THREE.AmbientLight(0x222222);
     scene.add(ambientLight);

     // Add some objects
     const geometry = new THREE.CylinderGeometry(0, 10, 30, 4, 1);
     const material = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true });

     for (let i = 0; i < 50; i++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.x = Math.random() * 1600 - 800;
        mesh.position.y = 0;
        mesh.position.z = Math.random() * 1600 - 800;
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
     }

     animate();
     window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
     if (!container || !camera || !renderer) return;
     camera.aspect = container.clientWidth / container.clientHeight;
     camera.updateProjectionMatrix();
     renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function animate() {
     frameId = requestAnimationFrame(animate);
     render();
  }

  function render() {
     if (renderer && scene && camera) {
         const time = Date.now() * 0.001;
         scene.rotation.y = time * 0.1;
         renderer.render(scene, camera);
     }
  }

  // TODO: Add as cleanup in $effect: return () => {
     if (browser) {
         window.removeEventListener('resize', onWindowResize);
         if (frameId) cancelAnimationFrame(frameId);
         if (renderer) renderer.dispose();
     }
  }

</script>

<div class="relative w-full h-[600px] rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
    <div bind:this={container} class="w-full h-full"></div>

    <div class="absolute top-4 left-4 p-4 bg-black/50 backdrop-blur rounded flex flex-col gap-2">
        <h3 class="text-white font-bold">3D Evidence Map</h3>
        <div class="flex gap-2">
            <Badge variant="secondary">Orbit</Badge>
            <Badge variant="outline">{evidenceData.length} items</Badge>
        </div>
    </div>

    <div class="absolute bottom-4 right-4 flex gap-2">
        <Button variant="outline" size="sm" onclick={() => {
            camera.position.set(0, 500, 0);
            camera.lookAt(0,0,0);
        }}>Top View</Button>
        <Button variant="outline" size="sm" onclick={() => {
            camera.position.set(400, 200, 0);
            camera.lookAt(0,0,0);
        }}>Reset</Button>
    </div>
</div>
