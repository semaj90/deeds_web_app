param(
 [string]$Neo4jHttp="http://127.0.0.1:7474",
 [string]$Neo4jUser="neo4j",
 [string]$Neo4jPassword="neo4j123",
 [string]$RedisHost="127.0.0.1",[int]$RedisPort=6379,
 [string]$RabbitHost="127.0.0.1",[int]$RabbitPort=5672
)
$ErrorActionPreference="Stop"
function Test-Tcp($h,$p){
 try{$c=New-Object Net.Sockets.TcpClient;$a=$c.BeginConnect($h,$p,$null,$null)
 if(-not $a.AsyncWaitHandle.WaitOne(1500)){$c.Close();return $false}
 $c.EndConnect($a);$c.Close();return $true}catch{return $false}}
Write-Host "Redis/Valkey: $(Test-Tcp $RedisHost $RedisPort)"
Write-Host "RabbitMQ: $(Test-Tcp $RabbitHost $RabbitPort)"
$auth=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$Neo4jUser`:$Neo4jPassword"))
$headers=@{Authorization="Basic $auth";"Content-Type"="application/json"}
foreach($q in @(
 "RETURN apoc.version() AS version",
 "CALL gds.version() YIELD version RETURN version",
 "SHOW INDEXES YIELD name,state,populationPercent WHERE name='codebase_file_path' RETURN name,state,populationPercent"
)){
 $b=@{statements=@(@{statement=$q})}|ConvertTo-Json -Depth 8
 $x=Invoke-RestMethod -Method Post -Uri "$Neo4jHttp/db/neo4j/tx/commit" -Headers $headers -Body $b
 if($x.errors.Count){Write-Warning ($x.errors|ConvertTo-Json -Depth 8)}
 else{$x.results.data.row|%{Write-Host ($_|ConvertTo-Json -Compress)}}
}
