<script lang="ts">
  import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Card, CardContent } from '$lib/components/ui/card';
  import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
  import { Percent, Search, User, X } from 'lucide-svelte';

  let {
    open,
    matches = [],
    onClose,
    onSelect
  } = $props<{
    open: boolean;
    matches?: Array<{
      poi: {
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
      };
      similarity: number;
      confidence: 'high' | 'medium' | 'low';
    }>;
    onClose: () => void;
    onSelect: (poi: any) => void;
  }>();

  function handleClose() {
    onClose();
  }

  function handleSelectPOI(poi: any) {
    onSelect(poi);
  }

  function getConfidenceColor(confidence: string) {
    switch (confidence) {
      case 'high': return 'bg-green-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-red-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  }

  function getSimilarityColor(similarity: number) {
    if (similarity >= 0.9) return 'text-green-600';
    if (similarity >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  }

  function getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) onClose();
  }
</script>

<Dialog open={open} onOpenChange={handleOpenChange}>
  <DialogContent class="max-w-4xl max-h-[80vh] overflow-y-auto">
    <DialogHeader>
      <DialogTitle class="flex items-center gap-2">
        <Search class="w-5 h-5" />
        Face Match Results
      </DialogTitle>
      <DialogDescription>
        Found {matches.length} potential face matches based on facial recognition analysis.
      </DialogDescription>
    </DialogHeader>

    <div class="space-y-4">
      {#if matches.length === 0}
        <div class="text-center py-8">
          <User class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-500">No face matches found</p>
        </div>
      {:else}
        <div class="grid gap-4">
          {#each matches as match (match.poi.id)}
            <Card class="cursor-pointer hover:shadow-md transition-shadow" on:click={() => handleSelectPOI(match.poi)}>
              <CardContent class="p-4">
                <div class="flex items-center gap-4">
                  <!-- POI Photo -->
                  <div class="flex-shrink-0">
                    {#if match.poi.photos && match.poi.photos.length > 0}
                      <Avatar class="w-16 h-16">
                        <AvatarImage src={match.poi.photos[0].thumbnailUrl} alt={match.poi.name} />
                        <AvatarFallback>{getInitials(match.poi.name)}</AvatarFallback>
                      </Avatar>
                    {:else}
                      <Avatar class="w-16 h-16">
                        <AvatarFallback class="bg-gray-200">
                          <User class="w-8 h-8 text-gray-500" />
                        </AvatarFallback>
                      </Avatar>
                    {/if}
                  </div>

                  <!-- POI Info -->
                  <div class="flex-1">
                    <div class="flex items-center gap-2 mb-1">
                      <h3 class="font-semibold text-lg">{match.poi.name}</h3>
                      {#if match.poi.alias}
                        <span class="text-gray-500">"{match.poi.alias}"</span>
                      {/if}
                    </div>

                    <div class="flex items-center gap-2 mb-2">
                      <Badge class={getConfidenceColor(match.confidence)}>
                        {match.confidence.toUpperCase()} CONFIDENCE
                      </Badge>
                      <Badge variant="outline">
                        Threat: {match.poi.threatLevel.toUpperCase()}
                      </Badge>
                    </div>

                    <div class="flex items-center gap-1 text-sm">
                      <Percent class="w-4 h-4" />
                      <span class={getSimilarityColor(match.similarity)}>
                        {Math.round(match.similarity * 100)}% similarity
                      </span>
                    </div>
                  </div>

                  <!-- Action -->
                  <div>
                    <Button variant="outline" size="sm">
                      View Profile
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          {/each}
        </div>
      {/if}
    </div>

    <div class="flex justify-end pt-4 border-t">
      <Button on:click={handleClose} variant="outline">
        <X class="w-4 h-4 mr-2" />
        Close
      </Button>
    </div>
  </DialogContent>
</Dialog>