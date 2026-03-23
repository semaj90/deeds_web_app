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

echo "Testing routes on localhost:5185..."
for route in "${routes[@]}"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:5185$route")
  echo "$status - $route"
done
