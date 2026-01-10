<script lang="ts">
  import { cn } from "$lib/utils/cn";
  import * as DropdownMenu from 'bits-ui';
  import Brain from "lucide-svelte/icons/brain";
  import ChevronDown from "lucide-svelte/icons/chevron-down";
  import FileText from "lucide-svelte/icons/file-text";
  import Keyboard from "lucide-svelte/icons/keyboard";
  import Sparkles from "lucide-svelte/icons/sparkles";
  import Wand2 from "lucide-svelte/icons/wand-2";
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";

  interface Props {
    disabled?: boolean;
    onReportGenerate?: (reportType: string) => void;
    onSummarize?: () => void;
    onAnalyze?: () => void;
    hasContent?: boolean;
    isGenerating?: boolean;
  }

  let {
    disabled = false,
    onReportGenerate = () => {},
    onSummarize = () => {},
    onAnalyze = () => {},
    hasContent = false,
    isGenerating = false,
  }: Props = $props();

  let open = $state(false);
  let selectedItem = $state<string | null>(null);

  const reportTypes = [
    {
      id: "case-summary",
      name: "Case Summary Report",
      icon: FileText,
      shortcut: "Ctrl+Shift+C",
      description: "Comprehensive case overview and analysis",
    },
    {
      id: "evidence-analysis",
      name: "Evidence Analysis",
      icon: Brain,
      shortcut: "Ctrl+Shift+E",
      description: "Detailed evidence evaluation and admissibility",
    },
    {
      id: "legal-brief",
      name: "Legal Brief",
      icon: Wand2,
      shortcut: "Ctrl+Shift+L",
      description: "Structured legal arguments with precedents",
    },
    {
      id: "investigation-report",
      name: "Investigation Report",
      icon: Sparkles,
      shortcut: "Ctrl+Shift+I",
      description: "Investigation documentation and findings",
    },
  ];

  const aiTools = [
    {
      id: "summarize",
      name: "Summarize Content",
      icon: FileText,
      shortcut: "Ctrl+Shift+S",
      description: "Generate AI summary of current content",
      requiresContent: true,
    },
    {
      id: "analyze",
      name: "Analyze Report",
      icon: Brain,
      shortcut: "Ctrl+Shift+A",
      description: "Comprehensive AI analysis with insights",
      requiresContent: true,
    },
  ];

  function handleKeydown(event: KeyboardEvent) {
    if (!event.ctrlKey || !event.shiftKey) return;
    const key = event.key.toLowerCase();

    const reportShortcut = reportTypes.find((type) =>
      type.shortcut.toLowerCase().endsWith(key)
    );
    if (reportShortcut && !disabled && !isGenerating) {
      event.preventDefault();
      onReportGenerate(reportShortcut.id);
      open = false;
      return;
    }

    if (hasContent && !disabled && !isGenerating) {
      if (key === "s") {
        event.preventDefault();
        onSummarize();
        open = false;
      } else if (key === "a") {
        event.preventDefault();
        onAnalyze();
        open = false;
      }
    }
  }

  function handleItemSelect(action: string, requiresContent = false) {
    if (disabled || isGenerating) return;
    if (requiresContent && !hasContent) return;

    selectedItem = action;
    if (action === "summarize") {
      onSummarize();
    } else if (action === "analyze") {
      onAnalyze();
    } else {
      onReportGenerate(action);
    }
    open = false;
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  });
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger
    class={cn(
      "inline-flex items-center gap-2 px-4 py-2 rounded-md transition-all font-medium border",
      "bg-gradient-to-r from-purple-50 to-indigo-50 text-purple-700 border-purple-100",
      "hover:from-purple-100 hover:to-indigo-100 hover:border-purple-200",
      (disabled || isGenerating) && "opacity-50 cursor-not-allowed grayscale",
      open && " ring-2 ring-purple-500 ring-offset-2"
    )}
    disabled={disabled || isGenerating}
  >
    <Sparkles size={16} />
    <span>AI Actions</span>
    <ChevronDown
      size={12}
      class={cn("transition-transform duration-200", open && "rotate-180")}
    />
    {#if isGenerating}
      <div
        class="absolute inset-0 rounded-md bg-purple-200/50 animate-pulse"
        aria-hidden="true"
      ></div>
    {/if}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      class="z-50 min-w-[20rem] max-w-[24rem] bg-background border rounded-lg shadow-xl p-1"
      sideOffset={8}
      transition={fly}
      transitionConfig={{ duration: 150, y: -8 }}
    >
      <DropdownMenu.Group>
        <DropdownMenu.Label
          class="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b"
        >
          <FileText size={14} />
          Generate Report
        </DropdownMenu.Label>

        {#each reportTypes as report (report.id)}
          <DropdownMenu.Item
            class={cn(
              "flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer outline-none transition-colors",
              "hover:bg-accent focus:bg-accent",
              selectedItem === report.id && "bg-purple-50 text-purple-900"
            )}
            onclick={() => handleItemSelect(report.id)}
            disabled={disabled || isGenerating}
          >
            <div class="flex items-center gap-3 min-w-0">
              <report.icon size={14} class="text-muted-foreground shrink-0" />
              <div class="flex flex-col min-w-0">
                <span class="text-sm font-medium truncate">{report.name}</span>
                <span class="text-xs text-muted-foreground truncate"
                  >{report.description}</span
                >
              </div>
            </div>
            <kbd
              class="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-muted border rounded shadow-sm shrink-0"
              >{report.shortcut}</kbd
            >
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Group>

      <DropdownMenu.Separator class="h-px bg-muted my-1" />

      <DropdownMenu.Group>
        <DropdownMenu.Label
          class="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b"
        >
          <Brain size={14} />
          AI Analysis
        </DropdownMenu.Label>

        {#each aiTools as tool (tool.id)}
          <DropdownMenu.Item
            class={cn(
              "flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer outline-none transition-colors",
              "hover:bg-accent focus:bg-accent",
              tool.requiresContent && !hasContent && "opacity-40 cursor-not-allowed",
              selectedItem === tool.id && "bg-purple-50 text-purple-900"
            )}
            onclick={() => handleItemSelect(tool.id, tool.requiresContent)}
            disabled={disabled ||
              isGenerating ||
              (tool.requiresContent && !hasContent)}
            title={tool.requiresContent && !hasContent
              ? "Add content to enable this feature"
              : ""}
          >
            <div class="flex items-center gap-3 min-w-0">
              <tool.icon size={14} class="text-muted-foreground shrink-0" />
              <div class="flex flex-col min-w-0">
                <span class="text-sm font-medium truncate">{tool.name}</span>
                <span class="text-xs text-muted-foreground truncate"
                  >{tool.description}</span
                >
              </div>
            </div>
            <kbd
              class="ml-2 px-1.5 py-0.5 text-[10px] font-mono bg-muted border rounded shadow-sm shrink-0"
              >{tool.shortcut}</kbd
            >
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Group>

      <DropdownMenu.Separator class="h-px bg-muted my-1" />

      <div class="px-3 py-2 flex items-center gap-2 text-[10px] text-muted-foreground">
        <Keyboard size={12} />
        <span>Use shortcuts (Ctrl+Shift+Letter) for quick actions</span>
      </div>
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
