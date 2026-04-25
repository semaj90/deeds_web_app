# 🚨 USER MODEL REQUIREMENTS - IMPORTANT

## ⚠️ NO MODELS PROVIDED AUTOMATICALLY

**This application does NOT include, download, bundle, or provide any LLM models automatically.**

All local LLM functionality requires users to provide their own models.

## 🎯 What This Means

### ✅ What the Application DOES:
- Provides infrastructure to load and use GGUF models
- Offers upload and management interfaces for user models
- Supports local inference with user-provided models
- Falls back to rule-based NLP when no models are available
- Uses external APIs (Gemini/OpenAI) for web/production deployment

### ❌ What the Application DOES NOT DO:
- **Never downloads models automatically**
- **Never bundles models with the application**
- **Never provides default or sample models**
- **Never auto-installs models from any source**
- **Never suggests specific model downloads**

## 📋 Requirements for Local LLM Features

### For Desktop App (Tauri):
1. **User must obtain their own GGUF models**
2. **Upload via the built-in interface OR set environment variable**
3. **Models must be in GGUF format (quantized for llama.cpp)**
4. **User is responsible for model licensing compliance**

### Recommended Model Sources:
- **[Hugging Face Hub](https://huggingface.co/models?library=gguf)** - Search for GGUF format
- **Community quantized models** - Various repositories

### Model Requirements:
- **Format**: GGUF (GGML Universal Format)
- **Size**: 1-8GB recommended for optimal performance
- **Quantization**: Q4_0, Q4_1, Q5_0, Q5_1, Q8_0 supported
- **Architecture**: gemma-qat or compatible models

## 🔧 How to Add Your Models

### Method 1: Environment Variable
```bash
# Set in your .env file
LLM_MODEL_PATH="/path/to/your/model.gguf"
```

### Method 2: Upload Interface (Tauri Desktop)
1. Open the desktop application
2. Navigate to Model Management
3. Click "Upload Model"
4. Select your GGUF file
5. Set as active model

### Method 3: Copy to Models Directory
```bash
# Copy your model to the models directory
cp your-model.gguf /app/models/
```

## 🛡️ Security & Compliance

### User Responsibilities:
- **License Compliance**: Ensure you have rights to use the model
- **Data Privacy**: Understand what data the model was trained on
- **Terms of Service**: Comply with original model provider terms
- **Legal Usage**: Use models only for permitted purposes

### Application Safeguards:
- **Path Validation**: Only local file paths are accepted
- **Format Validation**: Only GGUF files are loaded
- **Security Checks**: No remote URLs or auto-downloads
- **Error Handling**: Clear messaging when models are missing

## 🔄 Fallback Behavior

### Without User Models:
- **Web App**: Uses Gemini/OpenAI APIs (requires API keys)
- **Desktop App**: Falls back to rule-based NLP only
- **Basic functionality**: All CRUD operations remain available
- **Limited NLP**: Simple entity extraction and templates only

### With User Models:
- **Full Local LLM**: Text generation, summarization, analysis
- **Offline Capability**: Works without internet connection
- **Advanced NLP**: Entity extraction, relationship analysis
- **Custom Inference**: Tailored to your specific model

## 📚 Getting Started

1. **Choose a Model**: Research and select an appropriate GGUF model
2. **Download Legally**: Ensure you comply with the model's license
3. **Upload/Configure**: Use one of the methods above
4. **Test Functionality**: Verify the model works with the app
5. **Enjoy Local LLM**: Full offline NLP capabilities

## ❓ Frequently Asked Questions

**Q: Why don't you include models?**
A: Legal, licensing, and size constraints. Models can be 1-8GB+ and have various licenses.

**Q: Where can I get good models?**
A: Hugging Face Hub, official model providers, or community repositories. Always check licenses.

**Q: What if I don't want to use local models?**
A: The web app works with external APIs (Gemini/OpenAI) for production use.

**Q: Will you add model downloading in the future?**
A: No. User-provided models remain the only supported approach for local inference.

**Q: Can I use multiple models?**
A: Yes, you can upload multiple models and switch between them as needed.

## 🆘 Support

If you're having trouble with model setup:
1. Check the model format is GGUF
2. Verify file permissions and paths
3. Check application logs for specific errors
4. Ensure the model is compatible with llama.cpp
5. Confirm your system has sufficient RAM

Remember: The application provides the infrastructure, but you provide the models!
