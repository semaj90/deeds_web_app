/**
 * MCP Tool Wrapper: find_schema_dependents
 *
 * Wires schema-dependents tool into MCP tool registry
 * Callable as: atlas-tools.find_schema_dependents(table)
 *
 * Responsibility: This is just MCP wiring. Core logic lives in schema-dependents.ts
 */

import { findSchemaDependents } from '../tools/schema-dependents';

export const findSchemaDependentsTool = {
  name: 'find_schema_dependents',
  description: 'Find all files/functions that depend on a table; returns migration risk and ACE context',
  inputSchema: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        description: 'Table name (e.g., "users", "cases")'
      },
      includeAce: {
        type: 'boolean',
        default: true,
        description: 'Include ACE context packet in response'
      }
    },
    required: ['table']
  },

  async execute(input: any, context: any) {
    try {
      const { table, includeAce = true } = input;

      const response = await findSchemaDependents(
        { table, includeAce },
        {
          neo4j: context.neo4j || null,
          postgres: context.postgres || null
        }
      );

      return {
        success: true,
        data: response
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to find schema dependents'
      };
    }
  }
};
