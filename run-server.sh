#!/bin/bash
set -e

source run-base.sh

# Create Localhost auth token
/bin/bash gen-localhost-auth-token.sh

# Init Script
/bin/bash pre-run-scripts.sh 'server'

# Run Setup
print_log "[STARTER] Run Setup"

node server/setup.js $*
if [ $? -ne 0 ]; then
    print_err 'Setup failed.'
    exit 1
fi

# Run Server
print_log "[STARTER] Run Server"

set +e
exit_code=8
while [ $exit_code -eq 8 ]; do
    node server/app.js
    exit_code=$?

    print_err "Exit Code: ${exit_code}"

    sleep 3
done
