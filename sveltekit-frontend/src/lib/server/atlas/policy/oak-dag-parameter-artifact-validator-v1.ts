import { parameterArtifactV1Schema, type ParameterArtifactV1 } from '@deeds/parent-atlas';
import {
  OAK_DAG_PARAMETER_SCHEMA_REFS,
  oakDagAstEvidenceInputSchema,
  oakDagGraphExpandInputSchema,
  oakDagTokenBudgetParameterSchema,
  oakDagTopKParameterSchema,
} from './oak-dag-owner-input-schemas-v1.js';

/**
 * Validates generic parameter artifacts against the exact owner schema for
 * their declared parameter reference. This is an admission helper only: it
 * performs no execution and has no mutation authority.
 */
export function validateOakDagParameterArtifactV1(input: unknown): ParameterArtifactV1 {
  const artifact = parameterArtifactV1Schema.parse(input);
  switch (artifact.schemaRef) {
    case OAK_DAG_PARAMETER_SCHEMA_REFS.TOP_K:
      oakDagTopKParameterSchema.parse(artifact.boundArguments);
      break;
    case OAK_DAG_PARAMETER_SCHEMA_REFS.TOKEN_BUDGET:
      oakDagTokenBudgetParameterSchema.parse(artifact.boundArguments);
      break;
    case 'param:graph-hop-bound':
      oakDagGraphExpandInputSchema.parse(artifact.boundArguments);
      break;
    case 'param:ast-evidence':
      // The AST evidence owner already requires exact tree-node and source
      // revision inputs; this branch only validates the artifact envelope.
      oakDagAstEvidenceInputSchema.parse(artifact.boundArguments);
      break;
    default:
      throw new Error(`OAK_DAG_PARAMETER_SCHEMA_UNSUPPORTED:${artifact.schemaRef}`);
  }
  return artifact;
}
