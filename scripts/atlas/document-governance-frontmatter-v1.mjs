import { parseDocument } from 'yaml';

const statuses = new Set([
  'CANONICAL_CURRENT', 'ACTIVE_SUPPORTING', 'EXPERIMENTAL', 'LEGACY_REFERENCE',
  'SUPERSEDED', 'ARCHIVE_READY', 'ARCHIVED', 'CONFLICT', 'UNCLASSIFIED',
]);

function field(mapping, camel, snake, issues) {
  if (Object.hasOwn(mapping, camel) && Object.hasOwn(mapping, snake)) {
    issues.push(`DUPLICATE_FRONTMATTER_FIELD:${camel}/${snake}`);
    return undefined;
  }
  return Object.hasOwn(mapping, camel) ? mapping[camel] : mapping[snake];
}

function topicList(value, name, issues) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(item))) {
    issues.push(`INVALID_FRONTMATTER_FIELD:${name}`);
    return [];
  }
  if (new Set(value).size !== value.length) issues.push(`DUPLICATE_FRONTMATTER_VALUES:${name}`);
  return [...new Set(value)].sort();
}

export function extractDocumentGovernanceFrontmatterV1(text, baseStatus = 'UNCLASSIFIED') {
  const match = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/.exec(text);
  const defaults = {
    status: baseStatus,
    topicIds: [],
    canonicalForTopics: [],
    topicOwnershipStatus: 'UNASSIGNED',
    validationStatus: 'NOT_CHECKED',
    contradictions: [],
  };
  if (!match) return defaults;

  const parsed = parseDocument(match[1], { uniqueKeys: true });
  const issues = parsed.errors.map((error) => `INVALID_FRONTMATTER_YAML:${error.code}`);
  const mapping = parsed.toJS();
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
    issues.push('FRONTMATTER_ROOT_MUST_BE_MAPPING');
  }
  if (issues.length) return { ...defaults, status: 'UNCLASSIFIED', validationStatus: 'FAILED', contradictions: issues };

  const governanceStatus = field(mapping, 'documentStatus', 'document_status', issues);
  const rawTopics = field(mapping, 'topicIds', 'topic_ids', issues);
  const rawCanonicalTopics = field(mapping, 'canonicalForTopics', 'canonical_for_topics', issues);
  let topicIds = topicList(rawTopics, 'topicIds', issues);
  const canonicalForTopics = topicList(rawCanonicalTopics, 'canonicalForTopics', issues);

  if (governanceStatus !== undefined && (typeof governanceStatus !== 'string' || !statuses.has(governanceStatus))) {
    issues.push('INVALID_FRONTMATTER_FIELD:documentStatus');
  }
  if (canonicalForTopics.some((topic) => !topicIds.includes(topic))) {
    issues.push('CANONICAL_TOPIC_NOT_DECLARED_IN_TOPIC_IDS');
  }

  let status = typeof governanceStatus === 'string' && statuses.has(governanceStatus)
    ? governanceStatus
    : baseStatus;
  if (canonicalForTopics.length > 0 && status !== 'CANONICAL_CURRENT') {
    issues.push('CANONICAL_TOPICS_REQUIRE_CANONICAL_CURRENT_STATUS');
  }
  if (issues.length) {
    return { ...defaults, status: 'UNCLASSIFIED', validationStatus: 'FAILED', contradictions: issues };
  }

  return {
    status,
    topicIds,
    canonicalForTopics,
    topicOwnershipStatus: topicIds.length ? 'ASSIGNED' : 'UNASSIGNED',
    validationStatus: 'NOT_CHECKED',
    contradictions: [],
  };
}
