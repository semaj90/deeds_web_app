#requires -Version 7.0
[CmdletBinding()]
param(
  [ValidateSet('Install','Smoke','All')][string]$Mode='All',
  [string]$RepoRoot='C:\Users\james\Videos\deeds-web-app',
  [switch]$CloneSources,
  [switch]$WriteScaffolds,
  [string]$LlamaBaseUrl='http://127.0.0.1:8090/v1',
  [string]$OllamaBaseUrl='http://127.0.0.1:11434',
  [string]$QdrantUrl='http://127.0.0.1:6333',
  [string]$QdrantCollection='codebase_chunks_768_v2',
  [string]$ValkeyContainer='legal-ai-valkey',
  [string]$PgHost='127.0.0.1',
  [int]$PgPort=5434,
  [string]$PgDatabase='legal_ai_db',
  [string]$PgUser='legal_admin'
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'

$ToolRoot=Join-Path $RepoRoot 'tools\agentic-research'
$Venv=Join-Path $ToolRoot '.venv'
$Py=Join-Path $Venv 'Scripts\python.exe'
$NodeRoot=Join-Path $ToolRoot 'node'
$SrcRoot=Join-Path $ToolRoot 'src'
$ScaffoldRoot=Join-Path $ToolRoot 'scaffolds'
$ReportRoot=Join-Path $RepoRoot 'docs\reports'
$JsonReport=Join-Path $ReportRoot 'agentic-research-readiness-latest.json'
$MdReport=Join-Path $ReportRoot 'agentic-research-readiness-latest.md'
$Results=[System.Collections.Generic.List[object]]::new()

function Add-Result([string]$Check,[string]$Status,[string]$Detail,[hashtable]$Data=@{}) {
  $Results.Add([pscustomobject][ordered]@{check=$Check;status=$Status;detail=$Detail;data=$Data;timestamp=(Get-Date).ToUniversalTime().ToString('o')})
  Write-Host "[$Status] $Check :: $Detail"
}
function Ensure-Dir([string]$Path){New-Item -ItemType Directory -Force -Path $Path|Out-Null}
function Has-Cmd([string]$Name){$null-ne(Get-Command $Name -ErrorAction SilentlyContinue)}
function Run([string]$Exe,[string[]]$CmdArgs,[int]$Timeout=600,[switch]$AllowFailure){
  $o=[IO.Path]::GetTempFileName();$e=[IO.Path]::GetTempFileName()
  try{$p=Start-Process $Exe -ArgumentList $CmdArgs -NoNewWindow -PassThru -RedirectStandardOutput $o -RedirectStandardError $e
    if(-not $p.WaitForExit($Timeout*1000)){try{$p.Kill($true)}catch{};throw "Timeout: $Exe $($CmdArgs-join ' ')"}
    $so="$(Get-Content $o -Raw -ErrorAction SilentlyContinue)".Trim();$se="$(Get-Content $e -Raw -ErrorAction SilentlyContinue)".Trim()
    if($p.ExitCode -ne 0 -and -not $AllowFailure){throw "Command failed ($($p.ExitCode)): $Exe $($CmdArgs-join ' ')`n$so`n$se"}
    [pscustomobject]@{ExitCode=$p.ExitCode;StdOut=$so;StdErr=$se}
  }finally{Remove-Item $o,$e -Force -ErrorAction SilentlyContinue}
}
function Get-Json([string]$Uri){Invoke-RestMethod -Uri $Uri -Method Get -TimeoutSec 15}
function Post-Json([string]$Uri,[hashtable]$Body){Invoke-RestMethod -Uri $Uri -Method Post -ContentType 'application/json' -Body($Body|ConvertTo-Json -Depth 20 -Compress)-TimeoutSec 120}

function Install-Tools {
  Ensure-Dir $ToolRoot;Ensure-Dir $NodeRoot;Ensure-Dir $SrcRoot;Ensure-Dir $ReportRoot
  if(-not(Test-Path $Py)){
    $r=Run 'py.exe' @('-3.13','-m','venv',$Venv) 180 -AllowFailure
    if($r.ExitCode -ne 0){Run 'py.exe' @('-3','-m','venv',$Venv) 180|Out-Null}
  }
  Run $Py @('-m','pip','install','--upgrade','pip','setuptools','wheel') 300|Out-Null
  $pkgs=@(
    'local-deep-research[mcp]','beautifulsoup4','lxml','html5lib','pydantic>=2','httpx','tenacity','orjson','PyYAML','markdown-it-py','jsonschema',
    'langchain','langchain-core','langchain-community','langgraph','qdrant-client','psycopg[binary]','pgvector','firecrawl-py','rank-bm25',
    'networkx','numpy','scipy','scikit-learn','pandas','grpcio','grpcio-tools','protobuf'
  )
  Run $Py (@('-m','pip','install','--upgrade')+$pkgs) 1800|Out-Null
  $pkg=Join-Path $NodeRoot 'package.json'
  if(-not(Test-Path $pkg)){'{"name":"parent-atlas-agentic-research-tools","private":true,"version":"0.0.0"}'|Set-Content $pkg -Encoding utf8NoBOM}
  if(Has-Cmd 'npm.cmd'){Run 'cmd.exe' @('/c','npm','install','--prefix',"`"$NodeRoot`"",'--save-dev','@ast-grep/cli') 600|Out-Null}else{Add-Result 'ast-grep.install' 'FAIL' 'npm.cmd not found'}
  if($CloneSources){
    foreach($r in @(@('local-deep-research','https://github.com/LearningCircuit/local-deep-research.git'),@('firecrawl','https://github.com/mendableai/firecrawl.git'))){
      $target=Join-Path $SrcRoot $r[0]
      if(Test-Path(Join-Path $target '.git')){Add-Result "clone.$($r[0])" 'SKIP' "Already cloned: $target"}
      elseif(Test-Path $target){Add-Result "clone.$($r[0])" 'WARN' "Target exists but is not a Git checkout: $target"}
      elseif(Has-Cmd 'git.exe'){Run 'git.exe' @('clone','--filter=blob:none','--depth','1',$r[1],$target) 1200|Out-Null;Add-Result "clone.$($r[0])" 'PASS' $target}
      else{Add-Result "clone.$($r[0])" 'WARN' 'git.exe not found'}
    }
  }
  if($WriteScaffolds){Write-Scaffolds}
}

function Write-Scaffolds {
  Ensure-Dir $ScaffoldRoot;Ensure-Dir(Join-Path $ScaffoldRoot 'okf-staging')
@'
{
  "$schema":"https://json-schema.org/draft/2020-12/schema",
  "$id":"atlas.research-job.v1",
  "type":"object",
  "required":["schema_version","research_run_id","question","budgets"],
  "properties":{
    "schema_version":{"const":"atlas.research-job.v1"},
    "research_run_id":{"type":"string","minLength":1},
    "question":{"type":"string","minLength":1},
    "budgets":{"type":"object","required":["iterations","questions_per_iteration","max_sources"],"properties":{
      "iterations":{"type":"integer","minimum":1,"maximum":5},
      "questions_per_iteration":{"type":"integer","minimum":1,"maximum":8},
      "max_sources":{"type":"integer","minimum":1,"maximum":100}
    }}
  }
}
'@|Set-Content(Join-Path $ScaffoldRoot 'research-job.schema.json')-Encoding utf8NoBOM
@'
---
type: External Reference
title: Example staged concept
resource: https://example.invalid/
tags: [staging]
lifecycle: { status: staging }
provenance:
  producer: local-deep-research
  research_run_id: research:replace-me
  fetched_at: 1970-01-01T00:00:00Z
  content_hash: sha256:replace-me
trust: { status: unreviewed }
---
# Example staged concept
Replace this scaffold with extracted, cited material before promotion.
'@|Set-Content(Join-Path $ScaffoldRoot 'okf-staging\example.md')-Encoding utf8NoBOM
@'
syntax = "proto3";
package parent_atlas.retrieval.v1;
message SemanticSearchRequest { string query_id=1; repeated float query_vector=2; uint32 top_k=3; string representation_id=4; uint32 representation_revision=5; repeated string allowed_partition_ids=6; }
message SemanticCandidate { string identity_key=1; float score=2; uint32 rank=3; }
message SemanticSearchResponse { string query_id=1; repeated SemanticCandidate candidates=2; string index_revision=3; }
'@|Set-Content(Join-Path $ScaffoldRoot 'retrieval.proto')-Encoding utf8NoBOM
}

function Smoke-Python {
  if(-not(Test-Path $Py)){Add-Result 'python.venv' 'FAIL' "Missing $Venv";return}
  # Write the probe to a temp .py file — passing quoted code through
  # Start-Process -ArgumentList mangles embedded quotes.
  $probe=Join-Path ([IO.Path]::GetTempPath()) 'atlas-ldr-import-probe.py'
  @'
import importlib, json
mods = {"ldr":"local_deep_research","bs4":"bs4","pydantic":"pydantic","langchain":"langchain","langgraph":"langgraph","qdrant":"qdrant_client","psycopg":"psycopg","pgvector":"pgvector","firecrawl":"firecrawl","bm25":"rank_bm25","networkx":"networkx","grpc":"grpc"}
out = {}
for k, v in mods.items():
    m = importlib.import_module(v)
    out[k] = {"ok": True, "version": getattr(m, "__version__", None)}
print(json.dumps(out))
'@|Set-Content $probe -Encoding utf8NoBOM
  $r=Run $Py @($probe) 120 -AllowFailure
  if($r.ExitCode -eq 0){Add-Result 'python.imports' 'PASS' 'LDR/crawler/RAG/Qdrant/pgvector/graph/gRPC imports passed'}else{Add-Result 'python.imports' 'FAIL' $r.StdErr}
}
function Smoke-AstGrep{$exe=Join-Path $NodeRoot 'node_modules\.bin\ast-grep.cmd';if(Test-Path $exe){$r=Run $exe @('--version') 30 -AllowFailure;Add-Result 'ast-grep.cli' $(if($r.ExitCode -eq 0){'PASS'}else{'FAIL'}) ($r.StdOut+$r.StdErr)}else{Add-Result 'ast-grep.cli' 'FAIL' "Missing $exe"}}
function Smoke-Llama{try{$m=Get-Json "$LlamaBaseUrl/models";$ids=@($m.data|% id);Add-Result 'llama.models' 'PASS' ($ids-join ', ') @{models=$ids}}catch{Add-Result 'llama.models' 'FAIL' $_.Exception.Message}}
function Smoke-Embedding{try{$t=Get-Json "$OllamaBaseUrl/api/tags";Add-Result 'ollama.tags' 'PASS' ((@($t.models|% name))-join ', ');$r=Post-Json "$OllamaBaseUrl/api/embed" @{model='embeddinggemma:latest';input='Parent Atlas semantic_768 smoke check'};$v=@($r.embeddings[0]);$ss=0.0;$bad=0;foreach($x in $v){$d=[double]$x;if([double]::IsNaN($d) -or [double]::IsInfinity($d)){$bad++};$ss+=$d*$d};$n=[Math]::Sqrt($ss);$s=if($v.Count -eq 768 -and $bad -eq 0 -and [Math]::Abs($n-1) -lt .01){'PASS'}else{'FAIL'};Add-Result 'embeddinggemma.semantic_768' $s "dim=$($v.Count) finite=$($bad -eq 0) l2=$n" @{dimension=$v.Count;l2=$n}}catch{Add-Result 'embeddinggemma.semantic_768' 'FAIL' $_.Exception.Message}}
function Smoke-Qdrant{
 try{$c=Get-Json "$QdrantUrl/collections";$names=@($c.result.collections|% name);if($names -notcontains $QdrantCollection){Add-Result 'qdrant.collection' 'FAIL' "Missing $QdrantCollection";return};$i=Get-Json "$QdrantUrl/collections/$QdrantCollection";$vec=$i.result.config.params.vectors;$dim=if($vec.psobject.Properties['size']){$vec.size}else{@($vec.psobject.Properties)[0].Value.size};$count=$i.result.points_count;Add-Result 'qdrant.collection' $(if($dim -eq 768){'PASS'}else{'WARN'}) "$QdrantCollection points=$count dim=$dim" @{points=$count;dimension=$dim};$s=Post-Json "$QdrantUrl/collections/$QdrantCollection/points/scroll" @{limit=10;with_payload=$true;with_vector=$false};$pts=@($s.result.points);$fields=@{};foreach($p in $pts){foreach($n in $p.payload.psobject.Properties.Name){$fields[$n]=1+($fields[$n] -as [int])}};$pk=if($fields.ContainsKey('packet_key')){$fields.packet_key}else{0};$ri=if($fields.ContainsKey('representation_id')){$fields.representation_id}else{0};$rn=if($fields.ContainsKey('representation_name')){$fields.representation_name}else{0};Add-Result 'qdrant.payload.sample' 'WARN' "sample=$($pts.Count) packet_key=$pk representation_id=$ri representation_name=$rn" @{fields=$fields};$tag=@('tags','domain','language','representation_name')|?{$fields.ContainsKey($_)}|select -First 1;if($tag){$value=$null;foreach($p in $pts){$x=$p.payload.$tag;if($x -is [array] -and $x.Count){$value=$x[0];break}elseif($null -ne $x -and "$x"){ $value=$x;break}};if($null -ne $value){$f=Post-Json "$QdrantUrl/collections/$QdrantCollection/points/scroll" @{limit=5;with_payload=$true;with_vector=$false;filter=@{must=@(@{key=$tag;match=@{value=$value}})}};Add-Result 'qdrant.tag_filter' 'PASS' "field=$tag value=$value results=$(@($f.result.points).Count)"}else{Add-Result 'qdrant.tag_filter' 'NOT_PROVEN' "No sample value in $tag"}}else{Add-Result 'qdrant.tag_filter' 'NOT_PROVEN' 'No tag-like field in sample'}}catch{Add-Result 'qdrant.collection' 'FAIL' $_.Exception.Message}}
function Smoke-Valkey{if(-not(Has-Cmd 'docker.exe')){Add-Result 'valkey.ping' 'SKIP' 'docker.exe missing';return};$pw=[Environment]::GetEnvironmentVariable('REDIS_PASSWORD');if(-not $pw){$pw='redis'};$a=@('exec',$ValkeyContainer,'valkey-cli');if($pw){$a+=@('-a',$pw,'--no-auth-warning')};$a+='PING';$r=Run 'docker.exe' $a 30 -AllowFailure;if($r.ExitCode -eq 0 -and $r.StdOut -match 'PONG'){Add-Result 'valkey.ping' 'PASS' 'PONG; no keys read or written'}else{Add-Result 'valkey.ping' 'WARN' ($r.StdOut+$r.StdErr)}}
function Smoke-Postgres{if(-not(Has-Cmd 'psql.exe')){Add-Result 'postgres.readonly' 'SKIP' 'psql.exe missing';return};$env:PGHOST=$PgHost;$env:PGPORT="$PgPort";$env:PGDATABASE=$PgDatabase;$env:PGUSER=$PgUser;if(-not $env:PGPASSWORD){$env:PGPASSWORD=[Environment]::GetEnvironmentVariable('DB_PASSWORD')};if(-not $env:PGPASSWORD){Add-Result 'postgres.readonly' 'SKIP' 'PGPASSWORD or DB_PASSWORD is not configured';return};$env:PGCONNECT_TIMEOUT='10';$sqlFile=Join-Path ([IO.Path]::GetTempPath()) 'atlas-pg-readonly-smoke.sql';"BEGIN TRANSACTION READ ONLY; SELECT current_database(),current_setting('server_version'); SELECT extname,extversion FROM pg_extension WHERE extname='vector'; SELECT to_regclass('public.codebase_chunk_index'),to_regclass('public.atlas_packets'); SELECT COUNT(*) FROM codebase_chunk_index; ROLLBACK;"|Set-Content $sqlFile -Encoding utf8NoBOM;$r=Run 'psql.exe' @('-X','-v','ON_ERROR_STOP=1','-At','-f',$sqlFile) 90 -AllowFailure;if($r.ExitCode -eq 0){Add-Result 'postgres.readonly' 'PASS' 'Read-only transaction passed' @{output=$r.StdOut}}else{Add-Result 'postgres.readonly' 'WARN' $r.StdErr}}
function Smoke-Gpu{if(Has-Cmd 'nvidia-smi.exe'){$r=Run 'nvidia-smi.exe' @('--query-gpu=name,memory.total,memory.used,driver_version','--format=csv,noheader,nounits') 30 -AllowFailure;Add-Result 'gpu.nvidia' $(if($r.ExitCode -eq 0){'PASS'}else{'WARN'}) ($r.StdOut+$r.StdErr)}else{Add-Result 'gpu.nvidia' 'SKIP' 'nvidia-smi missing'};if(Has-Cmd 'wsl.exe'){$r=Run 'wsl.exe' @('bash','-lc','conda run -n atlas-rapids-cu13 python -c "import cuvs,cupy; print(cuvs.__version__); print(cupy.cuda.runtime.getDeviceCount())"') 120 -AllowFailure;Add-Result 'gpu.cuvs' $(if($r.ExitCode -eq 0){'PASS'}else{'NOT_PROVEN'}) ($r.StdOut+$r.StdErr)}}
function Smoke-Contracts{Ensure-Dir(Join-Path $RepoRoot 'docs\.okf\staging');$sr=Join-Path $RepoRoot 'sveltekit-frontend\src\lib\server\retrieval\search-runtime.ts';Add-Result 'retrieval.search_runtime' $(if(Test-Path $sr){'PASS'}else{'FAIL'}) $sr;Add-Result 'ranking.rrf' 'NOT_PROVEN' 'Use focused SearchRuntime tests; bootstrap does not invoke fusion';Add-Result 'graph.pagerank' 'NOT_PROVEN' 'Requires persisted-property/distribution proof';Add-Result 'clustering.knn' 'NOT_PROVEN' 'Requires immutable Postgres↔Qdrant manifest before GPU benchmark';Add-Result 'firecrawl.runtime' 'NOT_PROVEN' 'SDK installed; no server/API key called';Add-Result 'ldr.runtime' 'NOT_PROVEN' 'Import ready; MCP client-attached research remains separate'}
function Write-Reports{Ensure-Dir $ReportRoot;$o=[ordered]@{generated_at=(Get-Date).ToUniversalTime().ToString('o');mode=$Mode;safety=@{destructive_commands_used=$false;docker_volumes_modified=$false;postgres_mutations=$false;qdrant_mutations=$false;valkey_mutations=$false;graphify_run=$false};paths=@{tool_root=$ToolRoot;okf_staging=(Join-Path $RepoRoot 'docs\.okf\staging')};results=@($Results)};$o|ConvertTo-Json -Depth 15|Set-Content $JsonReport -Encoding utf8NoBOM;$lines=@('# Agentic Research Readiness','',"Generated: $($o.generated_at)",'','## Safety','','- No deletes, volume operations, schema changes, Qdrant writes, Valkey writes, or Graphify.','','## Results','','| Check | Status | Detail |','|---|---|---|');foreach($x in $Results){$d=$x.detail-replace'\|','\|'-replace'\r?\n',' ';$lines+="| $($x.check) | $($x.status) | $d |"};$lines|Set-Content $MdReport -Encoding utf8NoBOM;Write-Host "Reports: $JsonReport ; $MdReport"}

try{Write-Host 'SAFE: no deletes, no Docker volume operations, no DB/Qdrant/Valkey mutations, no Graphify';if(-not(Test-Path $RepoRoot)){throw "Missing RepoRoot: $RepoRoot"};if($Mode-in@('Install','All')){Install-Tools};if($Mode-in@('Smoke','All')){Smoke-Python;Smoke-AstGrep;Smoke-Llama;Smoke-Embedding;Smoke-Qdrant;Smoke-Valkey;Smoke-Postgres;Smoke-Gpu;Smoke-Contracts};Write-Reports;if(@($Results|? status -eq 'FAIL').Count){exit 2};Write-Host 'AGENTIC_RESEARCH_BOOTSTRAP_COMPLETE';exit 0}catch{Add-Result 'bootstrap.unhandled' 'FAIL' $_.Exception.Message;try{Write-Reports}catch{};throw}
