#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deriveTopicIdentityV1, TOPIC_TAXONOMY_REVISION } from '../../sveltekit-frontend/src/lib/server/atlas/knowledge/topic-identity-v1.js';

type TopicCluster = { topic?: string; count?: number; changes?: string[] };

function checksum(value: unknown): string {
	return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

const cwd = process.cwd();
const reportsDir = process.argv[2] ?? path.resolve(cwd, 'docs/reports');
const inputPath = process.argv[3] ?? path.join(reportsDir, 'openspec-topic-clusters-v1.json');
const outputPath = process.argv[4] ?? path.join(reportsDir, 'topic-identity-readiness-v1.json');

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as {
	topics?: TopicCluster[];
	counts?: Record<string, number>;
};
const topics = Array.isArray(input.topics) ? input.topics : [];
const sourceRevision = checksum({ inputPath: path.relative(cwd, inputPath), input });
const identities = topics
	.map((cluster) => {
		const label = String(cluster.topic ?? '').trim();
		if (!label) return null;
		const identity = deriveTopicIdentityV1({
			label,
			taxonomyRevision: TOPIC_TAXONOMY_REVISION,
			sourceRef: `${path.relative(cwd, inputPath)}#topic/${encodeURIComponent(label)}`,
			sourceRevision,
		});
		return {
			...identity,
			clusterCount: Number(cluster.count ?? 0),
			changeCount: Array.isArray(cluster.changes) ? cluster.changes.length : 0,
		};
	})
	.filter((identity): identity is NonNullable<typeof identity> => Boolean(identity))
	.sort((a, b) => a.normalizedLabel.localeCompare(b.normalizedLabel));

const topicIds = new Set(identities.map((identity) => identity.topicId));
const titleIds = new Set(identities.map((identity) => identity.titleId));
const duplicateTopicIds = identities.length - topicIds.size;
const duplicateTitleIds = identities.length - titleIds.size;
const output = {
	schema: 'atlas.topic-identity-readiness.v1',
	status: duplicateTopicIds || duplicateTitleIds ? 'REVIEW_REQUIRED' : 'DERIVED_TOPIC_IDENTITIES_PROVEN',
	taxonomyRevision: TOPIC_TAXONOMY_REVISION,
	source: {
		path: path.relative(cwd, inputPath),
		revision: sourceRevision,
		clusterCount: topics.length,
	},
	summary: {
		topicCount: identities.length,
		uniqueTopicIds: topicIds.size,
		uniqueTitleIds: titleIds.size,
		duplicateTopicIds,
		duplicateTitleIds,
	},
	identities,
	storageBoundary: {
		postgresTopicTable: 'NOT_CREATED',
		drizzleMigration: 'NOT_APPLIED',
		adminProjection: 'READ_ONLY_REPORT',
	},
	canonicalAuthority: false,
	promotionAuthorized: false,
	writesPerformed: false,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ schema: output.schema, status: output.status, ...output.summary, writesPerformed: false }, null, 2));
