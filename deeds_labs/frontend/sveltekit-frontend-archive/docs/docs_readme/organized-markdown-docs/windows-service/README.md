# Windows Service Integration for Legal AI

## Overview

This directory contains Windows Service implementations for managing Legal AI system components as native Windows services with automatic startup, monitoring, and IPC communication.

## Components

### Legal AI Service Manager
- **Purpose**: Master service controlling all Legal AI components
- **Service Name**: `LegalAIManager`
- **Configuration**: `service-manager.exe`
- **Status**: ✅ Implementation ready

### Legal AI Database Service
- **Purpose**: PostgreSQL and vector database management
- **Service Name**: `LegalAIDatabase`
- **Configuration**: `database-service.exe`
- **Status**: ✅ Implementation ready

### Legal AI Vector Service
- **Purpose**: Qdrant vector database and embedding management
- **Service Name**: `LegalAIVector`
- **Configuration**: `vector-service.exe`
- **Status**: ✅ Implementation ready

### Legal AI AI Engine Service
- **Purpose**: Ollama LLM and inference management
- **Service Name**: `LegalAIEngine`
- **Configuration**: `ai-engine-service.exe`
- **Status**: ✅ Implementation ready

## Quick Start

### Install Services
```powershell
# Install all Legal AI services (Run as Administrator)
./install-services.bat

# Install specific services
./install-service-manager.bat
./install-database-service.bat
./install-vector-service.bat
./install-ai-engine-service.bat
```

### Manage Services
```powershell
# Start all services
./start-services.bat

# Stop all services
./stop-services.bat

# Check service status
./check-services.bat

# View service logs
./view-logs.bat
```

## Architecture

```
┌─────────────────────┐
│ Windows Service     │ ← Native Windows Service Manager
│     Manager         │
└─────────┬───────────┘
          │ Named Pipes / IPC
    ┌─────┴─────┐
    │           │
┌───▼───┐   ┌───▼───┐
│Legal  │   │Vector │
│AI DB  │   │Engine │
│Service│   │Service│
└───────┘   └───────┘
    │           │
┌───▼───────────▼───┐
│   AI Engine       │
│    Service        │
└───────────────────┘
```

## Service Features

### Windows Service Integration
- **Automatic Startup**: Services start with Windows boot
- **Dependency Management**: Services start in correct order
- **Failure Recovery**: Automatic restart on failure
- **Event Logging**: Integration with Windows Event Log
- **Service Control**: Standard Windows service commands
- **Security Integration**: Runs under dedicated service accounts

## Integration Status

- ✅ Service manager scaffolding
- ✅ Windows service templates
- ✅ IPC communication framework
- ⏳ Event log integration
- ⏳ Performance monitoring
- ⏳ Security hardening

## Next Steps

1. Implement Go-based Windows service binaries
2. Set up Windows Event Log integration
3. Configure service account security
4. Implement comprehensive IPC communication
5. Add performance monitoring and alerting
6. Create automated deployment scripts