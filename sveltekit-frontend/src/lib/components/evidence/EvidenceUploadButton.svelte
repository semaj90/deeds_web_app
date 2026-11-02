<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';
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

<button type="button" class="dossier-upload-btn" onclick={openModal}>
  <Icon name="yorha-evidence" size={13} class="shrink-0 text-[#FFE59A]" />
  <span>Ingest Exhibit</span>
  <span class="dossier-upload-arrow" aria-hidden="true">+</span>
</button>

<EvidenceUploadModal {caseId} isOpen={isModalOpen} onClose={closeModal} onSuccess={handleSuccess} />

<style>
  .dossier-upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 5px 0 13px;
    background: #1F1B18;
    color: #FFFDF9;
    border: 1px solid #3D342E;
    border-radius: 9999px;
    font-family: 'Inter', 'InterLocal', system-ui, -apple-system, sans-serif;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    cursor: pointer;
    box-shadow: 0 6px 16px -6px rgba(31, 27, 24, 0.28);
    transition: all 0.16s ease;
  }

  .dossier-upload-btn:hover {
    background: #332A25;
    transform: translateY(-1px);
  }

  .dossier-upload-btn:active {
    transform: translateY(0);
  }

  .dossier-upload-arrow {
    width: 24px;
    height: 24px;
    border-radius: 9999px;
    background: #FFE59A;
    color: #1F1B18;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: 700;
    line-height: 1;
    flex-shrink: 0;
  }
</style>
