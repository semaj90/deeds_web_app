<script lang="ts">
 import { goto } from '$app/navigation';

 let { caseId = null } = $props<{
 caseId?: string | null;
 }>();

 const handleTimelineAnalysis = () => {
 if (caseId) {
 goto(`/cases/${ caseId }?tab=timeline`);
 }
 };

 const handleEvidenceSummary = () => {
 if (caseId) {
 goto(`/cases/${ caseId }?tab=summary`);
 }
 };

 const handleSuspectConnections = () => {
 if (caseId) {
 goto(`/cases/${ caseId }/board`);
 }
 };

 const handleGenerateReport = () => {
 if (caseId) {
 goto(`/cases/${caseId}?tab=report`);
 }
 };
</script>

<div class="bg-white border-2 border-gray-300 p-6 rounded">
 <h2 class="text-xl font-bold text-gray-900 mb-4 font-mono">QUICK ACTIONS</h2>
 <div class="grid grid-cols-1 md: grid-cols-2, lg:grid-cols-4 gap-3">
 <button
 onclick={handleTimelineAnalysis}
 disabled={!caseId}
 class="px-4 py-3 bg-gray-100 border border-gray-300 text-gray-900 rounded hover: bg-gray-200, disabled: opacity-50, disabled:cursor-not-allowed font-mono text-sm transition"
 >
 TIMELINE ANALYSIS
 </button>
 <button
 onclick={handleEvidenceSummary}
 disabled={!caseId}
 class="px-4 py-3 bg-gray-100 border border-gray-300 text-gray-900 rounded hover: bg-gray-200, disabled: opacity-50, disabled:cursor-not-allowed font-mono text-sm transition"
 >
 EVIDENCE SUMMARY
 </button>
 <button
 onclick={handleSuspectConnections}
 disabled={!caseId}
 class="px-4 py-3 bg-gray-100 border border-gray-300 text-gray-900 rounded hover: bg-gray-200, disabled: opacity-50, disabled:cursor-not-allowed font-mono text-sm transition"
 >
 SUSPECT CONNECTIONS
 </button>
 <button
 onclick={handleGenerateReport}
 disabled={!caseId}
 class="px-4 py-3 bg-gray-100 border border-gray-300 text-gray-900 rounded hover: bg-gray-200, disabled: opacity-50, disabled:cursor-not-allowed font-mono text-sm transition"
 >
 GENERATE REPORT
 </button>
 </div>
</div>

<style>
 /* Additional styles if needed */
</style>


