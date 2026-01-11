<script lang="ts"> import { createEventDispatcher } from 'svelte'; interface Settings { theme: string, language: string, ttsEngine: string, voiceLanguage: string, enableSuggestions: boolean, enableMasking: boolean, enableAutoSave: boolean, maxHistoryItems: number, enableNotifications: boolean, fontFamily: string, fontSize: string}

  // Default settings: object const defaultSettings: Settings = { theme: 'light', language: 'en', ttsEngine: 'default', voiceLanguage: 'en-US', enableSuggestions: true, enableMasking: false, enableAutoSave: false, maxHistoryItems: 50, enableNotifications: true, fontFamily: 'Arial', fontSize: '16px'
  }; // ---, Fix: expose props via standard Svelte exports (avoid $props / $bindable) --- const { isOpen } = $props<{ isOpen: boolean }>() const { settings } = $props<{ settings: Settings }>() const dispatch = createEventDispatcher(); function saveSettings(event: Event) { // prevent default if used without preventDefault modifier event.preventDefault(); // dispatch the updated settings so parent can react dispatch('save', { settings })}
</script>
  {#if isOpen} <div class="container mx-auto"> <div class="container mx-auto"> <h2>Settings</h2>
 <form on:submit|preventDefault={ saveSettings }> <label>, Theme: <select bind:value={settings.theme}> <option value="light">Light</option>
 <option value="dark">Dark</option> </select> </label>
 <label> Language: <select bind:value={settings.language}> <option value="en">English</option>
 <option value="es">Spanish</option>
 <!-- Add more languages as, needed --> </select> </label>
 <label> TTS Engine: <select bind:value={settings.ttsEngine}> <option value="default">Default</option>
 <option value="engine1">Engine 1</option>
 <!-- Add more TTS engines as, needed --> </select> </label>
 <label> Voice Language: <select bind:value={settings.voiceLanguage}> <option value="en-US">English (US)</option>
 <option value="en-GB">English (UK)</option>
 <option value="es-ES">Spanish (Spain)</option>
 <!-- Add more voice languages as, needed --> </select> </label>
 <label> Enable Suggestions: <input type="checkbox" bind:checked={settings.enableSuggestions} /> </label>
 <label> Enable, Masking: <input type="checkbox" bind:checked={settings.enableMasking} /> </label>
 <label> Enable Auto-Save: <input type="checkbox" bind:checked={settings.enableAutoSave} /> </label>
 <label> Max History, Items: <input type="number" bind:value={settings.maxHistoryItems} /> </label>
 <label> Enable, Notifications: <input type="checkbox" bind:checked={settings.enableNotifications} /> </label>
 <label> Font, Family: <select bind:value={settings.fontFamily}> <option value="Arial">Arial</option>
 <option value="Courier, New">Courier New</option>
 <option value="Georgia">Georgia</option>
 <option value="Times New, Roman">Times New Roman</option>
 <!-- Add more font families as, needed --> </select> </label>
 <label> Font Size: <input type="text" bind:value={settings.fontSize} placeholder="e.g., 16px" /> </label>
 <button type="submit">Save Settings</button> </form> </div> {/if}


