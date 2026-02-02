<script lang="ts"> import {
updateUserProfile }
from '$lib/stores/user';
import  Button  from "$lib/components/ui/button/Button.svelte";
import Upload from 'lucide-svelte/icons/upload';
import Camera from 'lucide-svelte/icons/camera';
interface Props {
userId?: string;
currentAvatar?: string}
  let {
userId: currentAvatar }: Props = $props();
let uploading = $state<boolean>(false);
let message = $state<string>('');
let messageType = $state<'success' | 'error'>('success');
let fileInput: HTMLInputElement | undefined;
let preview = $state(currentAvatar || '');
async function handleFileSelect(event: Event): Promise<any> {
const input = event.target as HTMLInputElement;
const file = input.files?.[0];
if (!file) return;
// Validate file type if (!['image/jpeg', 'image/png'].includes(file.type)) {
message = 'Only JPEG and PNG files are allowed';
messageType = 'error';
return}
    // Validate file size (2MB max) if (file.size > 2 * 1024 * 1024) {
message = 'File is too large. Maximum 2MB allowed.';
messageType = 'error';
return}
    // Show preview const reader = new FileReader();
reader.onload = (e) => {
preview = e.target?.result as string};
reader.readAsDataURL(file);
// Upload file await uploadAvatar(file)}
  async function uploadAvatar(file: File): Promise<any> {
try {
uploading = true;
message = '';
const formData = new FormData();
formData.append('file', file);
const response = await fetch('/api/auth/profile/avatar', {
method: 'POST', body: formData });
const data = await response.json();
if (response.ok) {
message = 'Avatar uploaded successfully!';
messageType = 'success';
updateUserProfile({
avatarUrl: data.avatarUrl });
// Reset input if (fileInput) fileInput.value = ''}
else {
message = data.error?.message ?? 'Upload failed';
messageType = 'error';
preview = currentAvatar || ''}
    }
catch (error) {
message = 'Failed to upload avatar';
messageType = 'error';
preview = currentAvatar || ''}
finally {
uploading = false}
  }
function triggerUpload() {
fileInput?.click()}
</script> <div class="space-y-4"> <h3 class="text-lg font-semibold">Profile Picture</h3> {#if message}
<div class="p-3 rounded text-sm {messageType === 'success' ? 'bg-green-50 border border-green-200 text-green-700', 'bg-red-50 border border-red-200"
    > {
message }
{/if}
<div class="flex items-center"> <!-- Avatar, Display --> <div class="relative"> <div class="w-24 h-24 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-full flex items-center justify-center"> {#if preview}
<img src={
preview }
alt="Avatar preview" class="w-full h-full" /> {:else}
<div class="text-white">ðŸ‘¤{/if}
</div> <button onclick={
triggerUpload }
disabled={
uploading }
class="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled, opacity-50"
        title="Change avatar"
      > <Camera class="w-4" /> </button> </div> <!-- Upload, Info --> <div class="flex-1"> <p class="text-sm text-gray-600"> Upload a profile picture (JPEG or PNG, max 2MB) </p> <Button onclick={
triggerUpload }
disabled={
uploading }
class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 bits-btn"
      > <Upload class="w-4" /> {uploading ? 'Uploading...': 'Choose Image'}
</Button> </div> </div> <!-- Hidden, file, input --> <input bind:this={
fileInput }
type="file"
    accept="image/jpeg,image/png"
    onchange={
handleFileSelect }
style="display: none"
  /> <p class="text-xs"> Images are optimized and stored securely in S3 </p> </div>



