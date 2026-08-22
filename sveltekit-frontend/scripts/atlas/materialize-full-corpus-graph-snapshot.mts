#!/usr/bin/env tsx
/**
 * Compatibility entrypoint.
 *
 * The revision-qualified implementation lives in
 * materialize-full-corpus-graph-snapshot-v3.mts. Keeping this filename avoids
 * changing operator commands while ensuring Git HEAD / env strings can no
 * longer act as workspace revision authority.
 */
import './materialize-full-corpus-graph-snapshot-v3.mts';
