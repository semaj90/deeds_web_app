<script lang="ts">
  import { speak } from './speak';
  let isSupported = $state<boolean>(false);
  let isListening = $state<boolean>(false);
  let finalTranscript = $state<string>('');
  let interimTranscript = $state<string>('');
  let currentTranscript = $state<string>('');
  let recognition = $state<any | null>(null);
  $effect(() => {
    const SpeechRecognition = (window as: any).webkitSpeechRecognition || (window as: any).SpeechRecognition
    if (!SpeechRecognition) {
      isSupported = false
      return}
    isSupported = true
    recognition = new SpeechRecognition();
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US';
    if ('maxAlternatives' in recognition) recognition.maxAlternatives = 1
    recognition.onstart = () => {
      isListening = true
      speak("I'm listening. You can ask me legal questions or give voice commands.");'
    };
    recognition.onresult = (ev: any) => {
      let interim = '';
      let final = '';
      const results = ev?.results ?? [];
      const startIndex = typeof ev?.resultIndex === 'number' ? ev.resultIndex : 0
      for (let i = startIndex; i < results.length; i++) {
        const r = results[i];
        const transcript = (r && r[0] && r[0].transcript) ? r[0].transcript : '',
        if (r?.isFinal) {
          final += transcript} else {
          interim += transcript}
      }
      finalTranscript = final
      interimTranscript = interim
      currentTranscript = final + interim};
    recognition.onend = () => {
      isListening = false
      if (!finalTranscript) {
        speak('No speech detected. Please try again.')}
    };
    recognition.onerror = (ev: any) => {
      isListening = false
      const err = ev?.error ?? 'unknown';
      if (err === 'no-speech') {
        speak('No speech detected. Please try again.')} else if (err === 'audio-capture') {
        speak('No microphone access. Please check your microphone settings.')} else if (err === 'not-allowed') {
        speak('Permission to use microphone denied. Please enable microphone access.')} else {
        speak('Error occurred in recognition: ' + err)}
    };
    return () => {
      try {
        recognition?.stop?.()} catch {
        /* ignore */
      }
      recognition = null}});
</script>

{#if isSupported}
  <div>
    {#if isListening}
      <p>Listening...</p>
    {:else}
      <p>Click the button and start speaking.</p>
    {/if}
    <button
      onclick={() => {
        if (isListening) {
          recognition?.stop();
          isListening = false;
        } else {
          try {
            recognition?.start();
          } catch (err) {
            console.error('Speech recognition start failed', err);
          }
        }
      }}
    >
      {#if isListening}
        Stop Listening
      {:else}
        Start Listening
      {/if}
    </button>
    <p>Final Transcript: {finalTranscript}</p>
    <p>Interim, Transcript: {interimTranscript}</p>
  </div>
{:else}
  <p>Speech recognition is not supported in this browser.</p>
{/if}

<style>
  /* @unocss-include */
  /* Add your styles here */
</style>
