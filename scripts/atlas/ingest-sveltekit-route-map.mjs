#!/usr/bin/env node
import { loadConfig, loadRouteMap, loadRouteGapAtlas, loadClusterAliases, resolveRepoPath, writeJson, writeMarkdown, parentAtlasMarkdown, routeSummary } from './_atlas-utils.mjs';

const config = loadConfig();
const routeMap = loadRouteMap(config);
if (!routeMap) throw new Error(`Missing route map: ${config.sources.routeMap}`);

const gapAtlas = loadRouteGapAtlas(config);
const aliases = loadClusterAliases(config);
const summary = routeSummary(routeMap);
const routes = routeMap.records ?? routeMap.routes ?? [];

const payload = { repo: config.repoName, generatedAt: new Date().toISOString(), summary, gapCount: gapAtlas?.gaps?.length ?? 0, aliasCount: Object.keys(aliases ?? {}).length, routes: routes.slice(0, 250) };

writeJson(resolveRepoPath(config.outputs.routeAtlasJson), payload);
writeMarkdown(resolveRepoPath(config.outputs.routeAtlasMd), parentAtlasMarkdown('Repo SvelteKit Route Atlas', summary, [`gap count: ${payload.gapCount}`, `cluster aliases: ${payload.aliasCount}`, `route map source: ${config.sources.routeMap}`]));

console.log(`Route atlas written to ${config.outputs.routeAtlasJson}`);
