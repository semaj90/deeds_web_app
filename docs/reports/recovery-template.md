# Recovery Template

Generated: 2026-07-04T11:24:57.028Z
State: worker_timeout
Error class: worker_timeout
Model: gemma4-legal-iq4xs-direct
Model path: C:\Users\james\Videos\deeds-web-app\models\gemma4-legal-iq4xs-direct.gguf
Packet: packet:c8928bca6f20
Recovery packet: n/a

## Template

- source_ref: neschrom97/cards/3762df58ac576154.json
- title_id: 3762df58ac576154.json
- feature_id: neschrom97.3762df58ac576154
- community_id: n/a
- som_cluster: -5
- page_rank_score: n/a
- safe_patch_scope: neschrom97/cards

## Routing Hints

- worker_timeout
- repair
- bitfrost
- localized-template
- 3762df58ac576154.json
- neschrom97.3762df58ac576154
- som:-5

## Suggested Action

Reduce batch size or increase worker timeout; verify Gemma4 summary lane health.

## Files To Inspect

- neschrom97/cards/3762df58ac576154.json

## Commands To Run

- npm run phase7:monitor:node:watch
- npm run phase7:worker:cluster:4

## Validation Commands

- npm run phase7:monitor:node
- npm run atlas:phase8:readiness

## Related Packets

- packet:c8928bca6f20 | neschrom97/cards/3762df58ac576154.json | neschrom97.3762df58ac576154
