#!/bin/bash

# Caddy Configuration Switcher for Legal AI Platform
# Usage: ./switch-caddy-config.sh [dev|prod]

CONFIG_TYPE=${1:-dev}

case $CONFIG_TYPE in
  "dev"|"development")
    echo "🔄 Switching to DEVELOPMENT Caddy configuration..."
    cp Caddyfile.development Caddyfile
    echo "✅ Development config activated"
    echo "🌐 Frontend: http://localhost:5178 (QUIC enabled)"
    echo "📁 MinIO: http://localhost:9001"
    echo "❤️ Health: http://localhost:8082/health"
    echo "ℹ️ Dev Info: http://localhost:8082/dev-info"
    ;;

  "prod"|"production")
    echo "🔄 Switching to PRODUCTION Caddy configuration..."
    cp Caddyfile.production Caddyfile
    echo "✅ Production config activated"
    echo "🌐 Domain: legal-ai.yourdomain.com (update as needed)"
    echo "🔒 Security headers enabled"
    echo "⚡ Rate limiting active"
    echo "📊 Logging to /var/log/caddy/legal-ai-access.log"
    echo ""
    echo "⚠️ Remember to:"
    echo "   - Update domain names in Caddyfile"
    echo "   - Configure SSL certificates"
    echo "   - Set up proper DNS records"
    ;;

  *)
    echo "❌ Invalid option. Usage:"
    echo "   ./switch-caddy-config.sh dev     # Development config"
    echo "   ./switch-caddy-config.sh prod    # Production config"
    exit 1
    ;;
esac

echo ""
echo "🚀 Restart Caddy to apply changes:"
echo "   caddy reload"
echo "   # or"
echo "   caddy run --config Caddyfile"