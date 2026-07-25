#!/bin/bash

# Set environment variables for the execution context
# NOTE: These variables should ideally be sourced from an external .env file 
# or set in the CI/CD system running the job, but for local testing, 
# we define them here for the subprocess call.
export DB_HOST="127.0.0.1"
export DB_PORT="5432"
export DB_USER="legal_admin"
export DB_PASSWORD="<your_db_password>" # IMPORTANT: Replace with actual password
export DB_NAME="legal_ai_db"

# Execute the Node script with the correct environment variables and optional flags
# The export command sets the variables for the current shell, and then 
# the 'node' command inherits this environment block.
node scripts/phase-1-promotion-batch.mjs "$@";

# Function to handle passing arguments:
# $1 = --limit
# $2 = 25 (the value)
# $3 = --dry-run
# $4 = [true/false]
# $5 = --verbose
# $6 = [true/false]

# The actual execution logic should parse and pass $1, $2, etc., to the node call.
# For simplicity in this initial fix, we assume the user will run:
# bash run-phase-1-promotion.sh --limit 50 --dry-run --verbose

# End of script.
