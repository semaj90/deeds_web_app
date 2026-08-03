declare module '@qdrant/js-client' {
  export type Qdrant = any;
}

declare module '@atlas/semantic-contracts' {
  export interface DomainPrediction {
    classificationRunId: string;
    prediction_id: string;
    packet_key: string;
    predicted_domain: string;
  }

  export interface OntologyProposal {
    proposalId: string;
  }
}
