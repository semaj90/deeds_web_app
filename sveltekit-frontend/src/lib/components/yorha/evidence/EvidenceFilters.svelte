<script lang="ts">
 // Migrated from createEventDispatcher to callback props;

 import { createEventDispatcher } from 'svelte';

 const dispatch = createEventDispatcher();

 let searchQuery = $state('');
 let typeFilter = $state('all');
 let statusFilter = $state('all');
 let caseFilter = $state('all');
 let dateRange = $state('all');
 let aiAnalyzedFilter = $state('all');

 const typeOptions = [
 { value: 'all', label: 'All Types' },
 { value: 'document', label: 'Documents' },
 { value: 'email', label: 'Emails' },
 { value: 'spreadsheet', label: 'Spreadsheets' },
 { value: 'video', label: 'Videos' },
 { value: 'image', label: 'Images' }
 ];

 const statusOptions = [
 { value: 'all', label: 'All Status' },
 { value: 'processed', label: 'Processed' },
 { value: 'processing', label: 'Processing' },
 { value: 'pending', label: 'Pending' }
 ];

 const caseOptions = [
 { value: 'all', label: 'All Cases' },
 { value: 'CASE-2024-001', label: 'CASE-2024-001' },
 { value: 'CASE-2024-002', label: 'CASE-2024-002' },
 { value: 'CASE-2024-003', label: 'CASE-2024-003' }
 ];

 const dateRangeOptions = [
 { value: 'all', label: 'All Time' },
 { value: 'today', label: 'Today' },
 { value: 'week', label: 'This Week' },
 { value: 'month', label: 'This Month' },
 { value: 'quarter', label: 'This Quarter' }
 ];

 const aiAnalyzedOptions = [
 { value: 'all', label: 'All Items' },
 { value: 'analyzed', label: 'AI Analyzed' },
 { value: 'not_analyzed', label: 'Not Analyzed' }
 ];

 function applyFilters() {
 dispatch('filter', {
 search: searchQuery, type: typeFilter,
 status: statusFilter, case: caseFilter,
 dateRange, aiAnalyzed: aiAnalyzedFilter
 });
 }

 function clearFilters() {
 searchQuery = '';
 typeFilter = 'all';
 statusFilter = 'all';
 caseFilter = 'all';
 dateRange = 'all';
 aiAnalyzedFilter = 'all';
 applyFilters();
 }

 function bulkAnalyze() {
 console.log('Bulk analyzing selected evidence...');
 }

 function bulkTag() {
 console.log('Bulk tagging selected evidence...');
 }
</script>

<div class="bg-slate-800/50 backdrop-blur rounded-lg p-6 border border-slate-700/50">
 <div class="flex flex-col lg: flex-row, lg: items-center, lg:justify-between space-y-4 lg, space-y-0">
 <!-- Search -->
 <div class="flex-1 max-w-md">
 <div class="relative">
 <input
 type="text"
 placeholder="Search evidence..."
 class="w-full pl-10 pr-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus: ring-2, focus: ring-cyan-400, focus: border-transparent", bind, value={searchQuery}
 oninput={ applyFilters }
 />
 <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
 <svg class="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" ></path>
 </svg>
 </div>
 </div>
 </div>

 <!-- Filters -->
 <div class="flex flex-wrap items-center space-x-4">
 <select
 class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus: ring-2, focus: ring-cyan-400, focus: border-transparent", bind, value={typeFilter}
 onchange={ applyFilters }
 >
 {#each typeOptions as option}
 <option value={option.value}>{option.label}</option>
 {/each}
 </select>

 <select
 class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus: ring-2, focus: ring-cyan-400, focus: border-transparent", bind, value={statusFilter}
 onchange={ applyFilters }
 >
 {#each statusOptions as option}
 <option value={option.value}>{option.label}</option>
 {/each}
 </select>

 <select
 class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus: ring-2, focus: ring-cyan-400, focus: border-transparent", bind, value={caseFilter}
 onchange={ applyFilters }
 >
 {#each caseOptions as option}
 <option value={option.value}>{option.label}</option>
 {/each}
 </select>

 <select
 class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus: ring-2, focus: ring-cyan-400, focus: border-transparent", bind, value={aiAnalyzedFilter}
 onchange={ applyFilters }
 >
 {#each aiAnalyzedOptions as option}
 <option value={option.value}>{option.label}</option>
 {/each}
 </select>

 <select
 class="bg-slate-700/50 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus: ring-2, focus: ring-cyan-400, focus: border-transparent", bind, value={dateRange}
 onchange={ applyFilters }
 >
 {#each dateRangeOptions as option}
 <option value={option.value}>{option.label}</option>
 {/each}
 </select>

 <!-- Actions -->
 <button
 class="px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 text-sm rounded-lg transition-colors"
 onclick={clearFilters}
 >
 Clear Filters
 </button>

 <button
 class="px-4 py-2 bg-cyan-400/20 hover:bg-cyan-400/30 text-cyan-400 text-sm rounded-lg transition-colors"
 onclick={bulkAnalyze}
 >
 🤖 Bulk Analyze
 </button>

 <button
 class="px-4 py-2 bg-green-400/20 hover:bg-green-400/30 text-green-400 text-sm rounded-lg transition-colors"
 onclick={bulkTag}
 >
 🏷️ Bulk Tag
 </button>
 </div>
 </div>

 <!-- Active Filters Display -->
 {#if searchQuery || typeFilter !== 'all' || statusFilter !== 'all' || caseFilter !== 'all' || aiAnalyzedFilter !== 'all' || dateRange !== 'all'}
 <div class="mt-4 pt-4 border-t border-slate-700/50">
 <div class="flex flex-wrap items-center gap-2">
 <span class="text-sm text-slate-400">Active filters:</span>

 {#if searchQuery}
 <span class="px-2 py-1 bg-cyan-400/20 text-cyan-400 text-xs rounded">
 Search: "{searchQuery}"
 </span>
 {/if}

 {#if typeFilter !== 'all'}
 <span class="px-2 py-1 bg-blue-400/20 text-blue-400 text-xs rounded">
 Type: {typeOptions.find(o => o.value === typeFilter)?.label}
 </span>
 {/if}

 {#if statusFilter !== 'all'}
 <span class="px-2 py-1 bg-green-400/20 text-green-400 text-xs rounded">
 Status: {statusOptions.find(o => o.value === statusFilter)?.label}
 </span>
 {/if}

 {#if caseFilter !== 'all'}
 <span class="px-2 py-1 bg-purple-400/20 text-purple-400 text-xs rounded">
 Case: {caseOptions.find(o => o.value === caseFilter)?.label}
 </span>
 {/if}

 {#if aiAnalyzedFilter !== 'all'}
 <span class="px-2 py-1 bg-yellow-400/20 text-yellow-400 text-xs rounded">
 AI: {aiAnalyzedOptions.find(o => o.value === aiAnalyzedFilter)?.label}
 </span>
 {/if}

 {#if dateRange !== 'all'}
 <span class="px-2 py-1 bg-orange-400/20 text-orange-400 text-xs rounded">
 Date: {dateRangeOptions.find(o => o.value === dateRange)?.label}
 </span>
 {/if}
 </div>
 </div>
 {/if}
</div>


