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
 } }: {
 status?: SystemStatus;
 } = $props();

 const getStatusColor = (s: string) => {
 switch (s) {
 case 'online':
 return 'text-[#00AA00]';
 case 'offline':
 return 'text-[#CC0000]';
 default:return 'text-sand/60';
 }
 };

 const getStatusDot = (s: string) => {
 switch (s) {
 case 'online':
 return 'bg-[#00AA00]';
 case 'offline':
 return 'bg-[#CC0000]';
 default:return 'bg-sand/20';
 }
 };

 const getStorageColor = (capacity: number) => {
 if (capacity > 80) return 'bg-[#CC0000]';
 if (capacity > 60) return 'bg-[#FFA500]';
 return 'bg-[#00AA00]';
 };
</script>

<div class="bg-white border-2 border-sand/20 p-6 rounded">
 <h2 class="text-xl font-bold text-sand mb-4 font-mono">SYSTEM STATUS</h2>

 <div class="space-y-4">
 <!-- Database Status -->
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-3">
 <div class="w-3 h-3 rounded-full {getStatusDot(status.database)}" ></div>
 <span class="font-mono text-sm text-sand/80">Database</span>
 </div>
 <span class="font-mono text-sm {getStatusColor(status.database)} uppercase">
 {status.database}
 </span>
 </div>

 <!-- Elasticsearch Status -->
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-3">
 <div class="w-3 h-3 rounded-full {getStatusDot(status.elasticsearch)}" ></div>
 <span class="font-mono text-sm text-sand/80">Elasticsearch</span>
 </div>
 <span class="font-mono text-sm {getStatusColor(status.elasticsearch)} uppercase">
 {status.elasticsearch}
 </span>
 </div>

 <!-- Gemma Service Status -->
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-3">
 <div class="w-3 h-3 rounded-full {getStatusDot(status.gemma)}" ></div>
 <span class="font-mono text-sm text-sand/80">Gemma Service</span>
 </div>
 <span class="font-mono text-sm {getStatusColor(status.gemma)} uppercase">
 {status.gemma}
 </span>
 </div>

 <!-- Storage Capacity -->
 <div class="pt-2 border-t border-sand/20">
 <div class="flex items-center justify-between mb-2">
 <span class="font-mono text-sm text-sand/80">Storage Capacity</span>
 <span class="font-mono text-sm text-sand/60">{status.storageCapacity}%</span>
 </div>
 <div class="w-full bg-sand/10 rounded h-2">
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


