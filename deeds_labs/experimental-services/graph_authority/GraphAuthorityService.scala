package legal.ai.graph.authority

import org.neo4j.driver._
import org.neo4j.driver.types._
import scala.concurrent.{Future, ExecutionContext}
import scala.collection.JavaConverters._

class GraphAuthorityService(
  uri: String = "bolt://localhost:7687",
  user: String = "neo4j",
  password: String = "password"
)(implicit ec: ExecutionContext) {

  private val driver = GraphDatabase.driver(uri, AuthTokens.basic(user, password))

  def close(): Unit = driver.close()

  // Create evidence node with authority relationships
  def createEvidenceNode(
    evidenceId: String,
    content: String,
    evidenceType: String,
    credibility: Double,
    sources: Seq[String]
  ): Future[Unit] = Future {
    val session = driver.session()
    try {
      val query = """
        CREATE (e:Evidence {
          id: $evidenceId,
          content: $content,
          type: $evidenceType,
          credibility: $credibility,
          created: datetime(),
          sources: $sources
        })
        WITH e
        UNWIND $sources as source
        MERGE (s:Source {name: source})
        CREATE (e)-[:SOURCED_FROM]->(s)
        """

      session.run(query, Map(
        "evidenceId" -> evidenceId,
        "content" -> content,
        "evidenceType" -> evidenceType,
        "credibility" -> credibility,
        "sources" -> sources.asJava
      ).asJava)
    } finally {
      session.close()
    }
  }

  // Create authority relationship between entities
  def createAuthorityRelationship(
    fromEntity: String,
    toEntity: String,
    relationshipType: String,
    strength: Double,
    evidence: Seq[String]
  ): Future[Unit] = Future {
    val session = driver.session()
    try {
      val query = """
        MERGE (from:Entity {name: $fromEntity})
        MERGE (to:Entity {name: $toEntity})
        CREATE (from)-[r:AUTHORITY {
          type: $relationshipType,
          strength: $strength,
          created: datetime(),
          evidence: $evidence
        }]->(to)
        """

      session.run(query, Map(
        "fromEntity" -> fromEntity,
        "toEntity" -> toEntity,
        "relationshipType" -> relationshipType,
        "strength" -> strength,
        "evidence" -> evidence.asJava
      ).asJava)
    } finally {
      session.close()
    }
  }

  // Query authority path between entities
  def findAuthorityPath(
    startEntity: String,
    endEntity: String,
    maxDepth: Int = 5
  ): Future[Seq[AuthorityPath]] = Future {
    val session = driver.session()
    try {
      val query = s"""
        MATCH path = (start:Entity {name: $$startEntity})
                        -[rels:AUTHORITY*1..$maxDepth]->
                        (end:Entity {name: $$endEntity})
        RETURN path,
               reduce(totalStrength = 0, r IN rels | totalStrength + r.strength) as totalStrength,
               length(path) as pathLength
        ORDER BY totalStrength DESC
        LIMIT 10
        """

      val result = session.run(query, Map(
        "startEntity" -> startEntity,
        "endEntity" -> endEntity
      ).asJava)

      result.asScala.map { record =>
        val path = record.get("path").asPath()
        val totalStrength = record.get("totalStrength").asDouble()
        val pathLength = record.get("pathLength").asInt()

        AuthorityPath(
          nodes = path.nodes().asScala.map(_.get("name").asString()).toSeq,
          relationships = path.relationships().asScala.map { rel =>
            AuthorityRelationship(
              from = rel.startNode().get("name").asString(),
              to = rel.endNode().get("name").asString(),
              relationshipType = rel.get("type").asString(),
              strength = rel.get("strength").asDouble(),
              evidence = rel.get("evidence").asList().asScala.map(_.toString).toSeq
            )
          }.toSeq,
          totalStrength = totalStrength,
          pathLength = pathLength
        )
      }.toSeq
    } finally {
      session.close()
    }
  }

  // Calculate entity authority score
  def calculateAuthorityScore(entityName: String): Future[Double] = Future {
    val session = driver.session()
    try {
      val query = """
        MATCH (e:Entity {name: $entityName})-[r:AUTHORITY]-()
        RETURN sum(r.strength) as authorityScore
        """

      val result = session.run(query, Map("entityName" -> entityName).asJava)
      if (result.hasNext) {
        result.next().get("authorityScore").asDouble(0.0)
      } else {
        0.0
      }
    } finally {
      session.close()
    }
  }

  // Detect conflicts in authority relationships
  def detectAuthorityConflicts(): Future[Seq[AuthorityConflict]] = Future {
    val session = driver.session()
    try {
      val query = """
        MATCH (a:Entity)-[r1:AUTHORITY]->(b:Entity),
              (a)-[r2:AUTHORITY]->(b)
        WHERE r1 <> r2 AND
              ((r1.type = 'supports' AND r2.type = 'contradicts') OR
               (r1.type = 'contradicts' AND r2.type = 'supports'))
        RETURN a.name as entityA, b.name as entityB,
               collect({type: r1.type, strength: r1.strength, evidence: r1.evidence}) as rel1,
               collect({type: r2.type, strength: r2.strength, evidence: r2.evidence}) as rel2
        """

      val result = session.run(query)
      result.asScala.map { record =>
        AuthorityConflict(
          entityA = record.get("entityA").asString(),
          entityB = record.get("entityB").asString(),
          conflictingRelationships = Seq(
            ConflictingRelationship(
              relationshipType = record.get("rel1").asList().get(0).asMap().get("type").toString,
              strength = record.get("rel1").asList().get(0).asMap().get("strength").toString.toDouble,
              evidence = record.get("rel1").asList().get(0).asMap().get("evidence").asList().asScala.map(_.toString).toSeq
            ),
            ConflictingRelationship(
              relationshipType = record.get("rel2").asList().get(0).asMap().get("type").toString,
              strength = record.get("rel2").asList().get(0).asMap().get("strength").toString.toDouble,
              evidence = record.get("rel2").asList().get(0).asMap().get("evidence").asList().asScala.map(_.toString).toSeq
            )
          )
        )
      }.toSeq
    } finally {
      session.close()
    }
  }
}

// Data structures
case class AuthorityPath(
  nodes: Seq[String],
  relationships: Seq[AuthorityRelationship],
  totalStrength: Double,
  pathLength: Int
)

case class AuthorityRelationship(
  from: String,
  to: String,
  relationshipType: String,
  strength: Double,
  evidence: Seq[String]
)

case class AuthorityConflict(
  entityA: String,
  entityB: String,
  conflictingRelationships: Seq[ConflictingRelationship]
)

case class ConflictingRelationship(
  relationshipType: String,
  strength: Double,
  evidence: Seq[String]
)