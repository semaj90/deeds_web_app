<script lang="ts">
	interface Props {
 person: any;
 onedit?: (id: string) => void;
 ondelete?: (id: string) => void;
 }

 let { person, onedit, ondelete }: Props = $props();

 function getRiskColor(risk: string) {
 switch (risk?.toLowerCase()) {
 case 'low': return 'bg-green-500';
 case 'medium': return 'bg-yellow-500';
 case 'high': return 'bg-orange-500';
 case 'critical': return 'bg-red-500';
 default: return 'bg-gray-500';
 }
 }

 function getStatusColor(status: string) {
 switch (status?.toLowerCase()) {
 case 'active': return 'bg-blue-500';
 case 'inactive': return 'bg-gray-500';
 case 'archived': return 'bg-purple-500';
 default: return 'bg-gray-500';
 }
 }

 function getInitials(name: string) {
 return name
 .split(' ')
 .map(n => n[0])
 .join('')
 .toUpperCase()
 .slice(0, 2);
 }

 function formatDate(dateString: string) {
 return new Date(dateString).toLocaleDateString();
 }
</script>

<div class="person-card">
 <!-- Header with avatar and basic info -->
 <div class="card-header">
 <div class="avatar-section">
 <div class="avatar">
 {#if person.aiProfile?.who?.identity}
 <span class="initials">{getInitials(person.aiProfile.who.identity)}</span>
 {:else}
 <span class="initials">{getInitials(person.name)}</span>
 {/if}
 </div>
 </div>

 <div class="info-section">
 <h3 class="person-name">
 {person.aiProfile?.who?.identity ?? person.name}
 </h3>
 <p class="person-aliases">
 {#if person.aliases && person.aliases.length > 0}
 "{person.aliases.join(', ')}"
 {:else if person.aiProfile?.who?.background}
 {person.aiProfile.who.background.slice(0, 50)}...
 {/if}
 </p>

 <div class="badges">
 <span class="badge risk {getRiskColor(person.priority ?? 'low')}">
 {person.priority?.toUpperCase() ?? 'LOW'}
 </span>
 <span class="badge status {getStatusColor(person.status)}">
 {person.status?.toUpperCase() ?? 'ACTIVE'}
 </span>
 </div>
 </div>
 </div>

 <!-- AI Profile Summary -->
 {#if person.aiProfile}
 <div class="profile-summary">
 <div class="profile-section">
 <h4 class="section-title">WHO</h4>
 <p class="section-content">
 {person.aiProfile.who?.identity ?? 'Unknown identity'}
 </p>
 {#if person.aiProfile.who?.occupation}
 <p class="section-detail">
 <strong>Occupation:</strong> {person.aiProfile.who.occupation}
 </p>
 {/if}
 </div>

 <div class="profile-section">
 <h4 class="section-title">WHAT</h4>
 <p class="section-content">
 {#if person.aiProfile.what?.activities && person.aiProfile.what.activities.length > 0}
 {person.aiProfile.what.activities.slice(0, 2).join(', ')}
 {#if person.aiProfile.what.activities.length > 2}
 +{person.aiProfile.what.activities.length - 2} more
 {/if}
 {:else}
 No known activities
 {/if}
 </p>
 </div>

 <div class="profile-section">
 <h4 class="section-title">WHY</h4>
 <p class="section-content">
 {#if person.aiProfile.why?.motivations && person.aiProfile.why.motivations.length > 0}
 {person.aiProfile.why.motivations.slice(0, 1).join(', ')}
 {:else}
 Unknown motivations
 {/if}
 </p>
 </div>

 <div class="profile-section">
 <h4 class="section-title">RISK</h4>
 <p class="section-content">
 {person.aiProfile.risk?.threatLevel?.toUpperCase() ?? 'UNKNOWN'}
 </p>
 {#if person.aiProfile.risk?.riskFactors && person.aiProfile.risk.riskFactors.length > 0}
 <p class="section-detail">
 {person.aiProfile.risk.riskFactors[0]}
 </p>
 {/if}
 </div>
 </div>
 {/if}

 <!-- Metadata -->
 <div class="card-footer">
 <div class="metadata">
 <span class="date">Updated {formatDate(person.lastUpdated ?? person.createdAt)}</span>
 {#if person.tags && person.tags.length > 0}
 <div class="tags">
 {#each person.tags.slice(0, 3) as tag}
 <span class="tag">#{tag}</span>
 {/each}
 {#if person.tags.length > 3}
 <span class="tag">+{person.tags.length - 3}</span>
 {/if}
 </div>
 {/if}
 </div>

 <div class="actions">
 <button
 class="action-btn view"
 onclick={() => onedit?.(person.id)}
 >
 👁 View
 </button>
 <button
 class="action-btn delete"
 onclick={() => ondelete?.(person.id)}
 >
 🗑️ Delete
 </button>
 </div>
 </div>
</div>

<style>
 .person-card {
 background: rgba(26, 26, 46, 0.95);
 border: 1px solid #333;
 border-radius: 12px;
	overflow: hidden;
 transition:all 0.3s ease;
 backdrop-filter: blur(10px);
 }

 .person-card:hover {
 transform: translateY(-2px);
 box-shadow: 0 8px 25px rgba(0, 212, 255, 0.1);
 border-color: rgba(0, 212, 255, 0.3);
 }

 .card-header {
 padding: 1.5rem;
	display: flex;
 gap: 1rem;
 border-bottom: 1px solid rgba(255, 255, 255, 0.1);
 }

 .avatar-section {
 flex-shrink: 0;
 }

 .avatar {
 width: 60px;
	height: 60px;
 border-radius: 50%;
	background: linear-gradient(45deg, #00d4ff, #0099cc);
 display: flex;
 align-items: center;
 justify-content: center;
 font-size: 1.2rem;
 font-weight: bold;
	color: white;
 }

 .info-section {
 flex: 1;
 }

 .person-name {
 font-size: 1.25rem;
 font-weight: 700;
	color: #e0e0e0;
 margin: 0 0 0.25rem 0;
 }

 .person-aliases {
 font-size: 0.9rem;
	color: #b0b0b0;
 margin: 0 0 0.75rem 0;
 font-style: italic;
 }

 .badges {
 display: flex;
	gap: 0.5rem;
 }

 .badge {
 padding: 0.25rem 0.75rem;
 border-radius: 12px;
 font-size: 0.75rem;
 font-weight: 600;
	color: white;
 text-transform: uppercase;
 }

 .badge.risk {
 background: linear-gradient(45deg, #00d4ff, #0099cc);
 }

 .badge.status {
 background: linear-gradient(45deg, #ff6b6b, #ee5a24);
 }

 .profile-summary {
 padding: 1.5rem;
	background: rgba(0, 0, 0, 0.2);
 }

 .profile-section {
 margin-bottom: 1rem;
 }

 .profile-section:last-child {
 margin-bottom: 0;
 }

 .section-title {
 font-size: 0.8rem;
 font-weight: 700;
	color: #00d4ff;
 margin: 0 0 0.25rem 0;
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }

 .section-content {
 font-size: 0.9rem;
	color: #e0e0e0;
 margin: 0 0 0.25rem 0;
 line-height: 1.4;
 }

 .section-detail {
 font-size: 0.8rem;
	color: #b0b0b0;
 margin: 0;
 font-style: italic;
 }

 .card-footer {
 padding: 1rem 1.5rem;
 border-top: 1px solid rgba(255, 255, 255, 0.1);
 display: flex;
 justify-content: space-between;
 align-items: center;
 }

 .metadata {
 display: flex;
 flex-direction: column;
	gap: 0.5rem;
 }

 .date {
 font-size: 0.8rem;
	color: #888;
 }

 .tags {
 display: flex;
	gap: 0.25rem;
 flex-wrap: wrap;
 }

 .tag {
 font-size: 0.7rem;
	color: #00d4ff;
 background: rgba(0, 212, 255, 0.1);
 padding: 0.2rem 0.5rem;
 border-radius: 8px;
 }

 .actions {
 display: flex;
	gap: 0.5rem;
 }

 .action-btn {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 6px;
 font-size: 0.8rem;
 font-weight: 600;
	cursor: pointer;
 transition:all 0.2s ease;
 }

 .action-btn.view {
 background: rgba(0, 212, 255, 0.1);
 color: #00d4ff;
 }

 .action-btn.view:hover {
 background: rgba(0, 212, 255, 0.2);
 }

 .action-btn.delete {
 background: rgba(255, 107, 107, 0.1);
 color: #ff6b6b;
 }

 .action-btn.delete:hover {
 background: rgba(255, 107, 107, 0.2);
 }

 @media (max-width: 768px) {
 .card-header {
 padding: 1rem;
 }

 .avatar {
 width: 50px;
	height: 50px;
 font-size: 1rem;
 }

 .person-name {
 font-size: 1.1rem;
 }

 .profile-summary {
 padding: 1rem;
 }

 .card-footer {
 padding: 0.75rem 1rem;
 flex-direction: column;
	gap: 1rem;
 align-items: stretch;
 }

 .actions {
 justify-content: center;
 }
 }
</style>



