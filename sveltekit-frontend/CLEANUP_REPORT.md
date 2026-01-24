╔════════════════════════════════════════════════════════════════╗
║        WORKSPACE CLEANUP REPORT - DEEDS WEB APP                ║
║        Generated: 2026-01-23 19:57:27                     ║
╚════════════════════════════════════════════════════════════════╝

📊 SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current Error Count: 8,995 errors in 972 files
Primary Issue: Duplicate code in backup folders causing cascading errors

🗂️  MAJOR BACKUP DIRECTORIES (Size > 1MB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL (Contains full source duplicates):
  📁 src.backup.20260104_111218    281.23 MB  ⚠️  MASSIVE DUPLICATE
  📁 src.backup                     82.29 MB  ⚠️  DUPLICATE SOURCE
  📁 backups                        18.78 MB
  📁 src_fixed                      13.39 MB  ⚠️  TEMPORARY FIX FOLDER

MEDIUM (Partial backups):
  📁 agentic-error-resolution/fixed  6.97 MB
  📁 .phase72-backups                4.00 MB
  📁 scripts/phase104-backups        3.98 MB

SMALL (Reports & misc):
  📁 reports/backups-* (multiple)   ~8-12 MB total
  📁 drizzle/meta_backup             0.80 MB
  📁 .codemod-backups                0.00 MB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL BACKUP SIZE: ~427 MB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 INDIVIDUAL BACKUP FILES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Files with extensions: .backup, .bak, .tmp, .old, .fixed.*
Located across src/ directories (exact count in progress...)

🎯 RECOMMENDED ACTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 1 - Delete Major Duplicates:
  Remove-Item src.backup.20260104_111218 -Recurse -Force
  Remove-Item src.backup -Recurse -Force
  Remove-Item src_fixed -Recurse -Force
  
  Expected Impact: Reduce ~377 MB, eliminate ~3000-4000 duplicate errors

PRIORITY 2 - Clean Phase Backups:
  Remove-Item .phase72-backups -Recurse -Force
  Remove-Item scripts/phase104-backups -Recurse -Force
  Remove-Item agentic-error-resolution/fixed -Recurse -Force
  
  Expected Impact: Reduce ~15 MB

PRIORITY 3 - Clean Report Backups:
  Remove-Item reports/backups-* -Recurse -Force
  
  Expected Impact: Reduce ~12 MB

📈 EXPECTED RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before:  9,165 errors in 982 files
After Priority 1: ~5,000-6,000 errors (estimate)
After All: ~3,000-4,000 errors (real codebase issues)

Disk Space Freed: ~427 MB

