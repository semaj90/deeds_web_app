<script lang="ts">
  import Checkbox from '$lib/components/ui/checkbox/Checkbox.svelte';
  import SelectBits from '$lib/components/ui/select/SelectBits.svelte';

  let selectedCase = $state('');
  let selectedPoi = $state('');
  let file: File | null = $state(null);
  let summarize = $state(false);
  let tag = $state(false);

  const handleFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input?.files?.[0]) {
      file = input.files[0];
    } else {
      file = null;
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      alert('Please select a file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('caseId', selectedCase);
    formData.append('poiId', selectedPoi);
    formData.append('summarize', String(summarize));
    formData.append('tag', String(tag));

    try {
      const response = await fetch('/api/evidence/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        alert('File uploaded successfully!');
        selectedCase = '';
        selectedPoi = '';
        file = null;
        summarize = false;
        tag = false;
      } else {
        const errorData = await response.json();
        alert(`Upload failed: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('An error occurred during file upload.');
    }
  };

  const caseOptions = [
    { value: 'case1', label: 'Case 2023-001' },
    { value: 'case2', label: 'Case 2023-002' },
    { value: 'case3', label: 'Case 2023-003' }
  ];

  const poiOptions = [
    { value: 'poi1', label: 'John Doe' },
    { value: 'poi2', label: 'Jane Smith' },
    { value: 'poi3', label: 'Criminal X' }
  ];
</script>

<div class="nier-bits-card">
  <div class="nier-bits-yorha-panel-header">
    <h3>Automatic File Upload</h3>
  </div>
  <div class="nier-bits-card-body">
    <div class="mb-3">
      <label for="caseSelect" class="form-label">Select Case:</label>
      <SelectBits id="caseSelect" bind:selected={selectedCase} options={caseOptions} />
    </div>
    <div class="mb-3">
      <label for="poiSelect" class="form-label">Select POI (Optional):</label>
      <SelectBits id="poiSelect" bind:selected={selectedPoi} options={poiOptions} />
    </div>
    <div class="mb-3">
      <label for="fileInput" class="form-label">Upload File:</label>
      <input type="file" id="fileInput" class="form-control" onchange={handleFileChange} />
    </div>
    <div class="mb-3">
      <label class="flex items-center">
        <Checkbox id="summarizeCheckbox" bind:checked={summarize} />
        <span>Summarize with AI</span>
      </label>
    </div>
    <div class="mb-3">
      <label class="flex items-center">
        <Checkbox id="tagCheckbox" bind:checked={tag} />
        <span>Tag with AI</span>
      </label>
    </div>
    <button class="btn nes-btn" onclick={handleSubmit}>Upload</button>
  </div>
</div>

<style>
  .nier-bits-card {
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    padding: 1.5rem;
  }

  .nier-bits-yorha-panel-header {
    border-bottom: 1px solid #eee;
    padding-bottom: 1rem;
    margin-bottom: 1rem;
  }

  .nier-bits-yorha-panel-header h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #333;
  }

  .nier-bits-card-body {
    padding-top: 0.5rem;
    display: block;
  }

  .form-label {
    font-weight: bold;
    margin-bottom: 0.5rem;
    display: block;
  }

  .form-control {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }

  .btn.nes-btn {
    background-color: #007bff;
    color: #fff;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
  }

  .btn.nes-btn:hover {
    background-color: #0056b3;
  }

  .mb-3 {
    margin-bottom: 1rem;
  }

  .flex {
    display: flex;
  }

  .items-center {
    align-items: center;
  }
</style>
