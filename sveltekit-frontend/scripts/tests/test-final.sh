#!/bin/bash

routes=(
  "/"
  "/admin"
  "/ai/dashboard"
  "/demo/nes-gpu-quantization"
  "/chat"
  "/cases/new"
  "/demo/ai-dashboard"
  "/demo/component-gallery"
  "/auth/login"
)

echo "=== FINAL BUTTON.SVELTE FIX VERIFICATION ==="
echo "Testing all routes on localhost:5185..."
for route in "${routes[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5185$route")
  if [ "$status" = "200" ] || [ "$status" = "302" ]; then
    echo "✅ $status - $route"
  else
    echo "❌ $status - $route"
  fi
done
echo "=== VERIFICATION COMPLETE ==="
