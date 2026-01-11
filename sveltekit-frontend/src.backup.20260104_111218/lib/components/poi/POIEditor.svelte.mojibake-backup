<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
  import Button from '$lib/components/ui/button/Button.svelte';
  import Input from '$lib/components/ui/input/Input.svelte';
  import Label from '$lib/components/ui/label/Label.svelte';
  import Textarea from '$lib/components/ui/textarea/Textarea.svelte';
  import { AlertTriangle } from "lucide-svelte";
  import { Save } from "lucide-svelte";
  import { X } from "lucide-svelte";
// Migrated from createEventDispatcher to callback props;
  import POIPhotoGrid from './POIPhotoGrid.svelte';

  interface POI {
    name: string;
    alias: string;
    threatLevel: string;
    photos: any[];
    notes: string;
  }

  interface Props {
    poi?: POI;
    isNew?: boolean;
    onSave: (data: POI) => void;
    onCancel: () => void;
    onUploadPhoto: () => void;
    onViewPhoto: (photo: any) => void;
  }

  let { poi = {
      name: '',
      alias: '',
      threatLevel: 'low',
      photos: [],
      notes: ''
    }, isNew = false, onSave, onCancel, onUploadPhoto, onViewPhoto }: Props = $props();

  let formData = { ...poi };

  function handleSave() {
    onSave(formData);
  }

  function handleCancel() {
    onCancel();
  }

  function handlePhotoUpload() {
    onUploadPhoto();
  }

  function handlePhotoView(event: CustomEvent) {
    onViewPhoto(event.detail);
  }

  function handlePhotoDelete(event: CustomEvent) {
    const index = event.detail;
    formData.photos = formData.photos?.filter((_, i) => i !== index) || [];
  }

  function getThreatColor(level: string) {
    switch (level) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  }
</script>

<Card class="w-full max-w-2xl">
  <CardHeader>
    <CardTitle class="flex items-center gap-2">
      <AlertTriangle class="w-5 h-5" />
      {isNew ? 'Create Person of Interest' : 'Edit Person of Interest'}
    </CardTitle>
  </CardHeader>

  <CardContent class="space-y-6">
    <!-- Basic Information -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="space-y-2">
        <Label for="name">Full Name *</Label>
        <Input
          id="name"
          value={formData.name}
          oninput={(e) => formData.name = e.target.value}
          placeholder="Enter full name"
          required
        />
      </div>

      <div class="space-y-2">
        <Label for="alias">Alias</Label>
        <Input
          id="alias"
          value={formData.alias}
          oninput={(e) => formData.alias = e.target.value}
          placeholder="Known alias or nickname"
        />
      </div>
    <!-- Threat Level -->
    <div class="space-y-2">
      <Label for="threatLevel">Threat Level</Label>
      <div class="flex items-center gap-2 mb-2">
        <span class="{getThreatColor(formData.threatLevel)} px-2 py-1 rounded text-xs font-semibold">{formData.threatLevel.toUpperCase()}</span>
        <span class="text-sm text-gray-600">
          {formData.threatLevel === 'low' ? 'Low Risk' : formData.threatLevel === 'medium' ? 'Medium Risk' : formData.threatLevel === 'high' ? 'High Risk' : 'Critical Risk'}
        </span>
      </div>
      <select bind:value={formData.threatLevel} class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="low">Low Risk</option>
        <option value="medium">Medium Risk</option>
        <option value="high">High Risk</option>
        <option value="critical">Critical Risk</option>
      </select>
    </div>

    <!-- Notes -->
    <div class="space-y-2">
      <Label for="notes">Notes</Label>
      <Textarea
        id="notes"
        value={formData.notes}
        oninput={(e) => formData.notes = e.target.value}
        placeholder="Additional notes, observations, or background information..."
        rows={4}
      />
    </div>

    <!-- Photos -->
    <div class="space-y-4">
      <POIPhotoGrid
        photos={formData.photos || []}
        editable={true}
        onUpload={handlePhotoUpload}
        onView={handlePhotoView}
        onDelete={handlePhotoDelete}
      />
    </div>

    <!-- Actions -->
    <div class="flex gap-3 pt-4 border-t">
      <Button onclick={handleSave} class="flex-1">
        <Save class="w-4 h-4 mr-2" />
        {isNew ? 'Create POI' : 'Save Changes'}
      </Button>
      <Button onclick={handleCancel} variant="outline">
        <X class="w-4 h-4 mr-2" />
        Cancel
      </Button>
    </div>
  </CardContent>
</Card>
