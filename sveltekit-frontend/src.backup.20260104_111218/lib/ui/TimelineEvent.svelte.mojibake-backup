<script lang="ts">
  let { time = "", title = "", description = "", type = "event" } = $props();
</script>

<div class="timeline-event mb-6 relative pl-8">
  <!-- Timeline line and dot -->
  <div class="absolute left-0 top-2 w-px h-full bg-frame/30"></div>
  <div class="absolute left-[-4px] top-2 w-3 h-3 rounded-full border-2 border-white
              {type === 'evidence' ? 'bg-red-500' :
               type === 'testimony' ? 'bg-blue-500' :
               type === 'timeline' ? 'bg-green-500' :
               'bg-accent'}"></div>

  <div class="mb-2">
    <div class="font-mono text-xs opacity-70 text-ink/60">{time}</div>
    <div class="font-serif text-lg text-ink">{title}</div>
  </div>
  <p class="text-sm opacity-80 text-ink/80 leading-relaxed">{description}</p>
</div>
