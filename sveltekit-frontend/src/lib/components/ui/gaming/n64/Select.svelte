<!--
  N64 Select Component
  Advanced 3D select with layered dropdown
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { GamingComponentProps, N64RenderingOptions } from '../types/gaming-types';
  import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants';

  interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
    group?: string;
  }

  interface Props {
    options?: SelectOption[];
    value?: string;
    placeholder?: string;
    name?: string;
    id?: string;
    required?: boolean;
    multiple?: boolean;
    searchable?: boolean;
    clearable?: boolean;
    disabled?: boolean;
    loading?: boolean;

    // N64 Props
    era?: string;
    variant?: string;
    size?: string;
    animationStyle?: string;
    renderOptions?: Partial<N64RenderingOptions>;
    meshComplexity?: 'low' | 'medium' | 'high' | 'ultra';
    materialType?: 'basic' | 'phong' | 'pbr';
    enableTextureFiltering?: boolean;
    enableMipMapping?: boolean;
    enableFog?: boolean;
    enableLighting?: boolean;
    enableReflections?: boolean;
    enableDropdownBlur?: boolean;
    depth?: number;
    perspective?: number;
    dropdownDepth?: number;
    enableParticles?: boolean;
    glowIntensity?: number;
    enableSpatialAudio?: boolean;
    enableHoverPreview?: boolean;

    // State
    error?: string;
    success?: string;
    class?: string;

    // Events
    onchange?: (value: string, option: SelectOption | undefined) => void;
  }

  let {
    options = [],
    value = $bindable(''),
    placeholder = 'Select an option...',
    name,
    id,
    required = false,
    multiple = false,
    searchable = false,
    clearable = false,
    disabled = false,
    loading = false,

    era = 'n64',
    variant = 'primary',
    size = 'medium',
    animationStyle = 'smooth',
    renderOptions = {},
    meshComplexity = 'medium',
    materialType = 'phong',
    enableTextureFiltering = true,
    enableMipMapping = false,
    enableFog = true,
    enableLighting = true,
    enableReflections = false,
    enableDropdownBlur = true,
    depth = 8,
    perspective = 1000,
    dropdownDepth = 16,
    enableParticles = false,
    glowIntensity = 0.3,
    enableSpatialAudio = true,
    enableHoverPreview = true,
    error,
    success,
    class: className = '',

    onchange
  }: Props = $props();

  let isOpen = $state(false);
  let isFocused = $state(false);
  let isHovered = $state(false);
  let searchTerm = $state('');

  let selectedOption = $derived(options.find(opt => opt.value === value));
  let displayText = $derived(selectedOption?.label || placeholder);

  let filteredOptions = $derived(
      searchable && searchTerm
      ? options.filter(opt => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
      : options
  );

  const effectiveRenderOptions = {
    ...N64_TEXTURE_PRESETS.balanced,
    enableTextureFiltering,
    enableMipMapping,
    enableFog,
    ...renderOptions
  };

  function toggleDropdown() {
      if (disabled || loading) return;
      isOpen = !isOpen;
      if (!isOpen) searchTerm = '';
  }

  function selectOption(option: SelectOption) {
      if (option.disabled) return;
      value = option.value;
      isOpen = false;
      searchTerm = '';
      onchange?.(value, option);
  }

  function clearSelection(e: MouseEvent) {
      e.stopPropagation();
      value = '';
      onchange?.('', undefined);
  }

  function handleOutsideClick(e: MouseEvent) {
      // Simple outside click handler would go here (need ref)
  }

</script>

<div class="n64-select-container {className}">
  <button
    type="button"
    class="n64-select {materialType} mesh-{meshComplexity}"
    class:open={isOpen}
    class:focused={isFocused}
    class:hovered={isHovered}
    class:disabled
    class:error={!!error}
    class:success={!!success}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    onclick={toggleDropdown}
    onfocus={() => isFocused = true}
    onblur={() => isFocused = false}
    onmouseenter={() => isHovered = true}
    onmouseleave={() => isHovered = false}
  >
    <div class="select-value" class:placeholder={!selectedOption}>
      {displayText}
    </div>

    <div class="select-actions">
        {#if clearable && value}
            <span class="clear-icon" onclick={clearSelection} role="button" tabindex="0">×</span>
        {/if}
        <span class="arrow-icon" class:rotated={isOpen}>▼</span>
    </div>
  </button>

  {#if isOpen}
    <div class="select-dropdown" class:blur={enableDropdownBlur}>
        {#if searchable}
            <input
                type="text"
                class="search-input"
                bind:value={searchTerm}
                placeholder="Search..."
                onclick={(e) => e.stopPropagation()}
            />
        {/if}

        <div class="options-list">
            {#each filteredOptions as option}
                <button
                    type="button"
                    class="select-option"
                    class:selected={option.value === value}
                    class:disabled={option.disabled}
                    onclick={(e) => { e.stopPropagation(); selectOption(option); }}
                >
                    {option.label}
                </button>
            {/each}

            {#if filteredOptions.length === 0}
                <div class="no-options">No options found</div>
            {/if}
        </div>
    </div>
  {/if}

  {#if error || success}
    <div class="select-message" class:error={!!error} class:success={!!success}>
      {error || success}
    </div>
  {/if}
</div>

<style>
  .n64-select-container {
    position: relative;
    font-family: 'Rajdhani', sans-serif;
  }

  .n64-select {
    width: 100%;
    background: #2d3748;
    color: white;
    border: 2px solid #4a5568;
    border-radius: 4px;
    padding: 12px 16px;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    text-align: left;
  }

  .n64-select:focus {
    border-color: #4a90e2;
    outline: none;
  }

  .select-value.placeholder {
      opacity: 0.6;
  }

  .select-actions {
      display: flex;
      gap: 8px;
  }

  .arrow-icon {
      font-size: 0.8em;
      transition: transform 0.2s;
  }

  .arrow-icon.rotated {
      transform: rotate(180deg);
  }

  .select-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: #2d3748;
    border: 2px solid #4a5568;
    border-top: none;
    border-radius: 0 0 4px 4px;
    z-index: 100;
    max-height: 250px;
    overflow-y: auto;
    box-shadow: 0 4px 6px rgba(0,0,0,0.2);
  }

  .search-input {
      width: 100%;
      padding: 8px;
      background: #1a202c;
      border: none;
      border-bottom: 1px solid #4a5568;
      color: white;
      outline: none;
  }

  .select-option {
      width: 100%;
      padding: 10px 16px;
      text-align: left;
      background: transparent;
      border: none;
      color: white;
      cursor: pointer;
  }

  .select-option:hover {
      background: #4a5568;
  }

  .select-option.selected {
      background: #2b6cb0;
  }

  .select-option.disabled {
      opacity: 0.5;
      cursor: not-allowed;
  }

  .select-message {
    font-size: 0.8em;
    margin-top: 4px;
  }

  .select-message.error { color: #dc3545; }
</style>
