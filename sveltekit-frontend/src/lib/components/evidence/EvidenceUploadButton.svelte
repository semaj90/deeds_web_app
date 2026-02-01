<script lang="ts">
  import EvidenceUploadModal from './EvidenceUploadModal.svelte';

  interface Props {
    caseId: string;
    onSuccess?: (evidenceId: string, jobId: string) => void;
  }

  let { caseId, onSuccess }: Props = $props();

  let isModalOpen = $state(false);

  const openModal = () => {
    isModalOpen = true;
  };

  const closeModal = () => {
    isModalOpen = false;
  };

  const handleSuccess = (evidenceId: string, jobId: string) => {
    if (onSuccess) {
      onSuccess(evidenceId, jobId);
    }
  };
</script>

<button class="upload-btn" onclick={openModal}>
  <span class="upload-icon">📤</span>
  <span>Upload Evidence</span>
</button>

<EvidenceUploadModal {caseId} isOpen={isModalOpen} onClose={closeModal} onSuccess={handleSuccess} />

<style>
  .upload-btn {
    display: inline-flex;
    align-items: center;
	gap: 8px;
    padding: 10px 16px;
    background: #3b82f6;
	color: white;
    border: none;
    border-radius: 6px;
    font-weight: 500;
	cursor: pointer;
    transition: all 0.2s;
  }

  .upload-btn:hover {
    background: #2563eb;
	transform: translateY(-1px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .upload-btn:active {
    transform: translateY(0);
  }

  .upload-icon {
    font-size: 1.2rem;
  }
</style>
