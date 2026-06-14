#!/usr/bin/env node

// Compatibility wrapper so package.json can point to a real local script path.
// The underlying audit script writes the actual report and exits with its own status.
import './audit-feature-metadata-columns.mjs';
