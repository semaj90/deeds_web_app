import { caseResolvers } from './caseResolver.js';
import { evidenceResolvers } from './evidenceResolver.js';
import { searchResolvers } from './searchResolver.js';
import { timelineResolvers } from './timelineResolver.js';
import { GraphQLScalarType, Kind } from 'graphql';

const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON custom scalar type',
  serialize(value: any) {
    return value;
  },
  parseValue(value: any) {
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.OBJECT) {
      return JSON.parse(JSON.stringify(ast));
    }
    return null;
  },
});

export const resolvers = {
  JSON: JSONScalar,
  Query: {
    ...caseResolvers.Query,
    ...evidenceResolvers.Query,
    ...searchResolvers.Query,
    health: () => 'OK',
  },
  Mutation: {
    ...caseResolvers.Mutation,
    ...evidenceResolvers.Mutation,
    ...timelineResolvers.Mutation,
  },
  Case: caseResolvers.Case,
  Evidence: evidenceResolvers.Evidence,
};
