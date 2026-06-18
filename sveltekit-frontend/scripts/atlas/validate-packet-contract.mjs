#!/usr/bin/env node
import { main } from './validate-addressable-packets.mjs';

main().catch((error) => {
  console.error('[atlas:packets:contract:validate] Failed:', error);
  process.exitCode = 1;
});

