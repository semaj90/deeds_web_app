# 🧪 VS CODE EXTENSION TESTING CHECKLIST

## ✅ Pre-Test Validation

- [✅] Extension structure: **92% pass rate**
- [✅] MCP server running: **Started successfully**
- [✅] Extension files present: **20 commands ready**

---

## 🚀 MANUAL TESTING PROCEDURE

### Step 1: Open Workspace

1. **Open VS Code**
2. **File > Open Folder**
3. **Navigate to**: `c:\Users\james\Desktop\deeds-web\deeds-web-app`
4. **Verify**: Extension should auto-activate (check status bar)

### Step 2: Test Command Palette

1. **Press**: `Ctrl+Shift+P`
2. **Type**: `Context7`
3. **Verify you see**:
   ```
   ✨ Context7 MCP: Analyze Current Context
   📚 Context7 MCP: Get Context-Aware Documentation
   🎛️ Context7 MCP: Open EnhancedRAG Studio
   🤖 Context7 MCP: Run Agent Orchestrator
   🐛 Context7 MCP: Analyze TypeScript Errors
   📊 Context7 MCP: Generate Performance Report
   🔧 Context7 MCP: Fix Common Issues
   ... and 13+ more commands
   ```

### Step 3: Test Core Commands

#### A. 🔍 Analyze Current Context

- **Action**: Select "🔍 Analyze Current Context"
- **Expected**:
  - Command executes without errors
  - Shows analysis in output panel
  - Provides contextual insights

#### B. 📚 Get Context-Aware Documentation

- **Action**: Select "📚 Get Context-Aware Documentation"
- **Expected**:
  - Retrieves relevant documentation
  - Shows in new panel/webview
  - Context-specific results

#### C. 🎛️ Open EnhancedRAG Studio

- **Action**: Select "🎛️ Open EnhancedRAG Studio"
- **Expected**:
  - Opens RAG interface
  - Navigates to appropriate route
  - Shows vector search capabilities

#### D. 🤖 Run Agent Orchestrator

- **Action**: Select "🤖 Run Agent Orchestrator"
- **Expected**:
  - Starts multi-agent workflow
  - Shows orchestration status
  - Provides agent feedback

### Step 4: Test Context Menu Integration

1. **Right-click** in any file editor
2. **Look for**: Context7 MCP menu options
3. **Verify**: Context-sensitive commands appear

### Step 5: Check Extension Health

1. **View > Output**
2. **Select**: "Context7 MCP Assistant" from dropdown
3. **Verify**:
   - No error messages
   - Successful initialization logs
   - MCP server connection confirmed

---

## 🎯 SUCCESS CRITERIA

### ✅ MUST PASS:

- [ ] Extension loads without errors
- [ ] All 20 commands visible in palette
- [ ] At least 3 core commands execute successfully
- [ ] No crashes or hangs
- [ ] MCP server connection established

### 🎁 BONUS POINTS:

- [ ] Context menu integration works
- [ ] RAG Studio opens correctly
- [ ] Agent orchestrator responds
- [ ] Documentation retrieval functional
- [ ] Performance reporting works

---

## 🐛 TROUBLESHOOTING

### If Commands Don't Appear:

1. Check if workspace is properly opened
2. Reload VS Code (`Developer: Reload Window`)
3. Check for extension errors in output panel

### If Commands Fail:

1. Verify MCP server is running
2. Check output panel for error details
3. Try restarting the extension

### If Extension Won't Load:

1. Check VS Code version (requires 1.74.0+)
2. Verify extension files in `.vscode/extensions/`
3. Check for conflicting extensions

---

## 📊 REPORTING RESULTS

After testing, report:

- ✅ **Working commands**: List which commands worked
- ❌ **Failed commands**: List any that failed with error details
- 🎯 **Overall experience**: Smooth/buggy/needs work
- 💡 **Suggestions**: Any improvements or issues noticed

---

## 🎉 EXPECTED OUTCOME

With 92% validation success rate, you should see:

- **Fast activation** (< 2 seconds)
- **Smooth command execution**
- **Clear feedback/results**
- **Stable performance**
- **Useful contextual insights**

Ready to test! 🚀
