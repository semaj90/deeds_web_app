<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui';
  import { Badge } from '$lib/components/ui/badge';
  import Button from '$lib/components/ui/button/Button.svelte';
  import Input from '$lib/components/ui/input/Input.svelte';
  import Label from '$lib/components/ui/label/Label.svelte';
  import Select from '$lib/components/ui/select/Select.svelte';
  import SelectContent from '$lib/components/ui/select/SelectContent.svelte';
  import SelectItem from '$lib/components/ui/select/SelectItem.svelte';
  import SelectTrigger from '$lib/components/ui/select/SelectTrigger.svelte';
  import SelectValue from '$lib/components/ui/select/SelectValue.svelte';
  import Textarea from '$lib/components/ui/textarea/Textarea.svelte';
  import { AlertTriangle, Save, X } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  import POIPhotoGrid from './POIPhotoGrid.svelte';

  let {
    poi = {
      name: '',
      alias: '',
      threatLevel: 'low',
      photos: [],
      notes: ''
    },
    isNew = false
  } = $props();

  const dispatch = createEventDispatcher();

  let formData = { ...poi };

  function handleSave() {
    dispatch('save', formData);
  }

  function handleCancel() {
    dispatch('cancel');
  }

  function handlePhotoUpload() {
    dispatch('uploadPhoto');
  }

  function handlePhotoView(event: CustomEvent) {
    dispatch('viewPhoto', event.detail);
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
          bind:value={formData.name}
          placeholder="Enter full name"
          required
        />
      </div>

      <div class="space-y-2">
        <Label for="alias">Alias</Label>
        <Input
          id="alias"
          bind:value={formData.alias}
          placeholder="Known alias or nickname"
        />
      </div>
    </div>

    <!-- Threat Level -->
    <div class="space-y-2">
      <Label for="threatLevel">Threat Level</Label>
      <Select bind:value={formData.threatLevel}>
        <SelectTrigger>
          <SelectValue placeholder="Select threat level" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="low">
            <div class="flex items-center gap-2">
              <Badge class="bg-green-500 text-white">LOW</Badge>
              <span>Low Risk</span>
            </div>
          </SelectItem>
          <SelectItem value="medium">
            <div class="flex items-center gap-2">
              <Badge class="bg-yellow-500 text-black">MEDIUM</Badge>
              <span>Medium Risk</span>
            </div>
          </SelectItem>
          <SelectItem value="high">
            <div class="flex items-center gap-2">
              <Badge class="bg-orange-500 text-white">HIGH</Badge>
              <span>High Risk</span>
            </div>
          </SelectItem>
          <SelectItem value="critical">
            <div class="flex items-center gap-2">
              <Badge class="bg-red-500 text-white">CRITICAL</Badge>
              <span>Critical Risk</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- Notes -->
    <div class="space-y-2">
      <Label for="notes">Notes</Label>
      <Textarea
        id="notes"
        bind:value={formData.notes}
        placeholder="Additional notes, observations, or background information..."
        rows={4}
      />
    </div>

    <!-- Photos -->
    <div class="space-y-4">
      <POIPhotoGrid
        photos={formData.photos || []}
        editable={true}
        on:upload={handlePhotoUpload}
        on:view={handlePhotoView}
        on:delete={handlePhotoDelete}
      />
    </div>

    <!-- Actions -->
    <div class="flex gap-3 pt-4 border-t">
      <Button on:click={handleSave} class="flex-1">
        <Save class="w-4 h-4 mr-2" />
        {isNew ? 'Create POI' : 'Save Changes'}
      </Button>
      <Button on:click={handleCancel} variant="outline">
        <X class="w-4 h-4 mr-2" />
        Cancel
      </Button>
    </div>
  </CardContent>
</Card>