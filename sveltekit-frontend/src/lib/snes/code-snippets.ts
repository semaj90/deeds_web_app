/** Copyable, valid examples. Not advertised as full-source exports. */
export const svelteUsage = `<script lang="ts">
  import SnesBookLoader from '$lib/components/ui/SnesBookLoader.svelte';
</script>

<SnesBookLoader
  label="NOW LOADING"
  sublabel="RECONCILING DRIZZLE & FEATURE GRIMOIRE..."
  showControls={true}
  telemetry={undefined}
  progress={null}
  query={null}
  stage={null}
/>

<!-- Search mode: progress 0-100 sets the texture level of detail; query shows a glyph line; stage names the step. -->
<!-- <SnesBookLoader progress={42} query="negligence duty of care" stage="SEARCHING STATUTES" /> -->

`;

export const htmlMini = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pixel loading bar</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center;
    background:#110926; color:#eee2ff; font:12px monospace; }
  .frame { width:min(80vw,360px); height:36px; box-sizing:border-box;
    background:#090314; padding:5px; border:4px solid #d8b4fe;
    box-shadow:4px 4px #3b0764; }
  .fill { width:100%; height:100%;
    background:linear-gradient(-45deg,#6b2cf5 25%,#d8b4fe 25% 50%,
      #6b2cf5 50% 75%,#d8b4fe 75%);
    background-size:32px 32px; animation:scroll .75s linear infinite;
    box-shadow:inset 0 3px #ffffff70,inset 0 -3px #2e1065; }
  @keyframes scroll { to { background-position:32px 0; } }
  @media(prefers-reduced-motion:reduce){ .fill { animation:none; } }
</style>
<main><div class="frame"><div class="fill"></div></div>
  <p style="text-align:center;margin-top:22px">NOW LOADING...</p></main>
</html>`;
