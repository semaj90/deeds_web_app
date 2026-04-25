# Error Brain: CI Dry Run Integration

## Overview

Run Error Brain in CI/CD pipelines without applying changes. Generate analysis reports as build artifacts.

## Configuration

### Environment Variables (CI)
```yaml
env:
  ERROR_BRAIN_ENABLED: 1
  ERROR_BRAIN_APPLY_MODE: off  # Critical: never apply in CI
  ERROR_BRAIN_TRANSPORT: none  # No SSE/Redis needed
  BATCH_REPORT_STAMP: ${{ github.run_id }}  # Deterministic
```

## GitHub Actions Example

```yaml
name: Error Brain Analysis

on:
  pull_request:
  push:
    branches: [main]

jobs:
  analyze-errors:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: sveltekit-frontend/package-lock.json

      - name: Install dependencies
        working-directory: sveltekit-frontend
        run: npm ci

      - name: Start dev server (background)
        working-directory: sveltekit-frontend
        run: |
          npm run dev &
          sleep 10  # Wait for server to start
        env:
          ERROR_BRAIN_ENABLED: 1
          ERROR_BRAIN_APPLY_MODE: off
          ERROR_BRAIN_TRANSPORT: none
          BATCH_REPORT_STAMP: ${{ github.run_id }}

      - name: Run Error Brain analysis
        run: |
          curl -X POST http://localhost:5173/api/internal/error-brain/run \
            -H "Content-Type: application/json" \
            -o run-result.json

          RUNID=$(jq -r .runId run-result.json)
          echo "RUNID=$RUNID" >> $GITHUB_ENV

      - name: Wait for analysis
        run: |
          for i in {1..60}; do
            STATUS=$(curl -s http://localhost:5173/api/internal/error-brain/status/${{ env.RUNID }} | jq -r .step)
            echo "Status: $STATUS"

            if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then
              break
            fi

            sleep 5
          done

      - name: Check final status
        run: |
          curl -s http://localhost:5173/api/internal/error-brain/status/${{ env.RUNID }} \
            | jq .

      - name: Upload reports
        uses: actions/upload-artifact@v3
        with:
          name: error-brain-reports-${{ github.run_id }}
          path: sveltekit-frontend/reports/
          retention-days: 30

      - name: Comment on PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const runState = JSON.parse(
              fs.readFileSync('sveltekit-frontend/reports/runs/${{ env.RUNID }}.json', 'utf8')
            );

            const body = `## Error Brain Analysis

            **Run ID**: \`${{ env.RUNID }}\`
            **Status**: ${runState.step}

            ### Counters
            - Files scanned: ${runState.counters.filesScanned}
            - Errors found: ${runState.counters.errorsFound}
            - Patches proposed: ${runState.counters.patchesProposed}
            - Patches applied: ${runState.counters.patchesApplied}
            - Patches rejected: ${runState.counters.patchesRejected}

            View detailed reports in the [build artifacts](https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}).
            `;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

## GitLab CI Example

```yaml
error-brain-analysis:
  stage: test
  image: node:20

  variables:
    ERROR_BRAIN_ENABLED: "1"
    ERROR_BRAIN_APPLY_MODE: "off"
    ERROR_BRAIN_TRANSPORT: "none"
    BATCH_REPORT_STAMP: "$CI_PIPELINE_ID"

  script:
    - cd sveltekit-frontend
    - npm ci
    - npm run dev &
    - sleep 10
    - |
      RUNID=$(curl -X POST http://localhost:5173/api/internal/error-brain/run | jq -r .runId)
      echo "RUNID=$RUNID"
    - |
      for i in {1..60}; do
        STATUS=$(curl -s http://localhost:5173/api/internal/error-brain/status/$RUNID | jq -r .step)
        echo "Status: $STATUS"
        [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ] && break
        sleep 5
      done
    - curl -s http://localhost:5173/api/internal/error-brain/status/$RUNID | jq .

  artifacts:
    paths:
      - sveltekit-frontend/reports/
    expire_in: 30 days

  only:
    - merge_requests
    - main
```

## Local CI Simulation

```bash
#!/bin/bash
# ci-test.sh - Simulate CI environment locally

export ERROR_BRAIN_ENABLED=1
export ERROR_BRAIN_APPLY_MODE=off
export ERROR_BRAIN_TRANSPORT=none
export BATCH_REPORT_STAMP=$(date +%Y%m%d_%H%M%S)

cd sveltekit-frontend

# Start server
npm run dev &
SERVER_PID=$!
sleep 10

# Run analysis
RUNID=$(curl -X POST http://localhost:5173/api/internal/error-brain/run | jq -r .runId)
echo "Run ID: $RUNID"

# Wait for completion
for i in {1..60}; do
  STATUS=$(curl -s http://localhost:5173/api/internal/error-brain/status/$RUNID | jq -r .step)
  echo "Status: $STATUS"

  if [ "$STATUS" = "done" ] || [ "$STATUS" = "failed" ]; then
    break
  fi

  sleep 5
done

# Get final results
curl -s http://localhost:5173/api/internal/error-brain/status/$RUNID | jq .

# Cleanup
kill $SERVER_PID

# Check reports
cat reports/runs/${RUNID}.json
ls -lh reports/patches/${BATCH_REPORT_STAMP}/${RUNID}/
```

## Artifact Structure

After CI run, artifacts contain:

```
reports/
├── runs/
│   └── rb_20251215_191015_a3f2.json
├── patches/
│   └── 123456/  # GitHub run ID or timestamp
│       └── rb_20251215_191015_a3f2/
│           ├── apply-log.json
│           ├── file_a_ts.diff
│           └── file_b_ts.diff
└── incidents/
    └── syntax-corruption-2025-12-15.md
```

## Report Parsing

### Extract Patch Count
```bash
jq '.counters.patchesProposed' reports/runs/rb_*.json
```

### List All Diffs
```bash
find reports/patches -name "*.diff" -type f
```

### Check for High-Confidence Patches
```bash
jq '.applied[] | select(.confidence >= 0.95)' reports/patches/*/rb_*/apply-log.json
```

## Fail CI on Errors

```yaml
- name: Fail if errors found
  run: |
    ERROR_COUNT=$(jq '.counters.errorsFound' reports/runs/${{ env.RUNID }}.json)
    if [ "$ERROR_COUNT" -gt 0 ]; then
      echo "Found $ERROR_COUNT errors"
      exit 1
    fi
```

## Fail CI on Rejected Patches

```yaml
- name: Fail if patches rejected
  run: |
    REJECTED_COUNT=$(jq '.counters.patchesRejected' reports/runs/${{ env.RUNID }}.json)
    if [ "$REJECTED_COUNT" -gt 0 ]; then
      echo "Rejected $REJECTED_COUNT patches"
      exit 1
    fi
```

## Slack Notification

```yaml
- name: Notify Slack
  if: always()
  run: |
    STATUS=$(curl -s http://localhost:5173/api/internal/error-brain/status/${{ env.RUNID }} | jq -r .step)
    ERRORS=$(jq '.counters.errorsFound' reports/runs/${{ env.RUNID }}.json)
    PATCHES=$(jq '.counters.patchesProposed' reports/runs/${{ env.RUNID }}.json)

    curl -X POST ${{ secrets.SLACK_WEBHOOK_URL }} \
      -H 'Content-Type: application/json' \
      -d '{
        "text": "Error Brain Analysis Complete",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "*Status*: '$STATUS'\n*Errors*: '$ERRORS'\n*Patches*: '$PATCHES'"
            }
          }
        ]
      }'
```

## Best Practices

1. **Always use `off` mode** in CI
2. **Set deterministic `BATCH_REPORT_STAMP`** (use CI run ID)
3. **Archive reports** as artifacts with 30-day retention
4. **Parse JSON** for machine-readable metrics
5. **Add PR comments** with analysis summary
6. **Fail on errors** if enforcing zero-error policy
7. **Test locally** with `ci-test.sh` before pushing

## Troubleshooting

### Server not starting
```yaml
- name: Wait for server
  run: |
    for i in {1..30}; do
      curl -s http://localhost:5173 && break
      sleep 1
    done
```

### Timeout waiting for analysis
```yaml
- name: Increase timeout
  run: |
    for i in {1..120}; do  # 10 minutes
      STATUS=$(curl -s http://localhost:5173/api/internal/error-brain/status/$RUNID | jq -r .step)
      # ...
    done
```

### No reports generated
- Verify `ERROR_BRAIN_ENABLED=1`
- Check `reports/` directory permissions
- Review Error Brain logs in server output
