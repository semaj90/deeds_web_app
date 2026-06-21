# Provenance Tree & Anchor Stability Report

Generated at: 2026-06-21T00:20:32.416Z

## Stability Statistics

| Metric | Value |
|---|---|
| Total Packet Matches | 247 |
| Valid Joins (`story/task/worker → packet_key → source_ref → feature_id`) | 247 |
| Broken / Ambiguous Joins | 0 |
| **Join Stability Score** | **100%** |

## Provenance Tree Hierarchy

### 📁 Story: `proof-quality-lane`
  * 🔨 Task: `atlas:replay:breadth:50`
    * 👤 Worker: `james`
      * 🔍 Query Hash: `50369362` (Trace: `ed54f5b1-f9b5-4144-b9e6-fa7d83346a80`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `87664693` (Trace: `3ed922af-e8bd-4e53-a3bb-1f0fa8df2d24`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:aee2fe2a`
          * 📁 Source: `src/lib/server/db/migrations/002_enhanced_schema_with_qdrant.sql`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:ff0682f9`
          * 📁 Source: `src/lib/server/ace/ace-agent.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:aee2fe2a`
          * 📁 Source: `src/lib/server/db/migrations/002_enhanced_schema_with_qdrant.sql`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:aee2fe2a`
          * 📁 Source: `src/lib/server/db/migrations/002_enhanced_schema_with_qdrant.sql`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:aee2fe2a`
          * 📁 Source: `src/lib/server/db/migrations/002_enhanced_schema_with_qdrant.sql`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:aee2fe2a`
          * 📁 Source: `src/lib/server/db/migrations/002_enhanced_schema_with_qdrant.sql`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:ff0682f9`
          * 📁 Source: `src/lib/server/ace/ace-agent.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `4062bd7d` (Trace: `bef1468c-8c34-4dfa-baea-4b39eddc6e00`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `84e5b8e3` (Trace: `b4e8acdc-2d0a-465c-aca3-a939253d7b00`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `9a9ab02b` (Trace: `f15bf3a1-9f2a-4041-88d6-f53cec216ab4`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `0bc97f16` (Trace: `3f058c80-5141-40c3-8e37-c4e760f0689c`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `19a94541` (Trace: `b4a27263-d961-4e2f-9823-1bf5ae7c4863`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `d47dcb8a` (Trace: `3f078b2f-d981-4c0d-ba49-e603ac13ab77`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `7e2c4e34` (Trace: `6ea3ab08-0998-4860-99a0-12f775824285`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `31ff3331` (Trace: `e055b109-a579-478a-8abf-d3d3c2e84093`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `40e8540e` (Trace: `ac9ef137-e0b0-4e25-bc84-fbae3535a6b6`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🟢 bifrost (hyperrag:query)
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `09acfdc0` (Trace: `f5c3b318-5596-4e87-a398-6d481c459bcc`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `c02a581a` (Trace: `ead71699-c30a-4ab4-b257-8634f52ff0a8`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `97ee05a3` (Trace: `2c548440-3d73-4566-8d6c-b10a67f1a487`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `91cafa61` (Trace: `bf9d3905-a14f-45be-91e8-ec0537109e9b`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:c0fd4797`
          * 📁 Source: `src/lib/server/inference/inference-router.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:c0fd4797`
          * 📁 Source: `src/lib/server/inference/inference-router.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:c0fd4797`
          * 📁 Source: `src/lib/server/inference/inference-router.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:scripts:8df11bdb`
          * 📁 Source: `src/lib/ai/client-router.ts`
          * 🏷️ Feature ID: `scripts` (scripts)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:scripts:8df11bdb`
          * 📁 Source: `src/lib/ai/client-router.ts`
          * 🏷️ Feature ID: `scripts` (scripts)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `e7f49ba3` (Trace: `e425b02f-7bb2-4d5d-b3e1-d7ebee97c236`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `162a39c6` (Trace: `3dfc5acc-651b-4ee3-a338-f42b0ab3430f`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `eda56c54` (Trace: `1db95fda-c47f-47c2-9024-4a53d7902eca`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `c3a1c45b` (Trace: `6a36184f-1fdd-47b2-935b-f66ac41860ae`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `e48d795d` (Trace: `21f6dce5-863a-4007-b307-1db375428755`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `66eda1f1` (Trace: `521970ca-dc0c-4812-b833-7322f6f22ba5`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `17346cf4` (Trace: `e761e0e4-1d7e-40ab-9db0-01fb84079844`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `b375abfc` (Trace: `3de288f6-a813-40ac-93ae-b9339a81bfbd`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `1ebda541` (Trace: `11e1fcd3-64de-47a7-93af-e17b7e61e077`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `10c59376` (Trace: `7cd86c0c-e53c-4810-ae05-dde5dabab0ca`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `ddb6bf0d` (Trace: `0bfd9b7c-8fcd-4ef3-9587-3852fa7bce79`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `15fa9ec0` (Trace: `67592cea-486e-4198-a27c-085df666e415`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `9ff2cc2a` (Trace: `854d8bad-5a53-4cbe-b9ba-aaecaa5470c6`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `5a58bf9e` (Trace: `740e6aaa-df0f-4bea-a792-38142bd5f2ad`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `6f2e783e` (Trace: `f32a3ec0-04e4-446f-9e86-c196d9e62137`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `df2b7bac` (Trace: `9b72638d-8a5c-40b8-944b-dcf3d5fc36f8`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `3c44975a` (Trace: `2099e81d-d98f-4bc1-9b8e-df3235538065`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `25121c15` (Trace: `2968caf0-4168-4da6-b226-5507ae6f3c04`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `9b72c13d` (Trace: `c61c825b-58ec-4eb2-9e21-6fb626bf0a9f`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `f0d9d0eb` (Trace: `17e333f5-19db-439e-810a-01fd67e2626c`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `4d2a87d6` (Trace: `54b1bd8b-4690-4cf8-be67-41a2cdf9ab07`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `71e28a44` (Trace: `d46b98fb-8125-454c-9528-d5ae30cd529e`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `e4eed3eb` (Trace: `4f34bbc3-8138-43dc-bc51-a6d0f0a0a448`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `8cc4f098` (Trace: `a86ecd62-c0bc-4e6e-94eb-7f4395b81cda`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
      * 🔍 Query Hash: `bc4e4ec8` (Trace: `98565933-9eed-4e75-be08-387a0697d03f`) — Verdict: **PASS**
        * 📦 Packet: `nes:utility:8c023912`
          * 📁 Source: `src/lib/components/ui/gaming/types/gaming-types-minimal.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `nes:utility:9fa84252`
          * 📁 Source: `src/lib/types/svelte5-api-types.d.ts`
          * 🏷️ Feature ID: `utility` (utility)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/services/error-analysis/types.ts`
          * 📁 Source: `src/lib/services/error-analysis/types.ts`
          * 🏷️ Feature ID: `codebase-structure` (codebase-structure)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/case_notes.ts`
          * 📁 Source: `src/lib/server/db/schema/case_notes.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
        * 📦 Packet: `hyperrag:src/lib/server/db/schema/warden_audit_log.ts`
          * 📁 Source: `src/lib/server/db/schema/warden_audit_log.ts`
          * 🏷️ Feature ID: `database_orm` (database_orm)
          * ⚡ Cache Hit: 🔴 MISS
          * 🔗 Join Spine Status: 🟢 STABLE
