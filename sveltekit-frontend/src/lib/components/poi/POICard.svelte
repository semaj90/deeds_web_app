<script lang="ts">
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import { Badge } from '$lib/components/ui/badge';
	import Button from '$lib/components/ui/Button.svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js';
	import Camera from 'lucide-svelte/icons/camera';
	import Edit from 'lucide-svelte/icons/edit';
	import Eye from 'lucide-svelte/icons/eye';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import User from 'lucide-svelte/icons/user';

	interface POI {
		id: string;
		name: string;
		alias?: string;
		threatLevel: string;
		photos?: Array<{
			url: string;
			thumbnailUrl: string;
			metadata?: any;
			ai?: any;
		}>;
		notes?: string;
		createdAt: string;
	}

	let {
		poi,
		onView,
		onEdit,
		onDelete
	}: {
		poi: POI;
		onView?: (poi: POI) => void;
		onEdit?: (poi: POI) => void;
		onDelete?: (poi: POI) => void;
	} = $props();

	function getThreatColor(level: string): string {
		switch (level) {
			case 'critical':
				return 'bg-red-500 text-white';
			case 'high':
				return 'bg-orange-500 text-white';
			case 'medium':
				return 'bg-yellow-500 text-black';
			case 'low':
				return 'bg-green-500 text-white';
			default:
				return 'bg-gray-500 text-white';
		}
	}

	function getInitials(name: string): string {
		return name
			.split(' ')
			.filter((n) => n)
			.map((n) => n[0])
			.join('')
			.toUpperCase();
	}
</script>

<Card class="hover:shadow-lg transition-shadow cursor-pointer border-2" onclick={() => onView?.(poi)}>
	<CardHeader class="pb-3">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				{#if poi.photos && poi.photos.length > 0}
					<div class="relative">
						<Avatar class="w-12 h-12">
							<AvatarImage src={poi.photos[0].thumbnailUrl} alt={poi.name} />
							<AvatarFallback>{getInitials(poi.name)}</AvatarFallback>
						</Avatar>
						{#if poi.photos.length > 1}
							<div
								class="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
							>
								<Camera class="w-3 h-3" />
							</div>
						{/if}
					</div>
				{:else}
					<Avatar class="w-12 h-12">
						<AvatarFallback class="bg-gray-200">
							<User class="w-6 h-6 text-gray-500" />
						</AvatarFallback>
					</Avatar>
				{/if}
				<div>
					<CardTitle class="text-lg">{poi.name}</CardTitle>
					{#if poi.alias}
						<p class="text-sm text-gray-500">"{poi.alias}"</p>
					{/if}
				</div>
			</div>

			<div class="flex gap-1">
				<Badge class={getThreatColor(poi.threatLevel)}>
					{poi.threatLevel.toUpperCase()}
				</Badge>
			</div>
		</div>
	</CardHeader>

	<CardContent class="space-y-3">
		{#if poi.notes}
			<p class="text-sm text-gray-700 line-clamp-2">{poi.notes}</p>
		{/if}

		<div class="flex items-center justify-between text-xs text-gray-500">
			<span>Created {new Date(poi.createdAt).toLocaleDateString()}</span>
			{#if poi.photos && poi.photos.length > 0}
				<span>{poi.photos.length} photo{poi.photos.length !== 1 ? 's' : ''}</span>
			{/if}
		</div>

		<div class="flex gap-2 pt-2 border-t">
			<Button
				variant="ghost"
				size="sm"
				onclick={(e) => {
					e.stopPropagation();
					onView?.(poi);
				}}
				class="flex-1"
			>
				<Eye class="w-4 h-4 mr-1" />
				View
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onclick={(e) => {
					e.stopPropagation();
					onEdit?.(poi);
				}}
				class="flex-1"
			>
				<Edit class="w-4 h-4 mr-1" />
				Edit
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onclick={(e) => {
					e.stopPropagation();
					onDelete?.(poi);
				}}
				class="text-red-600 hover:text-red-700"
			>
				<Trash2 class="w-4 h-4" />
			</Button>
		</div>
	</CardContent>
</Card>

<style>
 .line-clamp-2 {
 line-clamp: 2;
	display: -webkit-box;
 -webkit-line-clamp: 2;
 -webkit-box-orient: vertical;
	overflow: hidden;
 }
</style>




