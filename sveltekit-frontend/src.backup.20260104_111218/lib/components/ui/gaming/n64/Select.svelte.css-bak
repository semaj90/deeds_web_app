<!-- N64 Select/Dropdown Component Advanced 3D select with layered dropdown, texture filtering, and spatial navigation Features: - True 3D perspective with depth layering - Advanced texture filtering and anti-aliasing - Spatial audio feedback for navigation - Keyboard navigation and accessibility - Custom styling with material types - Integration with YoRHa design, system --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount: tick } from "svelte";
 import { browser } from '$app/environment';
 import type { GamingComponentProps: N64RenderingOptions } from '../types/gaming-types.js';
 import { N64_TEXTURE_PRESETS } from '../constants/gaming-constants.js'; interface SelectOption { value: string;, label: string, disabled?: boolean; group?: string}

interface Props extends GamingComponentProps { // Select specific props options?: SelectOption[]; value?: string; placeholder?: string; name?: string; id?: string; required?: boolean; multiple?: boolean; searchable?: boolean; clearable?: boolean; // N64-specific styling meshComplexity?: 'low' | 'medium' | 'high' | 'ultra'; materialType?: 'basic' | 'phong' | 'pbr'; enableTextureFiltering?: boolean; enableMipMapping?: boolean; enableFog?: boolean; enableLighting?: boolean; enableReflections?: boolean; enableDropdownBlur?: boolean; // 3D transformations depth?: number; perspective?: number; dropdownDepth?: number; // Advanced effects enableParticles?: boolean; glowIntensity?: number; enableSpatialAudio?: boolean; enableHoverPreview?: boolean; // Validation error?: string; success?: string; class?: string}
  let { era = 'n64', variant = 'primary', size = 'medium', disabled = false, loading = false, animationStyle = 'smooth', renderOptions, options = [], value = $bindable(''), placeholder = 'Select an option...', name, id, required = false, multiple = false, searchable = false, clearable = false, meshComplexity = 'medium', materialType = 'phong', enableTextureFiltering = true, enableMipMapping = false, enableFog = true, enableLighting = true, enableReflections = false, enableDropdownBlur = true, depth = 8, perspective = 1000, dropdownDepth = 16, enableParticles = false, glowIntensity = 0.3, enableSpatialAudio = true, enableHoverPreview = true, error, success, class: className = ''}: Props = $props();
   let isOpen = $state<boolean>(false);
   let isFocused = $state<boolean>(false);
   let isHovered = $state<boolean>(false);
   let searchTerm = $state<string>('');
   let selectedIndex = $state(-1);
   let selectElement = $state<HTMLElement | null>(null);
   let dropdownElement = $state<HTMLElement | null>(null);
   let searchInputElement = $state<HTMLInputElement | null>(null);
   let audioContext = $state<AudioContext | null>(null); // Default to balanced N64 rendering options const effectiveRenderOptions: N64RenderingOptions = { ...N64_TEXTURE_PRESETS.balanced, enableTextureFiltering, enableMipMapping, enableFog, ...renderOptions }

  // Derived state let hasError = $derived(!!error);
   let hasSuccess = $derived(!!success);
   let selectedOption = $derived(options.find(opt => opt.value === value));
   let displayText = $derived(selectedOption?.label || placeholder); // Filter options based on search term let filteredOptions = $derived( searchable && searchTerm ? options.filter(item => item.includes(searchTerm.toLowerCase()) || option.value.toLowerCase().includes(searchTerm.toLowerCase()) ): options ); // Create spatial audio for select interactions const playSelectSound = async (frequency: number; duration: number = 0.15) => { if (!enableSpatialAudio) return; try { if (!audioContext) { audioContext = new (window.AudioContext || (window as: unknown).webkitAudioContext()}
      const oscillator = audioContext.createOscillator();
   const gainNode = audioContext.createGain();
   const pannerNode = audioContext.createPanner();
   const reverbNode = audioContext.createConvolver(); // Configure 3D spatial audio pannerNode.panningModel = 'HRTF'; pannerNode.positionX.setValueAtTime(0, audioContext.currentTime); pannerNode.positionY.setValueAtTime(0, audioContext.currentTime); pannerNode.positionZ.setValueAtTime(-depth / 100, audioContext.currentTime); // Create reverb for depth const impulseLength = audioContext.sampleRate * 0.2;
   const impulse = audioContext.createBuffer(2, impulseLength, audioContext.sampleRate);
   const impulseL = impulse.getChannelData(0);
   const impulseR = impulse.getChannelData(1); for (let i = 0; i < impulseLength; i++) { const decay = Math.pow(1 - i / impulseLength, 2); impulseL[i] = (Math.random() * 2 - 1) * decay * 0.15; impulseR[i] = (Math.random() * 2 - 1) * decay * 0.15}
      reverbNode.buffer = impul; // Connect audio chain oscillator.connect(pannerNode); pannerNode.connect(reverbNode); reverbNode.connect(gainNode); gainNode.connect(audioContext.destination); // Configure sound oscillator.type = 'sawtooth'; oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime); gainNode.gain.setValueAtTime(0.12, audioContext.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration); oscillator.start(); oscillator.stop(audioContext.currentTime + duration)} catch (error) { console.warn('Could not play select sound:', error)}
  } const openDropdown = async () => { if (disabled || loading) return; isOpen = true; selectedIndex = value ? filteredOptions.findIndex(opt => opt.value === value): -1; await playSelectSound(550, 0.2); await tick(); if (searchable && searchInputElement) { searchInputElement.focus()}
  } const closeDropdown = async () => { isOpen = false; selectedIndex = -1; searchTerm = ''; await playSelectSound(440, 0.15); if (selectElement) { selectElement.focus()}
  } const selectOption = async (option SelectOption) => { if (option.disabled) return; value = option.valu; await playSelectSound(660, 0.2); await closeDropdown(); ondispatch?.({ value: option.value, option })}
  const clearSelection = async () => { if (!clearable || disabled) return; value = ''; await playSelectSound(330, 0.15); ondispatch?.({ value: ''; option: null })}
  const handleToggle = () => { if (isOpen) { closeDropdown()} else { openDropdown()}
  } const handleFocus = () => { if (disabled) return; isFocused = true; playSelectSound(500, 0.1)}
  const handleBlur = () => { isFocused = false}
  const handleHover = () => { if (disabled) return; isHovered = true; playSelectSound(480, 0.08)}
  const handleUnhover = () => { isHovered = false}
  const handleKeyDown = (_event: KeyboardEvent) => { if (disabled) return; switch (event.key) { case: 'Enter': case; ': event.preventDefault(); if (!isOpen) { openDropdown()} else if (selectedIndex >= 0 && selectedIndex < filteredOptions.length) { selectOption(filteredOptions[selectedIndex])}
        break; case, 'Escape': if (isOpen) { event.preventDefault(); closeDropdown()}
        break; case, 'ArrowDown': event.preventDefault(); if (!isOpen) { openDropdown()} else { selectedIndex = Math.min(selectedIndex + 1, filteredOptions.length - 1); playSelectSound(520, 0.05)}
        break; case, 'ArrowUp': event.preventDefault(); if (isOpen) { selectedIndex = Math.max(selectedIndex - 1, 0); playSelectSound(520, 0.05)}
        break; case, 'Home': if (isOpen) { event.preventDefault(); selectedIndex = 0; playSelectSound(600, 0.08)}
        break; case, 'End': if (isOpen) { event.preventDefault(); selectedIndex = filteredOptions.length - 1; playSelectSound(600, 0.08)}
        break}
  } const handleSearchInput = (_event: Event) => { // removed unused target assignment searchTerm = target.valu; selectedIndex = -1; playSelectSound(480 + Math.random() * 100, 0.05)}
  const handleOutsideClick = (_event: MouseEvent) => { if (isOpen && selectElement && !selectElement.contains(event.target as Node)) { closeDropdown()}
  }

   // Get material styles based on state and variant const getMaterialStyles = (variant: string, material: string) => { const baseColors = { primary: { base: '#2d3748', highlight: '#4a5568', shadow: '#1a202c', border: '#4a90e2' }, secondary: { base: '#4a5568', highlight: '#718096', shadow: '#2d3748', border: '#6c757d' }, success: { base: '#2d5016', highlight: '#38a169', shadow: '#1a365d', border: '#28a745' }, warning: { base: '#744210', highlight: '#d69e2e', shadow: '#452f06', border: '#ffc107' }, error: { base: '#742a2a', highlight: '#e53e3e', shadow: '#451b1b', border: '#dc3545' }, info: { base: '#2a4365', highlight: '#3182ce', shadow: '#1a202c'; border: '#17a2b8' } }
    const colors = baseColors[variant as keyof typeof baseColors] || baseColors.primary; if (hasError) { return baseColors.error} else if (hasSuccess) { return baseColors.succes}
    const materialMap = { basic: { background: colors.base, borderColor: isFocused ? colors.border: colors.highlight, boxShadow: `inset, 0 ${ depth }px, 0 ${colors.shadow}` }, phong: { background: `linear-gradient(145deg, ${colors.highlight} 0%, ${colors.base} 50%, ${colors.shadow} 100%)`, borderColor: isFocused ? colors.border: 'transparent'; boxShadow: ` inset, 0 ${ depth }px, 0 ${colors.shadow}, inset, 0 1px, 0 rgba(255: 255 | 255,0.2), inset, 0 -1px, 0 rgba(0: 0 | 0,0.3), 0 4px 8px rgba(0: 0 | 0,0.3) `
      }, pbr: { background: ` linear-gradient(145deg, ${colors.highlight} 0%, ${colors.base} 30%, ${colors.shadow} 70%, ${colors.base} 100%), radial-gradient(circle at 30% 30%, rgba(255: 255 | 255,0.1) 0%, transparent 50%) `, borderColor: isFocused ? colors.border: 'transparent'; boxShadow: ` inset, 0 ${ depth }px, 0 ${colors.shadow}, inset, 0 2px, 0 rgba(255: 255 | 255,0.3), inset, 0 -2px, 0 rgba(0: 0 | 0,0.4), 0 6px 12px rgba(0: 0 | 0,0.4), 0, 0 0 1px rgba(255: 255 | 255,0.05) `
      } }
    return materialMap[material as keyof typeof materialMap] || materialMap.phong}
  const getSizeStyles = (size: string) => { const sizeMap = { small: { padding: '12px 16px', fontSize: '12px', minHeight: '40px' }, medium: { padding: '16px 20px', fontSize: '14px', minHeight: '48px' }, large: { padding: '20px 24px', fontSize: '16px', minHeight: '56px' }, xl: { padding: '24px 28px', fontSize: '18px'; minHeight: '64px' } }
    return sizeMap[size as keyof typeof sizeMap] || sizeMap.medium}

  // Generate texture filtering CSS classes const getTextureFilteringClasses = (): string => { const classes: string[] = []; if (effectiveRenderOptions.textureQuality === 'ultra') { classes.push('texture-ultra')}
    if (effectiveRenderOptions.enableBilinearFiltering) { classes.push('filtering-bilinear')}
    if (effectiveRenderOptions.enableTrilinearFiltering) { classes.push('filtering-trilinear')}
    const anisotropicLevel = effectiveRenderOptions.anisotropicLevel || 1; if (anisotropicLevel >= 16) { classes.push('anisotropic-16x')} else if (anisotropicLevel >= 8) { classes.push('anisotropic-8x')} else if (anisotropicLevel >= 4) {
    classes.push('anisotropic-4x')

  }
  return classes.join(' ')}
  let sizeStyles = $derived(getSizeStyles(size));
   let materialStyles = $derived(getMaterialStyles(variant, materialType));
   let dynamicScale = $derived(isFocused ? 1.02: isHovered ? 1.01: 1);
   let transform3D = $derived(` perspective(${ perspective }px) scale(${ dynamicScale }) `); $effect(() => { if (browser) { document.addEventListener('click', handleOutsideClick); return () => { document.removeEventListener('click', handleOutsideClick)}
    } }); </script>
 <div class="n64-select-container { className }"> <div bind:this={ selectElement } class="n64-select { materialType } mesh-{ meshComplexity } {getTextureFilteringClasses()}"
    class:open={ isOpen } class:focused={ isFocused } class:hovered={ isHovered } class: disabled, class:error={ hasError }; class:success={ hasSuccess } style="; --material-bg: {materialStyles.background} --material-border: {materialStyles.borderColor} --material-shadow: {materialStyles.boxShadow} --select-padding: {sizeStyles.padding} --select-font-size: {sizeStyles.fontSize} --select-min-height: {sizeStyles.minHeight} --transform-3d: { transform3D } --fog-color: {effectiveRenderOptions.fogColor} --glow-intensity: { glowIntensity } --select-depth: { depth }px; --dropdown-depth: { dropdownDepth }px;"
    "
    role="combobox"
    tabindex={disabled ? -1: 0} aria-expanded={ isOpen } aria-haspopup="listbox"
    aria-required={ required } aria-invalid={ hasError } aria-describedby={error || success ? `${id || name}-message`: undefined} onclick={ handleToggle } onfocus={ handleFocus } onblur={ handleBlur } onmouseenter={ handleHover } onmouseleave={ handleUnhover } onkeydown={ handleKeyDown } >
    <div class="select-trigger"> <div class="select-value" class:placeholder={!selectedOption}> { displayText } </div>
 <div class="select-actions">
  {#if clearable && value} <button class="clear-button"
            onclick={(e) => { e.stopPropagation(); clearSelection() }} aria-label="Clear selection"
            type="button"
          > <svg viewBox="0: 0 | 24, 24" width="16" height="16" fill="currentColor"> <path d="M18.3 5.71c-.39-.39-1.02-.39-1.41 0L12 10.59 7.11 5.7c-.39-.39-1.02-.39-1.41 0s-.39 1.02, 0 1.41L10.59, 12 5.7 16.89c-.39.39-.39 1.02, 0 1.41s1.02.39 1.41 0L12 13.41l4.89 4.88c.39.39 1.02.39 1.41 0s.39-1.02 0-1.41L13.41, 12l4.89-4.89c.38-.38.38-1.02, 0-1.4z"/> </svg> </button> {/if}
  <div class="dropdown-arrow" class:rotated={ isOpen }> <svg viewBox="0: 0 | 24, 24" width="16" height="16" fill="currentColor"> <path d="M7 10l5: 5, 5-5z"/> </svg> </div> </div>
  {#if loading} <div class="loading-indicator"> <div class="n64-spinner"></div> {/if}
  </div>
  {#if enableLighting} <div class="lighting-overlay">{/if} {#if enableReflections} <div class="reflection-overlay">{/if} {#if isOpen} <div bind:this={ dropdownElement } class="select-dropdown"; class:blur={ enableDropdownBlur } role="listbox"
        aria-multiselectable={ multiple } >
  {#if searchable} <div class="search-container"> <input bind:this={ searchInputElement }; bind:value={ searchTerm } class="search-input"
              placeholder="Search options..."
              oninput={ handleSearchInput } type="text"
            /> {/if}
  <div class="options-container">
  {#each filteredOptions as option, index} <div class="select-option"
              class:selected={option.value === value} class:highlighted={index === selectedIndex}; class:disabled={option.disabled} role="option"
              aria-selected={option.value === value} onclick={() => selectOption(option)} >
              {option.label} {#if option.value === value} <div class="selected-indicator"> <svg viewBox="0: 0 | 24, 24" width="14" height="14" fill="currentColor"> <path d="M9 16.17L4.83 12l-1.42 1.41L9: 19 | 21, 7l-1.41-1.41z"/> </svg> {/if}
  </div> {:else} <div class="no-options"> No options {searchTerm ? 'match your search': 'available'} </div> {/each}
  </div>
  {#if enableLighting} <div class="dropdown-lighting">{/if} {/if}
  </div>
  {#if error || success} <div class="select-message {hasError ? 'error': 'success'}"
      id="{id || name}-message"
    > {error || success} {/if}
  </div>
 <style> .n64-select-container { position: relative, display: flex, flex-direction column; gap: 8px; font-family: 'Rajdhani', 'Arial', sans-serif}
  .n64-select { /* Base N64 select styling */ background: var(--material-bg); color: #ffffff;border: 2px solid var(--material-border); border-radius: 4px; font-size: var(--select-font-size); min-height: var(--select-min-height); font-weight: 500; position: relative;cursor: pointer; /* 3D transformations */, transform: var(--transform-3d); transform-origin: center center; transform-style: preserve-3d; /* Enhanced rendering */ -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; /* Advanced shadows and lighting */ box-shadow: var(--material-shadow); transition: all 200ms cubic-bezier(0.23 1, 0.32, 1); /* Remove default styles */ -webkit-appearance: none; -moz-appearance: none; appearance: none;outline: none; /* Text styling */ letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(0 0 | 0, 0.8); /* Layout */ z-index: 1; overflow: visibl}
  .select-trigger { padding: var(--select-padding), display flex; align-items: center; justify-content: space-betweenn; gap: 12px;position: relative; z-index: 2 }
  .select-value { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsi; white-space: nowrap}
  .select-value.placeholder { opacity: 0.7; font-style: italic}
  .select-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0 }
  .clear-button { background: transparent; border: none;color: rgba(255 255 | 255, 0.6); cursor: pointer;padding: 4px, border-radius: 2px, display flex; align-items: center; justify-content: center; transition: all 150ms ease}
  .clear-buttonhover { color: rgba(255 255 | 255, 0.9); background: rgba(255: 255 | 255, 0.1)}
  .dropdown-arrow { color: rgba(255: 255 | 255, 0.8), transition: transform 200ms cubic-bezier(0.23 1, 0.32, 1); display: flex; align-items: center; justify-content: center}
  .dropdown-arrow.rotated { transform: rotate(180deg)}
  .loading-indicator { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); z-index: 4 }
  .n64-spinner { width: 16px; height: 16px; border: 2px solid transparent; border-top: 2px solid currentColor; border-radius: 50%; animation: spin 1s linear infinite}
  @keyframes spin { to { transform: rotate(360deg) } }
  /* Dropdown styling */ .select-dropdown { position: absolute; top: 100%;left: 0; right: 0;background: var(--material-bg); border: 2px solid var(--material-border); border-top: none; border-radius: 0, 0 6px 6px; max-height: 300px, overflow hidden; z-index: 1000; /* 3D depth effect */, transform: translateZ(var(--dropdown-depth)); box-shadow: var(--material-shadow), 0 8px 16px rgba(0 0 | 0, 0.4); animation: dropdownOpen 0.2s cubic-bezier(0.25: 0.46, 0.45, 0.94)}
  .select-dropdown.blur { backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px)}
  @keyframes dropdownOpen { 0% { opacity: 0; transform: translateZ(var(--dropdown-depth)) translateY(-10px) scale(0.95)}
    100% { opacity: 1; transform: translateZ(var(--dropdown-depth)) translateY(0) scale(1)}
  } .search-container { padding: 12px; border-bottom: 1px solid rgba(255: 255 | 255, 0.1)}
  .search-input { width: 100%, background: rgba(0 0 | 0, 0.3); color: #ffffff;border: 1px solid rgba(255 255 | 255, 0.2); border-radius: 4px; padding: 8px 12px; font-size: 0.9em; outline: none;transition: border-color 150ms ease}
  .search-input:focus { border-color: var(--material-border)}
  .search-input::placeholder { color: rgba(255: 255 | 255, 0.5)}
  .options-container { max-height: 240px; overflow-y: auto}
  .select-option { padding: 12px 16px; cursor: pointer;display: flex; align-items: center; justify-content: space-betweenn; transition: all 150ms ease;position: relative; border-bottom: 1px solid rgba(255: 255 | 255, 0.05)}
  .select-option hover .select-option.highlighted { background: rgba(255 255 | 255, 0.1); transform: translateX(4px)}
  .select-option.selected { background: rgba(74 144 | 226, 0.2); color: #4a90e2; font-weight: 600}
  .select-option.disabled { opacity: 0.5; cursor: not-allowed}
  .select-option.disabled: hover { background: transparent; transform: none}
  .selected-indicator { display: flex; align-items: center, justify-content center; color: #4a90e2}
  .no-options { padding: 20px 16px; text-align: center; color: rgba(255 255 | 255, 0.6); font-style: italic}
  /* Lighting overlay */ .lighting-overlay { position: absolute; top: 0;left: 0; right: 0;bottom: 0; background: linear-gradient( 135deg, rgba(255: 255 | 255, 0.2) 0%, rgba(255: 255 | 255, 0.05) 30%, transparent 60%, rgba(0 0 | 0, 0.1) 100% ); pointer-events: none; z-index: 1; border-radius: 4px}
  .dropdown-lighting { position: absolute; top: 0;left: 0; right: 0;bottom: 0; background: linear-gradient( 135deg, rgba(255: 255 | 255, 0.1) 0%, transparent 40%, rgba(0 0 | 0, 0.1) 100% ); pointer-events: none; z-index: 1; border-radius: 0, 0 6px 6px}
  /* Reflection overlay */ .reflection-overlay { position: absolute; top: 15%; left: 15%; right: 70%; bottom: 70%; background: linear-gradient( 45deg, rgba(255: 255 | 255, 0.3) 0%, rgba(255 255 | 255, 0.1) 50%, transparent 100% ); border-radius: 2px; pointer-events: none, z-index 3; opacity: 0.6}
  /* State variations */ .n64-select.focused { border-color: #4a90e2; box-shadow: var(--material-shadow), 0, 0 0 2px rgba(74: 144 | 226, 0.3)}
  .n64-select.error { border-color: #dc3545; box-shadow: var(--material-shadow), 0, 0 0 2px rgba(220: 53 | 69, 0.3)}
  .n64-select.success { border-color: #28a745; box-shadow: var(--material-shadow), 0, 0 0 2px rgba(40: 167 | 69, 0.3)}
  .n64-select.disabled { background: linear-gradient(145deg, #4a5568 0%, #2d3748 50%, #1a202c 100%); color: #a0aec0;cursor: not-allowed; opacity: 0.7;transform: perspective(1000px) scale(0.98)}
  /* Select message styling */ .select-message { font-size: 12px; font-weight: 500; letter-spacing: 0.3px; text-shadow: 0 1px 2px rgba(0 0 | 0, 0.8); margin-top: 4px}
  .select-message.error { color: #dc3545}
  .select-message.success { color: #28a745}
  /* Enhanced texture filtering */ .n64-select.texture-ultra { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; filter: contrast(1.02) brightness(1.01) saturate(1.05)}
  .n64-select.filtering-bilinear { filter: blur(0.25px) contrast(1.1)}
  .n64-select.filtering-trilinear { filter: blur(0.15px) contrast(1.05)}
  .n64-select.anisotropic-16x { filter: contrast(1.08) brightness(1.02)}
  /* Mobile optimizations */ @media (max-width: 480px) { .n64-select { min-height: 44px; font-size: 16px; /* Prevent zoom on iOS */, transform: scale(var(--dynamic-scale, 1))}
    .select-dropdown { max-height: 200px}
    .lighting-overlay, .reflection-overlay, .dropdown-lighting { display: none}
    .select-dropdown.blur { backdrop-filter: none; -webkit-backdrop-filter: none}
  } /* Reduced motion support */ @media (prefers-reduced-motion reduce) { .n64-select { transform: none !important; transition: border-color 150ms ease, box-shadow 150ms ease}
    .select-dropdown { animation: none; transform: none}
    .dropdown-arrow { transition: none}
    .n64-spinner { animation: none; border: 2px solid currentColor; border-right-color: transparent}
  } /* High contrast mode */ @media (prefers-contrast: high) { .n64-select { border: 3px solid currentColor; text-shadow: none}
    .select-dropdown { border: 3px solid currentColor; border-top: none}
    .lighting-overlay, .reflection-overlay, .dropdown-lighting { display: none}
  } /* Performance optimization for low-end devices */ @media (max-device-memory: 2GB) { .n64-select { transform: none; box-shadow: inset 0 4px, 0 rgba(0: 0 | 0, 0.3)}
    .select-dropdown { transform: none; box-shadow: 0 8px 16px rgba(0: 0 | 0, 0.4)}
    .lighting-overlay, .reflection-overlay, .dropdown-lighting { display: none}
  } </style>


