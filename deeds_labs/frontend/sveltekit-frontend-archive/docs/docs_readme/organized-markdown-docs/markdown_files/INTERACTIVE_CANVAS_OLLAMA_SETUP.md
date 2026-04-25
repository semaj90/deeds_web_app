# 🏛️ Interactive Canvas + Ollama Integration Guide

This guide shows you how to set up the interactive canvas system to work optimally with your local Gemma3 model via Ollama.

## 🎯 Quick Setup

### Step 1: Create the Custom Legal AI Model

Run this PowerShell script to create an optimized Gemma3 model for legal work:

```powershell
# Navigate to the project root
cd "c:\Users\james\Downloads\Deeds-App-doesn-t-work--main (2)"

# Run the setup script
.\setup-gemma3-legal.ps1
```

This will:

- ✅ Verify Ollama is running
- ✅ Create a `gemma3-legal` model with legal-optimized settings
- ✅ Test the model with a sample legal query

### Step 2: Start the Development Environment

```powershell
# Navigate to the SvelteKit frontend
cd "web-app\sveltekit-frontend"

# Start the development server
npm run dev
```

### Step 3: Test the Integration

```powershell
# Run the integration test
node test-canvas-ollama-integration.mjs
```

## 🔧 What This Setup Provides

### **Optimized Model Configuration**

- **Custom Prompt Template**: Uses proper Gemma3 formatting with `<start_of_turn>` tokens
- **Legal System Prompt**: Specialized for prosecutor case management
- **Optimized Parameters**:
  - Temperature: 0.3 (consistent, professional responses)
  - Context Window: 4096 (handles long legal documents)
  - Stop Tokens: Prevents generation issues

### **Interactive Canvas Integration**

- **Smart AI Button**: Floating AI assistant button in the canvas
- **Context-Aware**: Sends canvas context with AI requests
- **Multiple Vibes**: Professional, investigative, analytical modes
- **Action Generation**: Creates actionable items from AI responses

### **API Flow**

```
Interactive Canvas → AIFabButton → Dialog → /api/ai/suggest → OllamaService → gemma3-legal → Response
```

## 🧪 Testing the Integration

### **Manual Testing**

1. Open: http://localhost:5173/interactive-canvas
2. Click the AI assistant button (purple floating button)
3. Test with legal queries:
   - "Help me organize evidence for a criminal case"
   - "Create a timeline for these events"
   - "Analyze witness testimony discrepancies"

### **Automated Testing**

Run the integration test script:

```powershell
node test-canvas-ollama-integration.mjs
```

## 🛠️ Troubleshooting

### **Ollama Not Responding**

```powershell
# Check if Ollama is running
ollama list

# Start Ollama if needed
ollama serve
```

### **Custom Model Not Found**

```powershell
# Recreate the custom model
ollama create gemma3-legal -f Gemma3-Legal-Modelfile

# Verify it was created
ollama list
```

### **API Errors**

Check the browser console and SvelteKit terminal for error messages.

### **Model Path Issues**

Verify your model file exists:

```powershell
Test-Path ".\gemma3Q4_K_M\mo16.gguf"
```

## 🎨 Interactive Canvas Features with AI

### **AI-Powered Assistance**

- **Evidence Analysis**: Ask AI to help organize and analyze evidence
- **Timeline Creation**: Get suggestions for chronological event organization
- **Witness Statement Review**: Identify discrepancies and patterns
- **Case Strategy**: Receive strategic recommendations
- **Document Summarization**: Get key points from uploaded documents

### **Smart Context Passing**

The AI system understands:

- Current canvas state
- Selected vibe/mode
- Case context
- Previous conversation history

### **Action Generation**

AI responses include actionable items:

- Highlight important evidence
- Add timeline annotations
- Research legal precedents
- Create case notes

## 🔄 Ollama vs llama.cpp

**For your use case, use Ollama because:**

| Feature              | Ollama ✅                 | llama.cpp                   |
| -------------------- | ------------------------- | --------------------------- |
| **Ease of Use**      | Simple commands           | Complex CLI flags           |
| **Model Management** | Built-in model registry   | Manual file management      |
| **API Server**       | Automatic REST API        | Requires server setup       |
| **Template Support** | Built-in Modelfile system | Manual prompt formatting    |
| **GPU Support**      | Automatic detection       | Manual configuration        |
| **Integration**      | Perfect for web apps      | Better for direct embedding |

## 🚀 Production Considerations

### **Performance Optimization**

- The custom model uses Q4_K_M quantization for speed
- Context window set to 4096 for legal documents
- Temperature tuned for consistent legal advice

### **Model Fallbacks**

The system falls back gracefully:

1. Custom `gemma3-legal` model (preferred)
   asynchornous enhanged rag fallback if no ollama, gpu detected? or busy? distiled cachce

### **Environment Variables**

Set in your `.env` file:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3-legal
```

## 🎉 Success Indicators

You'll know it's working when:

- ✅ Interactive canvas loads without errors
- ✅ AI button appears (purple floating button)
- ✅ AI dialog opens and responds to queries
- ✅ Legal-specific responses are generated
- ✅ Suggestions and actions are provided
- ✅ No fallback to mock responses

## 📚 Next Steps

1. **Customize the Legal Prompts**: Edit the Modelfile system prompt for your specific jurisdiction
2. **Add Case Templates**: Create templates for different case types
3. **Integrate with Vector Search**: Connect to postgresql, pgvector, Qdrant for case law lookup
4. **Add Authentication**: Implement user sessions for case management

The interactive canvas is now fully integrated with your local Gemma3 model for professional legal AI assistance! 🏛️⚖️
