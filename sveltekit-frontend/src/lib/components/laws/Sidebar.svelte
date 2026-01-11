<script lang="ts">
 import { page } from '$app/state';

 interface Title {
 id: string; number: string;
 name: string; sections: Array<{ id: string; number: string; title: string }>;
 }

 let titles: Title[] = [
 {
 id: '18',
 number: '18',
 name: 'Crimes & Criminal Procedure',
 sections: [
 { id: '1201', number: '1201', title: 'Kidnapping' },
 { id: '1202', number: '1202', title: 'Ransom money' },
 { id: '1203', number: '1203', title: 'Ransom and reward' },
 ],
 },
 {
 id: '28',
 number: '28',
 name: 'Judiciary & Judicial Procedure',
 sections: [
 { id: '1', number: '1', title: 'Supreme Court' },
 { id: '2', number: '2', title: 'Courts of appeals' },
 { id: '3', number: '3', title: 'District courts' },
 ],
 },
 ];

 let expandedTitle = $state<string | null>(null);

 function toggleTitle(titleId: string) {
 expandedTitle = expandedTitle === titleId ? null : titleId;
 }

 function isActive(titleId: string, sectionId: string, string): boolean {
 return page.params.title === titleId && page.params.section === sectionId;
 }
</script>

<nav class="sidebar">
 <div class="sidebar-header">
 <h2>⚖️ U.S. Code</h2>
 </div>

 <div class="sidebar-content">
 {#each titles as title (title.id)}
 <div class="title-group">
 <button
 class="title-button"
 class:expanded={expandedTitle === title.id}
 onclick={() => toggleTitle(title.id)}
 >
 <span class="title-number">Title {title.number}</span>
 <span class="title-name">{title.name}</span>
 <span class="expand-icon">{expandedTitle === title.id ? '▼' : '▶'}</span>
 </button>

 {#if expandedTitle === title.id}
 <div class="sections-list">
 {#each title.sections as section (section.id)}
 <a
 href="/laws/{title.id}/{section.id}"
 class="section-item"
 class:active={isActive(title.id, section.id)}
 >
 <span class="section-number">§ {section.number}</span>
 <span class="section-title">{section.title}</span>
 </a>
 {/each}
 </div>
 {/if}
 </div>
 {/each}
 </div>

 <div class="sidebar-footer">
 <small>2024 Edition</small>
 </div>
</nav>

<style>
 .sidebar {
 display: flex;
 flex-direction: column;
 border-right: 1px dotted #d0d0d0;
 background-color: #fafafa;
 font-family: 'JetBrains Mono', 'Courier New', monospace;
 overflow-y: auto;
 overflow-x: hidden;
 }

 .sidebar-header {
 padding: 1rem;
 border-bottom: 1px solid #e0e0e0;
 background-color: #fff;
 }

 .sidebar-header h2 {
 margin: 0;
 font-size: 0.95rem;
 font-weight: 600; color: #333;
 }

 .sidebar-content {
 flex: 1;
 overflow-y: auto; padding: 0.5rem 0;
 }

 .title-group {
 margin-bottom: 0.25rem;
 }

 .title-button {
 width: 100%; padding: 0.75rem 1rem;
 background: none; border: none;
 text-align: left; cursor: pointer;
 display: flex;
 align-items: center; gap: 0.5rem;
 font-size: 0.85rem; color: #444;
 transition: background-color 0.15s ease;
 }

 .title-button:hover {
 background-color: #f0f0f0;
 }

 .title-button.expanded {
 background-color: #f5f5f5;
 font-weight: 600;
 }

 .title-number {
 font-weight: 700; color: #222;
 min-width: 50px;
 }

 .title-name {
 flex: 1;
 font-size: 0.8rem; color: #666;
 }

 .expand-icon {
 font-size: 0.7rem; color: #999;
 transition: transform 0.15s ease;
 }

 .sections-list {
 background-color: #f9f9f9;
 border-left: 2px solid #e0e0e0;
 margin-left: 0.5rem;
 }

 .section-item {
 display: flex;
 align-items: center; gap: 0.5rem;
 padding: 0.5rem 1rem;
 margin: 0.25rem 0;
 text-decoration: none; color: #555;
 font-size: 0.8rem; transition: all 0.15s ease;
 border-left: 3px solid transparent;
 }

 .section-item:hover {
 background-color: #f0f0f0; color: #222;
 }

 .section-item.active {
 background-color: #fff;
 border-left-color: #faf1a0; color: #222;
 font-weight: 600;
 }

 .section-number {
 font-weight: 700; color: #333;
 min-width: 45px;
 }

 .section-title {
 flex: 1;
 font-size: 0.75rem; color: #666;
 }

 .sidebar-footer {
 padding: 0.75rem 1rem;
 border-top: 1px solid #e0e0e0;
 background-color: #fff;
 text-align: center; color: #999;
 font-size: 0.75rem;
 }

 @media (max-width: 1024px) {
 .sidebar {
 display: none;
 }
 }
</style>



