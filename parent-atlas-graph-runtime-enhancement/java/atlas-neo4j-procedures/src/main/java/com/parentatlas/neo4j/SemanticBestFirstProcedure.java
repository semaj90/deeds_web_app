package com.parentatlas.neo4j;
import org.neo4j.procedure.Description;
import org.neo4j.procedure.Mode;
import org.neo4j.procedure.Procedure;
import java.util.stream.Stream;

public class SemanticBestFirstProcedure {
  public record Result(String status,String message){}
  @Procedure(name="atlas.semanticBestFirst",mode=Mode.READ)
  @Description("EXPERIMENTAL placeholder; prototype/evaluate externally first.")
  public Stream<Result> semanticBestFirst(){
    return Stream.of(new Result("EXPERIMENTAL_NOT_IMPLEMENTED",
      "Do not install until Domain #10 proves external semantic-best-first."));
  }
}
