# 🖥️ Tauri Desktop App Setup

This guide will help you set up the Tauri desktop application for offline prosecutor case management.

## 🎯 Overview

The Tauri app will provide:
- **Offline access** to case data
- **Desktop file management** for evidence
- **System integration** (notifications, file system access)
- **Secure local storage** for sensitive data
- **Cross-platform compatibility** (Windows, macOS, Linux)

## 🚀 Quick Setup

### 1. Install Tauri CLI
```powershell
cargo install tauri-cli
```

### 2. Initialize Tauri Project
```powershell
# From the main project directory
cargo tauri init
```

### 3. Configure Tauri
When prompted:
- **App name**: `Prosecutor Case Manager`
- **Window title**: `Prosecutor Case Management System`
- **Web assets path**: `../build` (points to SvelteKit build)
- **Dev server URL**: `http://localhost:5173`
- **Frontend framework**: `Svelte`

## 🏗️ Architecture

```
Desktop App Architecture:
┌─────────────────────────┐
│    Tauri Desktop App    │
├─────────────────────────┤
│  SvelteKit Frontend     │ ← Your existing web UI
├─────────────────────────┤
│  Rust Backend (Local)   │ ← New local API server
├─────────────────────────┤
│  Postgres Database        │ ← Offline data storage
└─────────────────────────┘
```

## 📁 Project Structure

After initialization, you'll have:
```
my-prosecutor-app/
├── src-tauri/           # Tauri Rust backend
│   ├── src/
│   │   ├── main.rs      # Tauri app entry point
│   │   └── lib.rs       # Custom commands
│   ├── tauri.conf.json  # Tauri configuration
│   └── Cargo.toml       # Tauri dependencies
├── backend/             # Your API server (existing)
├── src/                 # SvelteKit frontend (existing)
└── static/              # Static assets
```

## 🔧 Configuration Steps

### 1. Update `src-tauri/tauri.conf.json`
```json
{
  "package": {
    "productName": "Prosecutor Case Manager",
    "version": "0.1.0"
  },
  "build": {
    "distDir": "../build",
    "devPath": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "fs": {
        "all": true,
        "readFile": true,
        "writeFile": true,
        "readDir": true,
        "copyFile": true,
        "createDir": true,
        "removeDir": true,
        "removeFile": true,
        "renameFile": true
      },
      "dialog": {
        "all": true,
        "open": true,
        "save": true
      },
      "notification": {
        "all": true
      },
      "path": {
        "all": true
      },
      "shell": {
        "all": false,
        "open": true
      }
    },
    "windows": [
      {
        "fullscreen": false,
        "height": 800,
        "resizable": true,
        "title": "Prosecutor Case Management System",
        "width": 1200,
        "minWidth": 800,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  }
}
```

### 2. Add Tauri Commands to `src-tauri/src/main.rs`
```rust
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::Manager;

// Custom commands for the desktop app
#[tauri::command]
async fn get_cases_offline() -> Result<String, String> {
    // Connect to local SQLite database
    // Return cached case data
    Ok("[]".to_string())
}

#[tauri::command]
async fn sync_with_server() -> Result<String, String> {
    // Sync local SQLite with remote PostgreSQL
    Ok("Sync complete".to_string())
}

#[tauri::command]
async fn save_evidence_file(file_path: String, case_id: i32) -> Result<String, String> {
    // Save evidence file to local storage
    // Associate with case
    Ok("File saved".to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_cases_offline,
            sync_with_server,
            save_evidence_file
        ])
        .setup(|app| {
            // Initialize local database
            // Start local API server
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 3. Update `src-tauri/Cargo.toml`
```toml
[package]
name = "prosecutor-case-manager"
version = "0.1.0"
description = "A Tauri App for Prosecutor Case Management"
authors = ["you"]
license = ""
repository = ""
edition = "2021"

[build-dependencies]
tauri-build = { version = "1.5", features = [] }

[dependencies]
tauri = { version = "1.5", features = ["api-all"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["full"] }

[features]
default = ["custom-protocol"]
custom-protocol = ["tauri/custom-protocol"
```

## 🔄 Offline Sync Strategy

### Local Database (postgres)
- **Primary storage** for offline use
- **Fast queries** for desktop responsiveness
- **Periodic sync** with PostgreSQL server

### Sync Process
1. **Download**: Pull latest data from PostgreSQL server
2. **Merge**: Combine remote changes with local changes
3. **Upload**: Push local changes to server
4. **Resolve**: Handle conflicts with user input

### Conflict Resolution
- **Timestamp-based**: Most recent change wins
- **User prompt**: Let user choose which version to keep
- **Field-level**: Merge non-conflicting field changes

## 📱 Desktop Features

### File Management
```rust
// Example: Save evidence file
#[tauri::command]
async fn import_evidence(file_path: String) -> Result<EvidenceFile, String> {
    // Copy file to secure app directory
    // Extract metadata (size, type, hash)
    // Add to local database
    // Return evidence record
}
```

### Notifications
```rust
// Example: Case deadline reminder
#[tauri::command]
async fn schedule_reminder(case_id: i32, deadline: String) -> Result<(), String> {
    // Schedule system notification
    // Add to local reminder database
}
```

### Security
- **Encrypted local storage** for sensitive data
- **Secure file handling** for evidence
- **User authentication** with local session storage

## 🛠️ Development Commands

```powershell
# Start development server (auto-reload)
cargo tauri dev

# Build for production
cargo tauri build

# Build for specific platform
cargo tauri build --target x86_64-pc-windows-msvc

# Generate app icons
cargo tauri icon path/to/icon.png
```

## 🚀 Running the Desktop App

### Development Mode
```powershell
# Terminal 1: Start SvelteKit dev server
npm run dev

# Terminal 2: Start Tauri app
cd src-tauri
cargo tauri dev
```

### Production Build
```powershell
# Build SvelteKit for production
npm run build

# Build Tauri app
cargo tauri build
```

## 🔐 Security Considerations

### Data Protection
- **Encrypt postgres database** with user password
- **Secure file storage** in app-specific directory
- **Memory protection** for sensitive data in Rust

### Authentication
- **Local session storage** with encryption
- **Biometric authentication** (Windows Hello, TouchID)
- **Auto-lock** after inactivity

## 📦 Deployment

### Windows
- **MSI installer** for enterprise deployment
- **Code signing** for trust verification
- **Auto-update** capability

### macOS
- **DMG package** for easy installation
- **App Store** distribution (optional)
- **Notarization** for security

### Linux
- **AppImage** for universal compatibility
- **DEB/RPM packages** for specific distributions

## 🎯 Next Steps

1. **Initialize Tauri**: `cargo tauri init`
2. **Configure permissions** in `tauri.conf.json`
3. **Implement offline commands** in Rust
4. **Add desktop-specific UI** components
5. **Test sync functionality**
6. **Package for distribution**

---

**Ready to build your offline prosecutor desktop app!** 🖥️⚖️
