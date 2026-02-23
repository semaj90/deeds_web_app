export const typeDefs = `#graphql
  type Case {
    id: ID!
    caseNumber: String!
    title: String!
    description: String
    status: String!
    metadata: JSON
    evidences: [Evidence!]!
    timeline: [TimelineEvent!]!
    createdAt: String!
    updatedAt: String!
  }

  type Evidence {
    id: ID!
    caseId: ID
    fileName: String!
    fileSize: Int
    mimeType: String
    storagePath: String!
    ocrText: String
    summary: String
    entities: [Entity!]!
    forensicFlags: [ForensicFlag!]!
    status: String!
    metadata: JSON
    presignedUrl: String
    createdAt: String!
    updatedAt: String!
  }

  type Entity {
    text: String!
    label: String!
    score: Float!
    start: Int!
    end: Int!
  }

  type ForensicFlag {
    type: String!
    description: String!
    severity: String!
    metadata: JSON
  }

  type TimelineEvent {
    id: ID!
    caseId: ID!
    evidenceId: ID
    eventType: String!
    eventDate: String!
    description: String
    metadata: JSON
    createdAt: String!
  }

  type SearchResult {
    evidence: Evidence!
    score: Float!
  }

  scalar JSON

  type Query {
    case(id: ID!): Case
    cases(status: String, limit: Int, offset: Int): [Case!]!

    evidence(id: ID!): Evidence
    evidences(caseId: ID, status: String, limit: Int, offset: Int): [Evidence!]!

    search(query: String!, caseId: ID, limit: Int): [SearchResult!]!

    health: String!
  }

  type Mutation {
    createCase(input: CreateCaseInput!): Case!
    updateCase(id: ID!, input: UpdateCaseInput!): Case!

    createEvidence(input: CreateEvidenceInput!): Evidence!
    uploadEvidence(caseId: ID!, file: Upload!): Evidence!

    addTimelineEvent(input: CreateTimelineEventInput!): TimelineEvent!
  }

  input CreateCaseInput {
    caseNumber: String!
    title: String!
    description: String
    metadata: JSON
  }

  input UpdateCaseInput {
    title: String
    description: String
    status: String
    metadata: JSON
  }

  input CreateEvidenceInput {
    caseId: ID!
    fileName: String!
    storagePath: String!
    fileSize: Int
    mimeType: String
    metadata: JSON
  }

  input CreateTimelineEventInput {
    caseId: ID!
    evidenceId: ID
    eventType: String!
    eventDate: String!
    description: String
    metadata: JSON
  }

  scalar Upload
`;
