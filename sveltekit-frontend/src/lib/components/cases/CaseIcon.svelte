<script lang="ts">
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Brain from 'lucide-svelte/icons/brain';
	import Briefcase from 'lucide-svelte/icons/briefcase';
	import CircleAlert from 'lucide-svelte/icons/circle-alert';
	import CircleHelp from 'lucide-svelte/icons/circle-help';
	import Clock from 'lucide-svelte/icons/clock';
	import Eye from 'lucide-svelte/icons/eye';
	import FolderOpen from 'lucide-svelte/icons/folder-open';
	import GalleryHorizontalEnd from 'lucide-svelte/icons/gallery-horizontal-end';
	import Landmark from 'lucide-svelte/icons/landmark';
	import LayoutGrid from 'lucide-svelte/icons/layout-grid';
	import List from 'lucide-svelte/icons/list';
	import LoaderCircle from 'lucide-svelte/icons/loader-circle';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Plus from 'lucide-svelte/icons/plus';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Scale from 'lucide-svelte/icons/scale';
	import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
	import X from 'lucide-svelte/icons/x';

	const icons = {
		'arrow-right': ArrowRight,
		brain: Brain,
		briefcase: Briefcase,
		'circle-alert': CircleAlert,
		clock: Clock,
		eye: Eye,
		'folder-open': FolderOpen,
		'gallery-horizontal-end': GalleryHorizontalEnd,
		landmark: Landmark,
		'layout-grid': LayoutGrid,
		list: List,
		'loader-circle': LoaderCircle,
		pencil: Pencil,
		plus: Plus,
		'refresh-cw': RefreshCw,
		scale: Scale,
		'triangle-alert': TriangleAlert,
		x: X
	} satisfies Record<string, typeof Briefcase>;

	let {
		name,
		size = 24,
		class: className = '',
		label
	}: {
		name: string;
		size?: string | number;
		class?: string;
		label?: string;
	} = $props();

	let IconComponent = $derived(icons[name] ?? CircleHelp);
</script>

<IconComponent
	{size}
	class={className}
	aria-hidden={label ? undefined : 'true'}
	aria-label={label}
	role={label ? 'img' : undefined}
/>
