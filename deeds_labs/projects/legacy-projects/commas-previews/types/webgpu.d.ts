// Minimal ambient declarations for WebGPU used during preview-only typechecks
interface GPUBuffer {}
interface GPUDevice { createBuffer(descriptor: any): GPUBuffer }
interface GPUAdapter { requestDevice(): Promise<GPUDevice> }
interface Navigator { gpu?: GPU; }
interface GPU { requestAdapter(): Promise<GPUAdapter | null> }
declare const navigator: Navigator;

declare module 'webgpu' {}
