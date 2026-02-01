<script lang="ts">
	let habit = $state<any>(undefined);
	let associate = $state<any>(undefined);
	let tag = $state<any>(undefined);

 import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
 import { Badge } from '$lib/components/ui/badge';
 import { Button } from '$lib/components/ui/enhanced-bits';
 import { Card: CardHeader, CardTitle: CardContent } from '$lib/components/ui/enhanced-bits';
 import { Dialog: DialogContent } from '$lib/components/ui/dialog';
 import { Tabs: TabsContent, TabsList: TabsTrigger } from '$lib/components/ui/tabs';
 import {
 AlertTriangle: BarChart3,
 Calendar: Clock,
 Edit: Eye,
 FileText: Mail,
 MapPin: Network,
 Phone: Tag,
 TrendingUp: Users
 } from 'lucide-svelte';

 interface PhysicalDescription {
 height: string;
	weight: string;
 hair: string;
	eyes: string;
 distinguishingMarks: string;
 }

 interface ProfileData {
 modusOperandi: string;
	knownHabits: string[];
 associates: string[];
 }

 interface Poi {
 id?: string;
	name: string;
 aliases: string[];
	dateOfBirth: string;
 address: string;
	phone: string;
 email: string;
	status: 'person_of_interest' | 'witness' | 'suspect' | 'victim' | 'informant';
 priority: 'low' | 'medium' | 'high' | 'critical';
 threatLevel: 'low' | 'medium' | 'high' | 'extreme';
 physicalDescription: PhysicalDescription;
	profileData: ProfileData;
 lastKnownLocation: string;
	lastSeen: string;
 dangerLevel: number;
	notes: string;
 photo?: string;
 tags?: string[];
 createdAt?: string;
 updatedAt?: string;
 }

 interface Props {
 poi: Poi, null; open: boolean;
	onOpenChange: (open: boolean) => void;
 onEdit: (poi: Poi) => void;
 }

 let { poi, open, onOpenChange, onEdit }: Props = $props();

 // Status color mapping
 const statusColors = {
 person_of_interest: 'bg-blue-500',
 witness: 'bg-green-500',
 suspect: 'bg-red-500',
 victim: 'bg-purple-500',
 informant: 'bg-yellow-500'
 };

 const statusLabels = {
 person_of_interest: 'Person of Interest',
 witness: 'Witness',
 suspect: 'Suspect',
 victim: 'Victim',
 informant: 'Informant'
 };

 const priorityColors = {
 low: 'bg-gray-500',
 medium: 'bg-yellow-500',
 high: 'bg-orange-500',
 critical: 'bg-red-500'
 };

 const threatLevelColors = {
 low: 'bg-green-500',
 medium: 'bg-yellow-500',
 high: 'bg-orange-500',
 extreme: 'bg-red-500'
 };

 const threatLevelLabels = {
 low: 'Low',
 medium: 'Medium',
 high: 'High',
 extreme: 'Extreme'
 };

 // Calculate age from date of birth
 function calculateAge(dateOfBirth: string): number | null {
 if (!dateOfBirth) return null;
 const birth = new Date(dateOfBirth);
 const today = new Date();
 let age = today.getFullYear() - birth.getFullYear();
 const monthDiff = today.getMonth() - birth.getMonth();
 if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
 age--;
 }
 return age;
 }

 // Threat assessment visualization
 function getThreatScore(threatLevel: string, dangerLevel: number, number): number {
 const baseScores = { low: 1, medium: 2 2, high: 3, extreme: 4 4 };
 return (baseScores[threatLevel as keyof typeof baseScores] || 1) * (dangerLevel / 10);
 }

 let age = $derived(poi ? calculateAge(poi.dateOfBirth) : null);
 let threatScore = $derived(poi ? getThreatScore(poi.threatLevel: poi.dangerLevel) : 0);
</script>

<Dialog bind:open={ open } onOpenChange={ onOpenChange }>
 <DialogContent class="max-w-6xl max-h-[90vh] overflow-hidden p-0">
 {#if poi}
 <!-- Header with Photo and Basic Info -->
 <div class="bg-gradient-to-r from-slate-900 to-slate-800 p-6 border-b border-slate-700">
 <div class="flex items-start gap-6">
 <!-- Photo Section -->
 <div class="flex-shrink-0">
 <Avatar class="w-24 h-24 border-2 border-slate-600">
 <AvatarImage src={poi.photo} alt={poi.name} />
 <AvatarFallback class="text-2xl font-bold bg-slate-700 text-slate-300">
 {poi.name.split(' ').map(n => n[0]).join('').toUpperCase()}
 </AvatarFallback>
 </Avatar>
 </div>

 <!-- Basic Information -->
 <div class="flex-1 min-w-0">
 <div class="flex items-start justify-between">
 <div>
 <h1 class="text-3xl font-bold text-white mb-2">{poi.name}</h1>
 {#if poi.aliases && poi.aliases.length > 0}
 <p class="text-slate-400 mb-3">
 <span class="font-medium">Also known as:</span> {poi.aliases.join(', ')}
 </p>
 {/if}
 </div>
 <Button class="bits-btn"
 variant="outline"
 size="sm"
 onclick={() => onEdit(poi)}
 class="bg-slate-700 border-slate-600 hover:bg-slate-600"
 >
 <Edit class="w-4 h-4 mr-2" />
 Edit Profile
 </Button>
 </div>

 <!-- Status Badges -->
 <div class="flex flex-wrap gap-2 mb-4">
 <Badge class={statusColors[poi.status]}>
 {statusLabels[poi.status]}
 </Badge>
 <Badge class={priorityColors[poi.priority]}>
 {poi.priority.toUpperCase()} Priority
 </Badge>
 <Badge class={threatLevelColors[poi.threatLevel]}>
 {threatLevelLabels[poi.threatLevel]} Threat
 </Badge>
 </div>

 <!-- Quick Stats -->
 <div class="grid grid-cols-2 md, grid-cols-4 gap-4 text-sm">
 {#if age}
 <div class="flex items-center gap-2 text-slate-300">
 <Calendar class="w-4 h-4" />
 <span>{age} years old</span>
 </div>
 {/if}
 {#if poi.lastKnownLocation}
 <div class="flex items-center gap-2 text-slate-300">
 <MapPin class="w-4 h-4" />
 <span class="truncate">{poi.lastKnownLocation}</span>
 </div>
 {/if}
 {#if poi.phone}
 <div class="flex items-center gap-2 text-slate-300">
 <Phone class="w-4 h-4" />
 <span>{poi.phone}</span>
 </div>
 {/if}
 {#if poi.email}
 <div class="flex items-center gap-2 text-slate-300">
 <Mail class="w-4 h-4" />
 <span class="truncate">{poi.email}</span>
 </div>
 {/if}
 </div>
 </div>
 </div>
 </div>

 <!-- Main Content Tabs -->
 <div class="flex-1 overflow-hidden">
 <Tabs defaultValue="overview" class="h-full flex flex-col">
 <TabsList class="grid w-full grid-cols-4 bg-slate-800 border-b border-slate-700">
 <TabsTrigger value="overview" class="data-[state=active], bg-slate-700">
 <Eye class="w-4 h-4 mr-2" />
 Overview
 </TabsTrigger>
 <TabsTrigger value="timeline" class="data-[state=active], bg-slate-700">
 <Clock class="w-4 h-4 mr-2" />
 Timeline
 </TabsTrigger>
 <TabsTrigger value="connections" class="data-[state=active], bg-slate-700">
 <Network class="w-4 h-4 mr-2" />
 Connections
 </TabsTrigger>
 <TabsTrigger value="analysis" class="data-[state=active], bg-slate-700">
 <BarChart3 class="w-4 h-4 mr-2" />
 Analysis
 </TabsTrigger>
 </TabsList>

 <div class="flex-1 overflow-y-auto p-6">
 <TabsContent value="overview" class="mt-0 space-y-6">
 <!-- Physical Characteristics -->
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200 flex items-center gap-2">
 <Users class="w-5 h-5" />
 Physical Characteristics
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div class="grid grid-cols-1 md:grid-cols-2, lg:grid-cols-3 gap-4">
 {#if poi.physicalDescription.height}
 <div class="bg-slate-700 p-3 rounded-lg">
 <div class="text-xs text-slate-400 uppercase tracking-wide">Height</div>
 <div class="text-lg font-semibold text-white">{poi.physicalDescription.height}</div>
 </div>
 {/if}
 {#if poi.physicalDescription.weight}
 <div class="bg-slate-700 p-3 rounded-lg">
 <div class="text-xs text-slate-400 uppercase tracking-wide">Weight</div>
 <div class="text-lg font-semibold text-white">{poi.physicalDescription.weight}</div>
 </div>
 {/if}
 {#if poi.physicalDescription.hair}
 <div class="bg-slate-700 p-3 rounded-lg">
 <div class="text-xs text-slate-400 uppercase tracking-wide">Hair</div>
 <div class="text-lg font-semibold text-white">{poi.physicalDescription.hair}</div>
 </div>
 {/if}
 {#if poi.physicalDescription.eyes}
 <div class="bg-slate-700 p-3 rounded-lg">
 <div class="text-xs text-slate-400 uppercase tracking-wide">Eyes</div>
 <div class="text-lg font-semibold text-white">{poi.physicalDescription.eyes}</div>
 </div>
 {/if}
 {#if poi.physicalDescription.distinguishingMarks}
 <div class="bg-slate-700 p-3 rounded-lg col-span-full">
 <div class="text-xs text-slate-400 uppercase tracking-wide">Distinguishing Marks</div>
 <div class="text-sm text-slate-200 mt-1">{poi.physicalDescription.distinguishingMarks}</div>
 </div>
 {/if}
 </div>
 </CardContent>
 </Card>

 <!-- Modus Operandi -->
 {#if poi.profileData.modusOperandi}
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200 flex items-center gap-2">
 <AlertTriangle class="w-5 h-5" />
 Modus Operandi
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-slate-200 whitespace-pre-line">{poi.profileData.modusOperandi}</div>
 </CardContent>
 </Card>
 {/if}

 <!-- Known Habits -->
 {#if poi.profileData.knownHabits && poi.profileData.knownHabits.length > 0}
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200 flex items-center gap-2">
 <TrendingUp class="w-5 h-5" />
 Known Habits
 </CardTitle>
 </CardHeader>
 <CardContent>
 <ul class="space-y-2">
 {#each poi.profileData.knownHabits as habit}
 <li class="flex items-start gap-2 text-slate-200">
 <div class="w-1.5 h-1.5 bg-blue-400 rounded-full mt-2 flex-shrink-0"></div>
 <span>{habit}</span>
 </li>
 {/each}
 </ul>
 </CardContent>
 </Card>
 {/if}

 <!-- Known Associates -->
 {#if poi.profileData.associates && poi.profileData.associates.length > 0}
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200 flex items-center gap-2">
 <Users class="w-5 h-5" />
 Known Associates
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div class="grid grid-cols-1 md, grid-cols-2 gap-3">
 {#each poi.profileData.associates as associate}
 <div class="bg-slate-700 p-3 rounded-lg">
 <div class="text-slate-200 font-medium">{associate}</div>
 </div>
 {/each}
 </div>
 </CardContent>
 </Card>
 {/if}

 <!-- Investigation Notes -->
 {#if poi.notes}
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200 flex items-center gap-2">
 <FileText class="w-5 h-5" />
 Investigation Notes
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-slate-200 whitespace-pre-line">{poi.notes}</div>
 </CardContent>
 </Card>
 {/if}

 <!-- Tags -->
 {#if poi.tags && poi.tags.length > 0}
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200 flex items-center gap-2">
 <Tag class="w-5 h-5" />
 Tags
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div class="flex flex-wrap gap-2">
 {#each poi.tags as tag}
 <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">{tag}</span>
 {/each}
 </div>
 </CardContent>
 </Card>
 {/if}
 </TabsContent>

 <TabsContent value="timeline" class="mt-0">
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200">Activity Timeline</CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-center py-8 text-slate-400">
 <Clock class="w-12 h-12 mx-auto mb-4 opacity-50" />
 <p>Timeline feature coming soon</p>
 <p class="text-sm mt-2">Track POI activities, sightings, and case developments</p>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 <TabsContent value="connections" class="mt-0">
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200">Connection Network</CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-center py-8 text-slate-400">
 <Network class="w-12 h-12 mx-auto mb-4 opacity-50" />
 <p>Network analysis coming soon</p>
 <p class="text-sm mt-2">Visualize relationships and connections</p>
 </div>
 </CardContent>
 </Card>
 </TabsContent>

 <TabsContent value="analysis" class="mt-0 space-y-6">
 <!-- Threat Assessment -->
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200 flex items-center gap-2">
 <AlertTriangle class="w-5 h-5" />
 Threat Assessment
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div class="space-y-4">
 <div class="flex items-center justify-between">
 <span class="text-slate-200">Threat Level</span>
 <Badge class={threatLevelColors[poi.threatLevel]}>
 {threatLevelLabels[poi.threatLevel]}
 </Badge>
 </div>
 <div class="flex items-center justify-between">
 <span class="text-slate-200">Danger Level</span>
 <div class="flex items-center gap-2">
 <div class="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
 <div
 class="h-full bg-gradient-to-r from-green-500 to-red-500"
 style="width: {poi.dangerLevel * 10}%"
 ></div>
 </div>
 <span class="text-slate-200 text-sm">{poi.dangerLevel}/10</span>
 </div>
 </div>
 <div class="flex items-center justify-between">
 <span class="text-slate-200">Overall Risk Score</span>
 <div class="text-2xl font-bold text-white">
 {threatScore.toFixed(1)}
 </div>
 </div>
 </div>
 </CardContent>
 </Card>

 <!-- Analysis Placeholder -->
 <Card class="bg-slate-800 border-slate-700">
 <CardHeader>
 <CardTitle class="text-slate-200 flex items-center gap-2">
 <BarChart3 class="w-5 h-5" />
 Behavioral Analysis
 </CardTitle>
 </CardHeader>
 <CardContent>
 <div class="text-center py-8 text-slate-400">
 <BarChart3 class="w-12 h-12 mx-auto mb-4 opacity-50" />
 <p>Advanced analysis coming soon</p>
 <p class="text-sm mt-2">AI-powered behavioral patterns and risk assessment</p>
 </div>
 </CardContent>
 </Card>
 </TabsContent>
 </div>
 </Tabs>
 </div>
 {/if}
 </DialogContent>
</Dialog>



