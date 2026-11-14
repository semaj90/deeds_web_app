<script lang="ts">
	import { onMount } from 'svelte';
	import { CourtroomScene } from '$lib/courtroom/courtroom-scene.svelte.js';
	import {
		createSyntheticCourtroomProjectV1,
		sealCourtroomReconstructionV1,
		validateCourtroomVideoProjectV1,
		verifyCourtroomReconstructionChecksumV1,
		type CourtroomVideoProjectV1,
		type SealedCourtroomReconstructionV1,
		type CourtroomVideoSegmentV1,
	} from '$lib/courtroom/courtroom-video-project-v1.js';

	const scene = new CourtroomScene();
	let canvas: HTMLCanvasElement;
	let project = $state(createSyntheticCourtroomProjectV1());
	let projectRevision = $state(project.projectRevision);
	let segments = $state(project.segments.map((segment) => ({ ...segment })));
	let currentFrame = $state(0);
	let playing = $state(false);
	let exporting = $state(false);
	let capturingFrame = $state(false);
	let sceneRendered = $state(false);
	let exportProgress = $state(0);
	let errorMessage = $state('');
	let draftStatus = $state('Synthetic fixture only · no saved draft loaded');
	let savedRevision = $state<number | null>(null);
	let savingDraft = $state(false);
	let loadingDraft = $state(false);
	let exportedUrl = $state('');
	let captionUrl = $state('');
	let activeSegmentIndex = -1;
	let cancelExportRequested = false;
	let playbackTimer: ReturnType<typeof setInterval> | undefined;

	const views = { wide: 'wide', witness: 'witness', judge: 'judge', defense: 'defense' } as const;
	const actorByBeat = { WHO: 'judge', WHAT: 'witness', WHY: 'judge', HOW: 'defense' } as const;

	function segmentForFrame(frame: number): number {
		return Math.min(3, Math.floor(Math.max(0, frame) / 60));
	}

	function applyFrame(frame: number): void {
		currentFrame = Math.max(0, Math.min(239, frame));
		const index = segmentForFrame(currentFrame);
		if (index !== activeSegmentIndex) {
			activeSegmentIndex = index;
			const segment = segments[index];
			scene.setCameraView(views[segment.camera]);
			scene.playAnimation(actorByBeat[segment.beat], 'speaking');
		}
	}

	function stopPlayback(): void {
		playing = false;
		if (playbackTimer) clearInterval(playbackTimer);
		playbackTimer = undefined;
	}

	function togglePlayback(): void {
		if (playing) return stopPlayback();
		if (currentFrame >= 239) applyFrame(0);
		playing = true;
		playbackTimer = setInterval(() => {
			if (currentFrame >= 239) return stopPlayback();
			applyFrame(currentFrame + 1);
		}, 1000 / 30);
	}

	function projectForExport(): CourtroomVideoProjectV1 {
		return { ...project, projectRevision, segments };
	}

	function recordEdit(): void {
		projectRevision += 1;
		errorMessage = '';
	}

	async function downloadProject(): Promise<void> {
		try {
			const sealed = await sealCourtroomReconstructionV1(projectForExport());
			download(new Blob([JSON.stringify(sealed, null, 2)], { type: 'application/json' }), 'courtroom-reconstruction-v1.json');
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Project could not be sealed.';
		}
	}

	async function saveDraft(): Promise<void> {
		if (savingDraft || exporting || capturingFrame) return;
		const currentProject = projectForExport();
		const validation = validateCourtroomVideoProjectV1(currentProject);
		if (validation.length) {
			errorMessage = `Draft is invalid: ${validation.join(', ')}`;
			return;
		}
		savingDraft = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/courtroom/studio/draft', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ project: currentProject, expectedRevision: savedRevision }),
			});
			const result = await response.json() as { projectRevision?: number; error?: string };
			if (!response.ok || !Number.isSafeInteger(result.projectRevision)) {
				if (response.status === 503) throw new Error('Draft storage is not enabled yet; the artifact store has not passed its readiness gate.');
				if (response.status === 409) throw new Error('A newer draft exists. Load the saved draft before saving your changes.');
				if (response.status === 401) throw new Error('Sign in to save this synthetic draft.');
				throw new Error(result.error ?? 'Draft could not be saved.');
			}
			savedRevision = result.projectRevision!;
			draftStatus = `Saved synthetic draft · revision ${savedRevision}`;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Draft could not be saved.';
		} finally {
			savingDraft = false;
		}
	}

	async function loadDraft(): Promise<void> {
		if (loadingDraft || savingDraft || exporting || capturingFrame) return;
		loadingDraft = true;
		errorMessage = '';
		try {
			const response = await fetch('/api/courtroom/studio/draft', { headers: { accept: 'application/json' } });
			const result = await response.json() as { project?: SealedCourtroomReconstructionV1; error?: string; status?: string };
			if (response.status === 404) {
				savedRevision = null;
				draftStatus = 'No saved synthetic draft exists for this account';
				return;
			}
			if (!response.ok || !result.project) {
				if (response.status === 503) throw new Error('Draft storage is not enabled yet; the artifact store has not passed its readiness gate.');
				if (response.status === 401) throw new Error('Sign in to load a saved draft.');
				throw new Error(result.error ?? 'Saved draft could not be loaded.');
			}
			if (!await verifyCourtroomReconstructionChecksumV1(result.project)) throw new Error('Saved draft checksum validation failed.');
			const { storyboardChecksum: _checksum, ...loadedProject } = result.project;
			const validation = validateCourtroomVideoProjectV1(loadedProject);
			if (validation.length) throw new Error(`Saved draft is invalid: ${validation.join(', ')}`);
			project = loadedProject;
			projectRevision = loadedProject.projectRevision;
			segments = loadedProject.segments.map((segment) => ({ ...segment }));
			savedRevision = loadedProject.projectRevision;
			activeSegmentIndex = -1;
			draftStatus = `Loaded synthetic draft · revision ${savedRevision}`;
			if (sceneRendered) applyFrame(currentFrame);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Saved draft could not be loaded.';
		} finally {
			loadingDraft = false;
		}
	}

	function download(blob: Blob, name: string): void {
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = name;
		anchor.click();
		setTimeout(() => URL.revokeObjectURL(url), 30_000);
	}

	async function captureDeterministicFrame(): Promise<void> {
		if (!sceneRendered || exporting || capturingFrame) return;
		stopPlayback();
		const frame = currentFrame;
		const segment = { ...segments[segmentForFrame(frame)] };
		const outputWidth = project.width;
		const outputHeight = project.height;
		capturingFrame = true;
		errorMessage = '';
		try {
			const scenePng = await scene.renderAtFrame(frame, views[segment.camera], actorByBeat[segment.beat]);
			const bitmap = await createImageBitmap(scenePng);
			const output = document.createElement('canvas');
			output.width = outputWidth;
			output.height = outputHeight;
			drawComposite(output, segment, bitmap);
			bitmap.close();
			const png = await new Promise<Blob>((resolve, reject) => {
				output.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Frame PNG encoding failed.')), 'image/png');
			});
			download(png, `courtroom-frame-${String(frame).padStart(3, '0')}.png`);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Deterministic frame capture failed.';
		} finally {
			capturingFrame = false;
			activeSegmentIndex = -1;
			applyFrame(frame);
		}
	}

	function frameTimestamp(frame: number): string {
		const milliseconds = Math.round((frame / project.fps) * 1000);
		const hours = Math.floor(milliseconds / 3_600_000);
		const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
		const seconds = Math.floor((milliseconds % 60_000) / 1000);
		return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
	}

	function captionsVtt(): string {
		return `WEBVTT\n\n${segments.map((segment) => `${frameTimestamp(segment.startFrame)} --> ${frameTimestamp(segment.endFrameExclusive)}\n${segment.heading}\n${segment.narration}`).join('\n\n')}\n`;
	}

	function drawComposite(target: HTMLCanvasElement, segment: CourtroomVideoSegmentV1, source: CanvasImageSource | null = canvas): void {
		const ctx = target.getContext('2d');
		if (!ctx) throw new Error('Canvas compositing is unavailable in this browser.');
		if (source) ctx.drawImage(source, 0, 0, target.width, target.height);
		ctx.fillStyle = 'rgba(8, 13, 22, 0.76)';
		ctx.fillRect(28, 26, target.width - 56, 132);
		ctx.fillStyle = '#f3d471';
		ctx.font = 'bold 22px system-ui, sans-serif';
		ctx.fillText(segment.heading.slice(0, 78), 54, 68, target.width - 108);
		ctx.fillStyle = '#ffffff';
		ctx.font = '18px system-ui, sans-serif';
		ctx.fillText(segment.narration.slice(0, 110), 54, 112, target.width - 108);
		ctx.fillStyle = 'rgba(8, 13, 22, 0.88)';
		ctx.fillRect(0, target.height - 48, target.width, 48);
		ctx.fillStyle = '#ffd76b';
		ctx.font = 'bold 18px system-ui, sans-serif';
		ctx.fillText(project.disclosure, 24, target.height - 17, target.width - 48);
	}

	async function renderCompositeAtFrame(target: HTMLCanvasElement, frame: number): Promise<void> {
		const segment = segments[segmentForFrame(frame)];
		await scene.renderAtFrameInto(frame, views[segment.camera], actorByBeat[segment.beat], target);
		drawComposite(target, segment, null);
	}

	async function exportWebm(): Promise<void> {
		if (!scene.isReady || exporting) return;
		if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) {
			errorMessage = 'This browser cannot record canvas video. Download the project JSON and export it with FilmCraft instead.';
			return;
		}
		const validation = validateCourtroomVideoProjectV1(projectForExport());
		if (validation.length) {
			errorMessage = `Project needs review: ${validation.join(', ')}`;
			return;
		}
		stopPlayback();
		errorMessage = '';
		exporting = true;
		exportProgress = 0;
		cancelExportRequested = false;
		activeSegmentIndex = -1;
		applyFrame(0);
		const output = document.createElement('canvas');
		output.width = project.width;
		output.height = project.height;
		const stream = output.captureStream(0);
		const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
			.find((candidate) => MediaRecorder.isTypeSupported(candidate));
		const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
		const chunks: BlobPart[] = [];
		const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
		if (!track?.requestFrame) {
			stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
			exporting = false;
			errorMessage = 'This browser cannot capture deterministic video frames. Use the exact PNG capture or export the project with FilmCraft.';
			return;
		}
		const ready = new Promise<Blob>((resolve, reject) => {
			recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
			recorder.onerror = () => reject(new Error('Browser video export failed.'));
			recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }));
		});
		const started = new Promise<void>((resolve) => { recorder.onstart = () => resolve(); });
		try {
			await renderCompositeAtFrame(output, 0);
			recorder.start(200);
			await started;
			for (let frame = 0; frame < project.frameCount; frame++) {
				if (cancelExportRequested) break;
				applyFrame(frame);
				await renderCompositeAtFrame(output, frame);
				track.requestFrame();
				exportProgress = Math.round(((frame + 1) / project.frameCount) * 100);
				if (frame < project.frameCount - 1) await new Promise((resolve) => setTimeout(resolve, 1000 / project.fps));
			}
			if (!cancelExportRequested) await new Promise((resolve) => setTimeout(resolve, 1000 / project.fps));
			recorder.stop();
			const video = await ready;
			if (cancelExportRequested) {
				errorMessage = 'Preview recording canceled.';
				return;
			}
			if (!video.size) throw new Error('The browser produced an empty video.');
			if (exportedUrl) URL.revokeObjectURL(exportedUrl);
			exportedUrl = URL.createObjectURL(video);
			if (captionUrl) URL.revokeObjectURL(captionUrl);
			const captions = new Blob([captionsVtt()], { type: 'text/vtt' });
			captionUrl = URL.createObjectURL(captions);
			download(video, 'courtroom-reconstruction-preview.webm');
			download(captions, 'courtroom-reconstruction-preview.en.vtt');
		} catch (error) {
			if (recorder.state !== 'inactive') recorder.stop();
			errorMessage = error instanceof Error ? error.message : 'Video export failed.';
		} finally {
			stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
			exporting = false;
			stopPlayback();
			applyFrame(currentFrame);
		}
	}

	onMount(() => {
		let cancelled = false;
		void scene.init(canvas, { renderProfile: 'modern-anti-aliased', powerPreference: 'low-power' })
			.then(() => {
				const startedAt = Date.now();
				const waitForFirstRender = () => {
					if (cancelled) return;
					if (scene.fps > 0 || Date.now() - startedAt >= 5000) {
						sceneRendered = true;
						applyFrame(currentFrame);
					}
					else setTimeout(waitForFirstRender, 100);
				};
				waitForFirstRender();
			})
			.catch((error: unknown) => { if (!cancelled) errorMessage = error instanceof Error ? error.message : '3D scene could not start.'; });
		return () => {
			cancelled = true;
			stopPlayback();
			if (exportedUrl) URL.revokeObjectURL(exportedUrl);
			if (captionUrl) URL.revokeObjectURL(captionUrl);
			scene.dispose();
		};
	});
</script>

<svelte:head>
	<title>Synthetic Courtroom Studio</title>
	<meta name="description" content="Create a source-qualified synthetic courtroom reconstruction draft." />
</svelte:head>

<main class="studio">
	<header>
		<div>
			<p class="eyebrow">PARENT ATLAS · COURTROOM STUDIO</p>
			<h1>Eight-second reconstruction draft</h1>
			<p class="disclosure">{project.disclosure}</p>
		</div>
		<div class="actions">
			<button onclick={saveDraft} disabled={savingDraft || loadingDraft || exporting || capturingFrame}>
				{savingDraft ? 'Saving draft…' : 'Save draft'}
			</button>
			<button onclick={loadDraft} disabled={savingDraft || loadingDraft || exporting || capturingFrame}>
				{loadingDraft ? 'Loading draft…' : 'Load saved draft'}
			</button>
			<button onclick={downloadProject} disabled={exporting || capturingFrame}>Download project JSON</button>
			<button onclick={captureDeterministicFrame} disabled={!sceneRendered || exporting || capturingFrame}>
				{capturingFrame ? 'Rendering exact frame…' : 'Download exact PNG frame'}
			</button>
			{#if exporting}
				<div class="recording-actions" role="status"><span>Recording preview · {exportProgress}%</span><button onclick={() => { cancelExportRequested = true; }}>Cancel</button></div>
			{:else}
				<button class="primary" onclick={exportWebm} disabled={!sceneRendered || capturingFrame}>Record preview</button>
			{/if}
		</div>
	</header>
	<p class="help" role="status">{draftStatus}. Drafts are synthetic and account-scoped; real-case evidence and approvals are not enabled.</p>

	<div class="workspace">
		<section class="preview" aria-label="Synthetic 3D courtroom preview">
			<div class="canvas-wrap"><canvas bind:this={canvas} aria-label="Procedurally generated courtroom with synthetic characters"></canvas>
				{#if !sceneRendered}<div class="scene-loading" role="status">Preparing the synthetic courtroom…</div>{/if}
				<div class="scene-label">SYNTHETIC CAST · NO REAL PERSON LIKENESS</div>
			</div>
			<div class="transport">
				<button onclick={togglePlayback} disabled={!sceneRendered || exporting || capturingFrame}>{playing ? 'Pause' : 'Play'}</button>
				<label>Frame {currentFrame + 1} / 240 <input aria-label="Timeline frame" type="range" min="0" max="239" value={currentFrame} disabled={exporting || capturingFrame} oninput={(event) => { stopPlayback(); applyFrame(Number((event.currentTarget as HTMLInputElement).value)); }} /></label>
				<span>00:{String(Math.floor(currentFrame / 30)).padStart(2, '0')}:{String(currentFrame % 30).padStart(2, '0')} / 00:08:00</span>
			</div>
			<div class="segments" aria-label="Four 60-frame segments">
				{#each segments as segment, index}
					<button class:active={segmentForFrame(currentFrame) === index} disabled={exporting || capturingFrame} onclick={() => applyFrame(segment.startFrame)}>
						<strong>{segment.beat}</strong><span>{index * 2}s–{(index + 1) * 2}s</span>
					</button>
				{/each}
			</div>
			<p class="help">Exact PNG capture and the WebM preview render each synthetic scene frame from its integer project frame, camera preset, and disclosure. Browser recording still uses wall-clock timestamps, so it is a preview—not the final constant-30-fps MP4 export.</p>
		</section>

		<aside class="editor">
			<h2>Story beats</h2>
			<p class="help">Draft labels and narration are editable. Source evidence is not changed.</p>
			{#each segments as segment, index}
				<fieldset>
					<legend>{segment.beat} · frames {segment.startFrame}–{segment.endFrameExclusive - 1}</legend>
					<label>Camera<select bind:value={segments[index].camera} disabled={exporting || capturingFrame} onchange={() => { recordEdit(); activeSegmentIndex = -1; applyFrame(currentFrame); }}>
						<option value="wide">Wide</option><option value="witness">Witness</option><option value="judge">Judge</option><option value="defense">Defense</option>
					</select></label>
					<label>Title<input bind:value={segments[index].heading} maxlength="160" disabled={exporting || capturingFrame} onchange={recordEdit} /></label>
					<label>Draft narration<textarea bind:value={segments[index].narration} maxlength="500" rows="3" disabled={exporting || capturingFrame} onchange={recordEdit}></textarea></label>
			<p class="status">{segment.status} · fixture-only source · {project.sourceRevision.slice(0, 19)}…</p>
				</fieldset>
			{/each}
			<p class="warning"><strong>Evidence boundary:</strong> all content is synthetic. “Why” is not presented as a factual motive. Add admitted source references in a reviewed project before grounding claims.</p>
		</aside>
	</div>
	{#if errorMessage}<p class="error" role="alert">{errorMessage}</p>{/if}
	{#if exportedUrl}<video class="exported" controls src={exportedUrl} aria-label="Exported courtroom reconstruction video"><track kind="captions" label="English" srclang="en" src={captionUrl} default /></video>{/if}
</main>

<style>
	.studio { max-width: 1600px; margin: 0 auto; padding: 1.25rem; color: #e7edf7; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
	.eyebrow { color: #55e0bd; letter-spacing: .14em; font-size: .72rem; }
	h1 { margin: .2rem 0; font-size: clamp(1.4rem, 2vw, 2rem); }
	.disclosure, .warning { color: #f3d471; font-size: .85rem; }
	.actions, .transport { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
	button { cursor: pointer; border: 1px solid #536074; color: inherit; background: #182231; border-radius: .5rem; padding: .65rem .85rem; }
	button:disabled { opacity: .55; cursor: wait; }
	button.primary { background: #57451c; border-color: #d9b858; }
	.workspace { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(300px, .8fr); gap: 1rem; align-items: start; }
	.preview, .editor { min-width: 0; border: 1px solid #354359; border-radius: .75rem; background: #101722; padding: .75rem; }
	.editor { max-height: calc(100vh - 190px); overflow-y: auto; }
	.editor h2 { color: #f0f4fb !important; }
	.canvas-wrap { position: relative; aspect-ratio: 16 / 9; background: #080c13; border-radius: .5rem; overflow: hidden; }
	canvas { display: block; width: 100%; height: 100%; }
	.scene-loading { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(8, 12, 19, .72); color: #f3d471; font-weight: 700; }
	.scene-label { position: absolute; left: .7rem; bottom: .7rem; padding: .4rem .6rem; border-radius: .35rem; background: #080c13dd; color: #ffe18a; font-size: .72rem; }
	.transport { justify-content: space-between; padding: .75rem 0; font-size: .82rem; }
	.transport label { flex: 1; min-width: 180px; display: grid; gap: .25rem; }
	.transport input { width: 100%; accent-color: #f3d471; }
	.segments { display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem; }
	.segments button { display: flex; flex-direction: column; text-align: left; gap: .25rem; }
	.segments button.active { border-color: #f3d471; color: #f3d471; }
	.segments span, .help, .status { color: #c1cedf !important; font-size: .76rem; }
	.editor h2 { margin: .25rem 0; }
	fieldset { border: 1px solid #354359; border-radius: .55rem; margin: .75rem 0; padding: .65rem; }
	legend { color: #f3d471; font-size: .78rem; font-weight: 700; }
	fieldset label { display: grid; gap: .3rem; margin: .4rem 0; color: #b9c6d6; font-size: .78rem; }
	input:not([type="range"]), textarea, select { width: 100%; box-sizing: border-box; color: #eef4ff; background: #0b111a; border: 1px solid #3c4a5d; border-radius: .35rem; padding: .55rem; font: inherit; }
	.recording-actions { display: flex; gap: .6rem; align-items: center; color: #f3d471; font-size: .82rem; }
	textarea { resize: vertical; }
	.warning { line-height: 1.5; border-left: 3px solid #d9b858; padding-left: .65rem; }
	.error { color: #ff9f9f; }
	.exported { display: block; width: min(100%, 800px); margin: 1rem auto; background: #000; }
	@media (max-width: 900px) { .workspace { grid-template-columns: 1fr; } .editor { max-height: none; overflow: visible; } }
	@media (max-width: 560px) { .studio { padding: .5rem; } .segments { grid-template-columns: repeat(2, 1fr); } }
</style>
