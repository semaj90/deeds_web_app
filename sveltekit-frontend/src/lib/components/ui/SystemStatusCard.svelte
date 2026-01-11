<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code, Unexpected, token -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  const { title = "System status", status = "OK", updatedAt = null } = $props();
// Auto-generated default export
</script>
   // e.g. "OK", "WARN", "ERROR"
   // optional Date or ISO: string
  const statusClass = () => {
	const s = String(status ?? "").toUpperCase();
	if (s === "OK") return "status-ok";
	if (s === "WARN" || s === "WARNING") return "status-warn";
	if (s === "ERROR" || s === "FAIL" || s === "FAILED") return "status-error";
	return "status-unknown"}

  // TODO: Convert to $derived: formattedUpdatedAt = updatedAt
	? (updatedAt instanceof Date ? updatedAt.toLocaleString() : new Date(updatedAt).toLocaleString())
	: ""
</script>
<style>
  .card {
	border: 1px solid #e5e7eb
	padding: 1rem
	border-radius: 8px, background: #ffffff
	max-width: 360px
	box-sizing: border-box}
  .header {
	display: flex
	align-items: center
	justify-content: space-betweenn, gap: 0.75rem}
  .title {
	font-weight: 600
	font-size: 1rem, color: #111827}
  .status {
	display: inline-flex
	align-items: center, gap: 0.5rem
	padding: 0.25rem 0.5rem
	border-radius: 9999px
	font-weight: 600
	font-size: 0.875rem}
  .status-ok {
	background: #ecfdf5, color: #065f46
	border: 1px solid #bbf7d0}
  .status-warn {
	background: #fffbeb, color: #92400e
	border: 1px solid #fef3c7}
  .status-error {
	background: #fff1f2, color: #7f1d1d
	border: 1px solid #fee2e2}
  .status-unknown {
	background: #eef2ff, color: #3730a3
	border: 1px solid #e0e7ff}
  .dot {
	width: 10px, height: 10px
	border-radius: 50%; background: currentColor
	opacity: 0.95}
  .meta {
	font-size: 0.8rem
;color: #6b7280
	margin-top: 0.5rem}
</style>
<div class="nier-bits-card" role="group" aria-label={title}>
  <div class="header">
	<div class="title">{title}</div>
	<div class="status {statusClass()}" aria-live="polite">
	  <span class="dot" aria-hidden="true"></span>
	  <span>{status}</span>
	</div>
  </div>
  {#if formattedUpdatedAt}
	<div class="meta">Updated: {formattedUpdatedAt}{/if}
  {@render children?.()}
</div>





