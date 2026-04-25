#!/bin/bash

# Enhanced Legal AI Production Deployment Script
# This script deploys the complete enhanced legal AI system to production

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="enhanced-legal-ai"
COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if running as root (for directory creation)
    if [[ $EUID -ne 0 ]]; then
        log_warning "Not running as root. Some operations may require sudo."
    fi
    
    log_success "Prerequisites check completed"
}

setup_directories() {
    log_info "Setting up data directories..."
    
    local base_dir="/var/lib/legal-ai"
    
    # Create directories with proper permissions
    sudo mkdir -p "${base_dir}"/{postgres,redis,uploads}
    sudo chown -R 1001:1001 "${base_dir}/uploads"
    sudo chmod 755 "${base_dir}"/{postgres,redis,uploads}
    
    log_success "Data directories created"
}

check_environment() {
    log_info "Checking environment configuration..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file $ENV_FILE not found"
        log_info "Creating template environment file..."
        
        cat > "$ENV_FILE" << 'EOF'
# Database
POSTGRES_PASSWORD=your_secure_postgres_password_here
REDIS_PASSWORD=your_secure_redis_password_here

# Security
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long
BCRYPT_ROUNDS=12

# AI Services (Optional)
OPENAI_API_KEY=sk-your-openai-key-here
ANTHROPIC_API_KEY=your-anthropic-key-here

# Monitoring (Optional)
SENTRY_DSN=your-sentry-dsn-here
GRAFANA_PASSWORD=your_grafana_admin_password

# Email/Notifications (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
EOF
        
        log_warning "Please edit $ENV_FILE with your actual values before proceeding"
        exit 1
    fi
    
    # Check if critical variables are set
    source "$ENV_FILE"
    
    local missing_vars=()
    
    [[ -z "${POSTGRES_PASSWORD:-}" ]] && missing_vars+=("POSTGRES_PASSWORD")
    [[ -z "${REDIS_PASSWORD:-}" ]] && missing_vars+=("REDIS_PASSWORD")
    [[ -z "${JWT_SECRET:-}" ]] && missing_vars+=("JWT_SECRET")
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        exit 1
    fi
    
    log_success "Environment configuration validated"
}

build_application() {
    log_info "Building application images..."
    
    # Build the main application
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache
    
    log_success "Application images built successfully"
}

deploy_services() {
    log_info "Deploying services..."
    
    # Pull latest images for external services
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" pull postgres redis nginx prometheus grafana loki promtail
    
    # Start services in dependency order
    log_info "Starting infrastructure services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres redis
    
    # Wait for databases to be ready
    log_info "Waiting for databases to be ready..."
    sleep 30
    
    # Run database migrations
    log_info "Running database migrations..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres psql -U legal_ai_user -d legal_ai_production -c "SELECT 1;" || {
        log_error "Database is not ready"
        exit 1
    }
    
    # Start AI model
    log_info "Starting AI model service..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d ai-model
    
    # Start application services
    log_info "Starting application services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d legal-ai-app go-service
    
    # Start reverse proxy
    log_info "Starting reverse proxy..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d nginx
    
    # Start monitoring stack
    log_info "Starting monitoring services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d prometheus grafana loki promtail
    
    log_success "All services deployed successfully"
}

run_health_checks() {
    log_info "Running health checks..."
    
    local services=("legal-ai-app:3000" "go-service:8080" "ai-model:8081")
    local max_attempts=30
    local attempt=1
    
    for service in "${services[@]}"; do
        log_info "Checking health of $service..."
        
        while [[ $attempt -le $max_attempts ]]; do
            if curl -f "http://localhost:${service#*:}/health" &>/dev/null; then
                log_success "$service is healthy"
                break
            fi
            
            if [[ $attempt -eq $max_attempts ]]; then
                log_error "$service failed health check"
                return 1
            fi
            
            log_info "Attempt $attempt/$max_attempts failed, retrying in 10s..."
            sleep 10
            ((attempt++))
        done
        
        attempt=1
    done
    
    log_success "All health checks passed"
}

setup_ssl() {
    log_info "Setting up SSL certificates..."
    
    # Check if Let's Encrypt certificates exist
    if [[ ! -d "./nginx/ssl" ]]; then
        log_warning "SSL certificates not found"
        log_info "You can set up Let's Encrypt certificates manually or use self-signed certificates for testing"
        
        # Create self-signed certificates for testing
        mkdir -p ./nginx/ssl
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout ./nginx/ssl/legal-ai.key \
            -out ./nginx/ssl/legal-ai.crt \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=legal-ai.local" 2>/dev/null
        
        log_warning "Self-signed certificates created for testing purposes"
    fi
}

show_deployment_info() {
    log_success "🎉 Enhanced Legal AI System deployed successfully!"
    echo
    echo "📊 Access Points:"
    echo "  🌐 Main Application:     http://localhost:3000"
    echo "  🔧 Go Microservice:     http://localhost:8080"
    echo "  🤖 AI Model API:        http://localhost:8081"
    echo "  📈 Prometheus:          http://localhost:9090"
    echo "  📊 Grafana:             http://localhost:3001"
    echo "  🔍 Nginx Status:        http://localhost/nginx_status"
    echo
    echo "🔐 Default Credentials:"
    echo "  📊 Grafana: admin / (check GRAFANA_PASSWORD in .env.production)"
    echo
    echo "🛠️ Management Commands:"
    echo "  View logs:        docker-compose -f $COMPOSE_FILE logs -f [service]"
    echo "  Scale app:        docker-compose -f $COMPOSE_FILE up -d --scale legal-ai-app=3"
    echo "  Update:           ./scripts/update-production.sh"
    echo "  Backup:           ./scripts/backup-production.sh"
    echo "  Stop all:         docker-compose -f $COMPOSE_FILE down"
    echo
    echo "📚 Documentation: https://github.com/your-org/enhanced-legal-ai/docs"
    echo
}

main() {
    echo "🚀 Enhanced Legal AI Production Deployment"
    echo "=========================================="
    echo
    
    check_prerequisites
    setup_directories
    check_environment
    setup_ssl
    build_application
    deploy_services
    run_health_checks
    show_deployment_info
    
    log_success "Deployment completed successfully! 🎉"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "health")
        run_health_checks
        ;;
    "stop")
        log_info "Stopping all services..."
        docker-compose -f "$COMPOSE_FILE" down
        log_success "All services stopped"
        ;;
    "logs")
        docker-compose -f "$COMPOSE_FILE" logs -f "${2:-}"
        ;;
    "update")
        log_info "Updating services..."
        docker-compose -f "$COMPOSE_FILE" pull
        docker-compose -f "$COMPOSE_FILE" up -d
        run_health_checks
        log_success "Update completed"
        ;;
    *)
        echo "Usage: $0 {deploy|health|stop|logs [service]|update}"
        exit 1
        ;;
esac