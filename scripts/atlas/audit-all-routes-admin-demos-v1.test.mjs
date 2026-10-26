import { describe, expect, it } from 'vitest';
import {
  auditCatalogOrganization,
  buildRouteInventory,
  discoverFilesystemRoutes,
  resolveRouteFields,
  scanRouteSourceHealth,
} from './audit-all-routes-admin-demos-v1.mjs';

describe('ALL-ROUTES-ADMIN-DEMOS-AUDIT-01', () => {
  const routes = discoverFilesystemRoutes();
  const catalogAudit = auditCatalogOrganization(routes);
  const inventory = buildRouteInventory(routes);

  it('indexes 100% of static /demos/* routes with zero broken demo catalog links', () => {
    expect(catalogAudit.demosCatalog.brokenDemoLinks).toEqual([]);
    expect(catalogAudit.demosCatalog.unindexedDemoPages).toEqual([]);
    expect(catalogAudit.demosCatalog.actualDemoRoutesCount).toBeGreaterThanOrEqual(82);
  });

  it('indexes 100% of static /admin/* routes with zero broken admin catalog links', () => {
    expect(catalogAudit.adminCatalog.brokenAdminLinks).toEqual([]);
    expect(catalogAudit.adminCatalog.unindexedAdminPages).toEqual([]);
    expect(catalogAudit.adminCatalog.actualAdminRoutesCount).toBeGreaterThanOrEqual(46);
  });

  it('supports phase72 routePath/filePath resolution, resolveRouteFields, and lineage separation in /admin/all-routes/+page.server.ts', () => {
    expect(catalogAudit.allRoutesLoader.supportsPhase72RoutePath).toBe(true);
    expect(catalogAudit.allRoutesLoader.exportsResolveRouteFields).toBe(true);
    expect(catalogAudit.allRoutesLoader.enforcesLineageSeparation).toBe(true);
    expect(catalogAudit.allRoutesLoader.mergesLiveRouteEndpoints).toBe(true);

    const valid = resolveRouteFields({
      id: 'route__app__admin_atlas',
      routePath: '/admin/atlas',
      filePath: 'src/routes/(app)/admin/atlas/+page.svelte',
    });
    expect(valid.ok).toBe(true);
    expect(valid.lineageStatus).toBe('PROVEN');

    const invalid = resolveRouteFields({ id: 'missing_path' });
    expect(invalid.ok).toBe(false);
    expect(invalid.reason).toBe('MISSING_ROUTE_PATH');
  });

  it('reconciles filesystem denominators (202 static + 35 dynamic = 237) and preserves provenance separation', () => {
    expect(inventory.denominators.totalFilesystemPages).toBe(
      inventory.denominators.staticFilesystemPages + inventory.denominators.dynamicFilesystemPages
    );
    expect(inventory.denominators.totalFilesystemPages).toBeGreaterThanOrEqual(237);
    expect(
      inventory.denominators.lineageBreakdown.PROVEN +
        inventory.denominators.lineageBreakdown.PARTIAL +
        inventory.denominators.lineageBreakdown.MISSING
    ).toBe(inventory.denominators.totalFilesystemPages);
  });

  it('verifies zero broken $lib/... imports across all /admin/* and /demos/* pages', () => {
    const sourceHealth = scanRouteSourceHealth(routes.pages, routes.apis);
    expect(sourceHealth.brokenLibImports).toEqual([]);
  });
});
