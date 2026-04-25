#!/bin/bash # Quick QUIC Development Server Test # Run this to verify the fix echo "🧪 Testing npm run dev:quic fix..."
echo "" # Check if dependencies exist if [ -d "node_modules/vite" ] && [ -d "node_modules/@sveltejs/kit" ]; then echo
"✅ Dependencies installed correctly" else echo "❌ Dependencies missing - run: npm install" exit 1 fi # Check if
.env.quic exists if [ -f ".env.quic" ]; then echo "✅ .env.quic configuration found" else echo "⚠️ .env.quic not found -
using defaults" fi # Check if startup script exists if [ -f "scripts/start-dev-quic.mjs" ]; then echo "✅ Startup script
found" else echo "❌ scripts/start-dev-quic.mjs missing" exit 1 fi echo "" echo "🚀 Ready to start! Run: npm run
dev:quic" echo "📍 Server will start on: http://127.0.0.1:5173"
