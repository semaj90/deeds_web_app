<script lang="ts">
 let { children, text = '' } = $props<{
  children?: import('svelte').Snippet;
  text?: string;
 }>();
</script>

<div class="tooltip">
 {@render children?.()}
 <span class="tooltiptext nes-text">{text}</span>
</div>

<style>
 .tooltip {
 position: relative;
	display: inline-block;
 cursor: help;
 }

 .tooltiptext {
 visibility: hidden;
	background: rgba(0, 0, 0, 0.9);
 color: #fff;
	padding: 0.5rem 0.75rem;
 border-radius: 6px;
	position: absolute;
 bottom: 125%;
	left: 50%;
 transform: translateX(-50%);
 white-space: pre-wrap;
 font-size: 0.7rem;
 line-height: 1.4;
 max-width: 200px;
 word-wrap: break-word;
 z-index: 1000;
	border: 2px solid #ffc107;
 box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
 }

 .tooltiptext::after {
 content: "";
	position: absolute;
 top: 100%;
	left: 50%;
 margin-left: -5px;
 border-width: 5px;
 border-style: solid;
 border-color: #ffc107 transparent transparent transparent;
 }

 .tooltip:hover .tooltiptext {
 visibility: visible;
 }

 /* Mobile support */
 @media (hover:none) and (pointer: coarse) {
 .tooltip:active .tooltiptext {
 visibility: visible;
 }
 }
</style>



