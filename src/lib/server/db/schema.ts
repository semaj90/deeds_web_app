export const packetTopologyProjection = pgTable(
  "packet_topology_projection",
  {
    packetKey: text("packet_key").primaryKey(),
    featureId: text("feature_id").notNull(),
    sourceRef: text("source_ref"),
    domain: text("domain"),
    clusterKey: text("cluster_key"),
    clusterId: integer("cluster_id"),
    kmeansCluster: integer("kmeans_cluster"),
    somCluster: integer("som_cluster"),
    somRow: integer("som_row"),
    somCol: integer("som_col"),

    communityId: text("community_id"),
    topologyLabel: text("topology_label"),
    ontologyLabel: text("ontology_label"),

    manifoldX: doublePrecision("manifold_x"),
    manifoldY: doublePrecision("manifold_y"),
    manifoldZ: doublePrecision("manifold_z"),
    manifoldW: doublePrecision("manifold_w"),
    qdrantPointId: text("qdrant_point_id"),
    qdrantJoinable: boolean("qdrant_joinable").default(false),
    redisHotKey: text("redis_hot_key"),
    neo4jNodeKey: text("neo4j_node_key"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
  }
);

export const packetTopologyProjectionIndexes = pgTable("packet_topology_projection_indexes", {
  // Index definitions here
});