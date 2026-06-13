# Proto Packetization Report

- **Services**: 12 (gate >= 5)
- **RPC Methods**: 61 (gate >= 20)
- **Duplicates**: 0
- **Gate Status**: PASS

## Services
```
ChatAssistantService
Chr97Agent
CodeIntelService
EnrichmentService
EmbeddingService
GpuBridgeService
LibrarySearchService
RetrievalService
ToolCallingService
TurboVecService
TurboVecCudaService
CyberElephantService
```

## Sample Packets (first 10)
```
ChatAssistantService.SendMessage [1d5eba7211dea6f9]
ChatAssistantService.StreamMessage [9f4573e52fce4175]
ChatAssistantService.GetHistory [8d44b9719637706f]
ChatAssistantService.CreateSession [3edd306a02055c3a]
ChatAssistantService.RAGQuery [9b11b6f522def1a1]
ChatAssistantService.Health [4d4c2e69d3f629ba]
Chr97Agent.GetCartridge [891b73e8db9c3bb7]
Chr97Agent.QueryTags [3f73ebb0336ae4f3]
Chr97Agent.GetTimeline [e974379c7320ac57]
CodeIntelService.GetClusterSummary [64090fce409bb5c9]
```
