<script lang="ts">
import AlertCircle from 'lucide-svelte/icons/alert-circle';
import Camera from 'lucide-svelte/icons/camera';
import FileIcon from 'lucide-svelte/icons/file';
import ImageIcon from 'lucide-svelte/icons/image';
import Loader2 from 'lucide-svelte/icons/loader-2';
import Upload from 'lucide-svelte/icons/upload';
import X from 'lucide-svelte/icons/x';
import { onDestroy } from 'svelte';
import { fly, slide } from 'svelte/transition';

import Button from '$lib/components/ui/Button.svelte';
import Card from '$lib/components/ui/card/Card.svelte';
import CardContent from '$lib/components/ui/card/CardContent.svelte';
import CardDescription from '$lib/components/ui/card/CardDescription.svelte';
import CardFooter from '$lib/components/ui/card/CardFooter.svelte';
import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
import { Progress } from '$lib/components/ui/progress';
import { ScrollArea } from '$lib/components/ui/scroll-area';

// Props interface
interface Props {
acceptedTypes?: string[];
maxSize?: number; // in bytes
multiple?: boolean;
onUpload?: (files: File[]) => Promise<void>;
class?: string;
}

let {
acceptedTypes = ['*'],
maxSize = 10 * 1024 * 1024, // 10MB
multiple = true,
onUpload,
class: className = ''
}: Props = $props();

// State
let files = $state<File[]>([]);
let isDragging = $state(false);
let isUploading = $state(false);
let uploadProgress = $state(0);
let error = $state<string | null>(null);
let activeTab = $state<'drop' | 'camera' | 'mic'>('drop');
let mediaStream = $state<MediaStream | null>(null);
let mediaRecorder = $state<MediaRecorder | null>(null);
let isRecording = $state(false);
let audioUrl = $state<string | null>(null);
let videoRef = $state<HTMLVideoElement | null>(null);

// Derived state
let totalSize = $derived(files.reduce((acc, f) => acc + f.size, 0));
let formattedTotalSize = $derived((totalSize / 1024 / 1024).toFixed(2) + ' MB');

// Drag and Drop handlers
function handleDragEnter(e: DragEvent) {
e.preventDefault();
isDragging = true;
}

function handleDragLeave(e: DragEvent) {
e.preventDefault();
isDragging = false;
}

function handleDragOver(e: DragEvent) {
e.preventDefault();
isDragging = true;
}

function handleDrop(e: DragEvent) {
e.preventDefault();
isDragging = false;
if (e.dataTransfer?.files) {
handleFiles(Array.from(e.dataTransfer.files));
}
}

function handleFileInput(e: Event) {
const target = e.target as HTMLInputElement;
if (target.files) {
handleFiles(Array.from(target.files));
}
}

// File processing
function handleFiles(newFiles: File[]) {
error = null;

const validFiles = newFiles.filter(file => {
// Check size
if (file.size > maxSize) {
error = `File ${file.name} is too large. Max size is ${maxSize / 1024 / 1024}MB.`;
return false;
}
// Check type (basic implementation)
if (acceptedTypes[0] !== '*' && !acceptedTypes.some(type => {
if (type.endsWith('/*')) {
return file.type.startsWith(type.replace('/*', ''));
}
return file.type === type || file.name.endsWith(type);
})) {
error = `File type not accepted: ${file.name}`;
return false;
}
return true;
});

if (multiple) {
files = [...files, ...validFiles];
} else {
files = validFiles.slice(0, 1);
}
}

function removeFile(index: number) {
files = files.filter((_, i) => i !== index);
}

// Upload handler
async function handleUpload() {
if (files.length === 0) return;

isUploading = true;
uploadProgress = 0;
error = null;

try {
// Simulate progress
const interval = setInterval(() => {
uploadProgress += 5;
if (uploadProgress >= 90) clearInterval(interval);
}, 100);

if (onUpload) {
await onUpload(files);
} else {
// Default simulation
await new Promise(resolve => setTimeout(resolve, 2000));
}

clearInterval(interval);
uploadProgress = 100;

// Success feedback
setTimeout(() => {
files = [];
isUploading = false;
uploadProgress = 0;
activeTab = 'drop';
}, 1000);

} catch (err) {
error = err instanceof Error ? err.message : 'Upload failed';
isUploading = false;
}
}

// Camera/Mic handlers
async function startCamera() {
try {
mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
if (videoRef) {
videoRef.srcObject = mediaStream;
}
activeTab = 'camera';
} catch (err) {
error = 'Could not access camera';
}
}

function stopMedia() {
if (mediaStream) {
mediaStream.getTracks().forEach(track => track.stop());
mediaStream = null;
}
if (videoRef) {
videoRef.srcObject = null;
}
}

function capturePhoto() {
if (!videoRef || !mediaStream) return;

const canvas = document.createElement('canvas');
canvas.width = videoRef.videoWidth;
canvas.height = videoRef.videoHeight;
const ctx = canvas.getContext('2d');
if (ctx) {
ctx.drawImage(videoRef, 0, 0);
canvas.toBlob(blob => {
if (blob) {
const file = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });
handleFiles([file]);
stopMedia();
activeTab = 'drop';
}
}, 'image/png');
}
}

onDestroy(() => {
stopMedia();
});

// Cleanup
$effect(() => {
return () => {
if (audioUrl) URL.revokeObjectURL(audioUrl);
};
});

</script>

<div class={`w-full max-w-3xl mx-auto ${className}`}>
<Card>
<CardHeader>
<CardTitle class="flex items-center justify-between">
<span>Upload Documents</span>
<div class="flex gap-2">
<Button
variant={activeTab === 'drop' ? 'default' : 'outline'}
size="sm"
onclick={() => { stopMedia(); activeTab = 'drop'; }}
>
<FileIcon class="w-4 h-4 mr-2" />
Files
</Button>
<Button
variant={activeTab === 'camera' ? 'default' : 'outline'}
size="sm"
onclick={() => startCamera()}
>
<Camera class="w-4 h-4 mr-2" />
Camera
</Button>
</div>
</CardTitle>
<CardDescription>
Drag and drop files here, or use your camera/microphone.
</CardDescription>
</CardHeader>

<CardContent>
{#if activeTab === 'drop'}
<div
role="region"
aria-label="File Upload Drop Zone"
class={`
relative border-2 border-dashed rounded-lg p-8 transition-colors duration-200
flex flex-col items-center justify-center text-center gap-4
${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
`}
onmultipointdragenter={handleDragEnter}
ondragenter={handleDragEnter}
ondragleave={handleDragLeave}
ondragover={handleDragOver}
ondrop={handleDrop}
>
<div class="p-4 bg-muted/50 rounded-full">
<Upload class="w-8 h-8 text-muted-foreground" />
</div>
<div>
<p class="text-sm font-medium">
<span class="text-primary cursor-pointer hover:underline">
Click to upload
<input
type="file"
class="sr-only"
multiple={multiple}
accept={acceptedTypes.join(',')}
onchange={handleFileInput}
/>
</span>
or drag and drop
</p>
<p class="text-xs text-muted-foreground mt-1">
Supported: {acceptedTypes.join(', ')} (Max {maxSize / 1024 / 1024}MB)
</p>
</div>
</div>

{:else if activeTab === 'camera'}
<div class="relative bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
<!-- svelte-ignore a11y_media_has_caption -->
<video bind:this={videoRef} autoplay playsinline muted class="w-full h-full object-cover"></video>

<div class="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
<Button variant="destructive" onclick={() => { stopMedia(); activeTab = 'drop'; }}>
Cancel
</Button>
<Button onclick={capturePhoto}>
<Camera class="w-4 h-4 mr-2" />
Capture
</Button>
</div>
</div>
{/if}

{#if error}
<div class="mt-4 p-3 bg-destructive/10 text-destructive rounded-md flex items-center gap-2 text-sm" transition:slide>
<AlertCircle class="w-4 h-4" />
{error}
</div>
{/if}

{#if files.length > 0}
<div class="mt-6 space-y-4" transition:slide>
<div class="flex items-center justify-between text-sm text-muted-foreground">
<span>{files.length} file(s) selected</span>
<span>Total: {formattedTotalSize}</span>
</div>

<ScrollArea class="h-[200px] w-full rounded-md border p-4">
<div class="space-y-3">
{#each files as file, i (file.name + i)}
<div
class="flex items-center gap-3 p-3 bg-muted/30 rounded-lg group hover:bg-muted/50 transition-colors"
in:fly={{ y: 20, duration: 300, delay: i * 50 }}
out:slide
>
<div class="p-2 bg-background rounded-md border shadow-sm">
{#if file.type.startsWith('image/')}
<ImageIcon class="w-4 h-4 text-primary" />
{:else}
<FileIcon class="w-4 h-4 text-muted-foreground" />
{/if}
</div>

<div class="flex-1 min-w-0">
<p class="text-sm font-medium truncate">{file.name}</p>
<p class="text-xs text-muted-foreground">
{(file.size / 1024).toFixed(1)} KB
</p>
</div>

<Button
variant="ghost"
size="icon"
class="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive"
onclick={() => removeFile(i)}
>
<X class="w-4 h-4" />
</Button>
</div>
{/each}
</div>
</ScrollArea>

{#if isUploading}
<div class="space-y-2">
<div class="flex justify-between text-xs text-muted-foreground">
<span>Uploading...</span>
<span>{uploadProgress}%</span>
</div>
<Progress value={uploadProgress} />
</div>
{/if}
</div>
{/if}
</CardContent>

<CardFooter class="justify-end gap-3 border-t bg-muted/5 p-6 mt-4">
<Button
variant="outline"
disabled={files.length === 0 || isUploading}
onclick={() => { files = []; error = null; }}
>
Clear All
</Button>
<Button
disabled={files.length === 0 || isUploading}
onclick={handleUpload}
class="min-w-[100px]"
>
{#if isUploading}
<Loader2 class="w-4 h-4 mr-2 animate-spin" />
Uploading
{:else}
<Upload class="w-4 h-4 mr-2" />
Upload Files
{/if}
</Button>
</CardFooter>
</Card>
</div>