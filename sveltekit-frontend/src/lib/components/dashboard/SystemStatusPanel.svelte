<script lang="ts">
 export interface SystemStatus {
 database: 'online' | 'offline' | 'unknown';
 elasticsearch: 'online' | 'offline' | 'unknown';
 gemma: 'online' | 'offline' | 'unknown';
 storageCapacity: number; // percentage 0-100
 }

 let { status = {
 database: 'unknown',
 elasticsearch: 'unknown',
 gemma: 'unknown',
 storageCapacity: 0,
 } } = $props<{
 status?: SystemStatus;
 }>();

 const getStatusColor = (s: string) => {
 switch (s) {
 case 'online':
 return 'text-[#00AA00]';
 case 'offline':
 return 'text-[#CC0000]';
 default:return 'text-gray-500';
 }
 };

 const getStatusDot = (s: string) => {
 switch (s) {
 case 'online':
 return 'bg-[#00AA00]';
 case 'offline':
 return 'bg-[#CC0000]';
 default:return 'bg-gray-400';
 }
 };

 const getStorageColor = (capacity: number) => {
 if (capacity > 80) return 'bg-[#CC0000]';
 if (capacity > 60) return 'bg-[#FFA500]';
 return 'bg-[#00AA00]';
 };
</script>

<div class="bg-white border-2 border-gray-300 p-6 rounded">
 <h2 class="text-xl font-bold text-gray-900 mb-4 font-mono">SYSTEM STATUS</h2>

 <div class="space-y-4">
 <!-- Database Status -->
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-3">
 <div class="w-3 h-3 rounded-full {getStatusDot(status.database)}" ></div>
 <span class="font-mono text-sm text-gray-700">Database</span>
 </div>
 <span class="font-mono text-sm {getStatusColor(status.database)} uppercase">
 {status.database}
 </span>
 </div>

 <!-- Elasticsearch Status -->
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-3">
 <div class="w-3 h-3 rounded-full {getStatusDot(status.elasticsearch)}" ></div>
 <span class="font-mono text-sm text-gray-700">Elasticsearch</span>
 </div>
 <span class="font-mono text-sm {getStatusColor(status.elasticsearch)} uppercase">
 {status.elasticsearch}
 </span>
 </div>

 <!-- Gemma Service Status -->
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-3">
 <div class="w-3 h-3 rounded-full {getStatusDot(status.gemma)}" ></div>
 <span class="font-mono text-sm text-gray-700">Gemma Service</span>
 </div>
 <span class="font-mono text-sm {getStatusColor(status.gemma)} uppercase">
 {status.gemma}
 </span>
 </div>

 <!-- Storage Capacity -->
 <div class="pt-2 border-t border-gray-300">
 <div class="flex items-center justify-between mb-2">
 <span class="font-mono text-sm text-gray-700">Storage Capacity</span>
 <span class="font-mono text-sm text-gray-600">{status.storageCapacity}%</span>
 </div>
 <div class="w-full bg-gray-200 rounded h-2">
 <div
 class="h-2 rounded {getStorageColor(status.storageCapacity)}"
 style="width: {status.storageCapacity}%"
 ></div>
 </div>
 </div>
 </div>
</div>

<style>
 /* Additional styles if needed */
</style>


