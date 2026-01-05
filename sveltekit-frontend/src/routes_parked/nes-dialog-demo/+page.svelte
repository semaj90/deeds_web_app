<script lang="ts">
 let dialog: HTMLDialogElement = $state();

 function openDialog() {
 dialog?.showModal();
 }

 function closeDialog() {
 dialog?.close();
 }
</script>

<svelte:head>
 <title>NES.css Dialog Demo</title>
</svelte:head>

<div class="center-container">
 <button type="button" class="nes-btn is-primary" onclick={ openDialog }>
 Open Dialog
 </button>
</div>

<dialog bind:this={dialog} class="nes-dialog">
 <form method="dialog">
 <h2 class="nes-text is-primary">Dialog Title</h2>

 <div class="nes-grid-3">
 <div class="nes-container is-rounded">
 <p>Column 1</p>
 <p>Content here</p>
 </div>

 <div class="nes-container is-rounded">
 <p>Column 2</p>
 <p>Content here</p>
 </div>

 <div class="nes-container is-rounded">
 <p>Column 3</p>
 <p>Content here</p>
 </div>
 </div>

 <menu class="dialog-menu">
 <button type="button" class="nes-btn" onclick={closeDialog}>Cancel</button>
 <button type="submit" class="nes-btn is-primary">Confirm</button>
 </menu>
 </form>
</dialog>

<style>
 .center-container {
 display: flex;
 justify-content: center;
 align-items: center;
 min-height: 100vh;
 }

 dialog::backdrop {
 backdrop-filter: blur(4px);
 background: rgba(0, 0, 0, 0.5);
 }

 .dialog-menu {
 display: flex;
 gap: 1rem;
 justify-content: flex-end;
 margin-top: 2rem;
 padding: 0;
 }

 .nes-grid-3 {
 gap: 1rem;
 margin: 1.5rem 0;
 }
</style>
