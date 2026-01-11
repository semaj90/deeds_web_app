<script lang="ts">
 let { filters, onFilterChange } = $props();
</script>

<div class="nes-container with-title bg-gray-900 text-white p-4 rounded-lg">
 <p class="title text-cyan-300">Advanced Filters</p>

 <div class="grid grid-cols-2 gap-4">
 <div>
 <label class="block text-sm font-medium mb-1">Date Range</label>
 <input type="date" class="nes-input w-full" bind:value={filters.startDate} onchange={onFilterChange}/>
 <input type="date" class="nes-input w-full mt-1" bind:value={filters.endDate} onchange={onFilterChange}/>
 </div>

 <div>
 <label class="block text-sm font-medium mb-1">Admissibility</label>
 <select class="nes-select w-full" bind:value={filters.admissibility} onchange={onFilterChange}>
 <option value="">All</option>
 <option value="admissible">Admissible</option>
 <option value="inadmissible">Inadmissible</option>
 <option value="pending">Pending Review</option>
 </select>
 </div>

 <div>
 <label class="block text-sm font-medium mb-1">Confidence Score</label>
 <input type="range" min="0" max="100" class="w-full" bind:value={filters.minConfidence} oninput={onFilterChange}/>
 <span class="text-xs">{filters.minConfidence}%</span>
 </div>

 <div>
 <label class="block text-sm font-medium mb-1">Source Type</label>
 <select class="nes-select w-full" bind:value={filters.sourceType} onchange={onFilterChange}>
 <option value="">All Sources</option>
 <option value="digital">Digital</option>
 <option value="physical">Physical</option>
 <option value="testimonial">Testimonial</option>
 </select>
 </div>
 </div>

 <button class="nes-btn is-primary w-full mt-4" onclick={()=>onFilterChange('reset')}>Reset Filters</button>
</div>
