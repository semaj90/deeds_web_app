# SvelteKit 2 / Three.js / Parent Atlas integration

Copy `src/*.mjs` into `sveltekit-frontend/src/lib/scene/procedural/` or adjust imports. Copy `data/case.json` to a demo fixture folder **never** a real case database. Use the current app's existing authenticated case API for production; do not create an unauthenticated endpoint returning real portraits.

```ts
// Browser only (inside your existing Svelte 5 onMount, or scene initializer).
import {createProceduralHumanoid, poseHumanoid} from '$lib/scene/procedural/humanoid-three.mjs';
import {humanoidPreset} from '$lib/scene/procedural/humanoid-math.js';
import {planIllustrativeEvent} from '$lib/scene/procedural/scene-bridge.mjs';
import {attachPortraitToHead,removePortraitFromHead} from '$lib/scene/procedural/poi-portrait-three.mjs';

// caseFixture: trusted authorized synthetic demo fixture only.
// scene: your existing Three.js scene, camera and renderer remain unchanged.
const plan = planIllustrativeEvent(caseFixture,'SC-02','EV-005',{
  representation:'low-poly-mesh'
});
for (const item of plan.actors) {
  const person = caseFixture.people.find(p=>p.personId===item.personId)!;
  const params = humanoidPreset('neutral',{
    outfit:person.characterAsset.preset.outfit,
    hair:person.characterAsset.preset.hair,
  });
  const actor=createProceduralHumanoid(params,{id:item.characterAssetId});
  actor.root.position.set(...item.positionXYZ);
  actor.root.userData.caseId=caseFixture.caseId;
  actor.root.userData.eventId=plan.eventId;
  actor.root.userData.sceneRevision=plan.sceneRevision;
  actor.root.userData.sourceClass='synthetic_illustration';
  scene.add(actor.root);

  // Demo assetUrl is illustrative. Production must issue authorized,
  // case-scoped URLs for this authenticated user's approved image assets.
  await attachPortraitToHead(actor,person,{
    authorized:true, requestedMode:'portrait_card',
    assetUrl:`/portraits/${person.personId.toLowerCase()}.svg`
  });
}

// On a user-approved event-bound animation save:
import {validateAnimationSaveBinding} from '$lib/scene/procedural/scene-bridge.mjs';
const binding = validateAnimationSaveBinding(caseFixture,{
  caseId:caseFixture.caseId,sceneId:'SC-02',sceneRevision:'scene-demo-r1',
  eventId:'EV-005',evidenceId:'E-06',
  evidenceSha256:caseFixture.evidence.find(e=>e.evidenceId==='E-06')!.sha256,reviewed:true,
  start:'2026-10-14T15:06:00-07:00',end:'2026-10-14T15:06:18-07:00'
});
// SERVER: verify binding AGAINST THE AUTHORIZED READBACK and original
// evidence+revision; do not trust a client-approved boolean in production.
```

**Important limitations:** the code is a browser integration illustration, not wired into live app functions and not typechecked against its installed Three.js. `attachPortraitToHead()` uses `Image.decode()`, Canvas2D and `THREE.CanvasTexture`; for `uv_face` the v2 head has front hemisphere around U=0.25. Portrait-card mode is preferable when the evidence image should not be geometrically distorted. To use actual case photos, replace `assetUrl` with a server-authorized provenance-controlled route and require explicit reviewer approval; this client helper is not itself an authorization boundary.

**Persist in your current systems:** PostgreSQL case/people/events/scene_revision metadata; SeaweedFS original and generated GLB/portrait artifacts; `atlas_artifacts` for content SHA and provenance; existing durable workflow queue/FSM for exports; source exhibit IDs and time ranges on animations. Keep the observed-versus-hypothetical data separation in all panels, exports, printouts, and case readbacks.
