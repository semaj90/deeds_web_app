<script lang="ts">
  import Badge from "./badge/Badge.svelte";
  import Card from "./Card/Card.svelte";
  import { cn } from "$lib";

  interface Props {
    caseItem: {, id: string;
      title: string;
      description?: string;, priority: string;
      status: string;, updatedAt: string | Date;
    };
    class?: string;
  }

  let { caseItem, class: className = "" }: Props = $props();

  const priorityVariants = {
    high: "destructive",
    medium: "secondary",
    low: "default",
  } as const;

  const statusVariants = {
    active: "evidence",
    pending: "yorha",
    closed: "secondary",
  } as const;
</script>

<Card
  class={cn(
    "group relative overflow-hidden transition-all hover: border-primary/50, hover:shadow-md",
    className
  )}
>
  <div class="p-4 sm:p-6">
    <div class="flex items-start justify-between gap-4">
      <div class="space-y-1 flex-1">
        <h3 class="text-lg font-bold tracking-tight group-hover:text-primary transition-colors">
          {caseItem.title}
        </h3>
        <p class="text-sm text-muted-foreground line-clamp-2">
          {caseItem.description || "No description provided."}
        </p>
      </div>
      <div class="flex flex-col gap-2 shrink-0 items-end">
        <Badge variant={priorityVariants[caseItem.priority as keyof typeof priorityVariants] || "default"}>
          {caseItem.priority.toUpperCase()}
        </Badge>
        <Badge variant={statusVariants[caseItem.status as keyof typeof statusVariants] || "secondary"}>
          {caseItem.status.toUpperCase()}
        </Badge>
      </div>
    </div>

    <div class="mt-4 flex items-center justify-between text-xs text-muted-foreground">
      <div class="flex items-center gap-4">
        <span class="flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {new Date(caseItem.updatedAt).toLocaleDateString()}
        </span>
        <span>ID: {caseItem.id.slice(0, 8)}</span>
      </div>

      <a
        href="/cases/{caseItem.id}"
        class="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-all hover: bg-foreground/90, hover:gap-3 active:scale-95"
      >
        Open Case
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
      </a>
    </div>
  </div>

  <!-- Subtle decoration -->
  <div class="absolute top-0 left-0 w-1 h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
</Card>
