#!/bin/bash
set -e

source run-base.sh

# Init Script
/bin/bash pre-run-scripts.sh 'worker'

# Check Setup
print_log "[STARTER] Check CONFIG._IS_INSTALLED"
python _check_setup.py
if [ $? -ne 0 ]; then
    print_err 'Setup failed.'
    exit 1
fi

# Run Worker
print_log "[STARTER] Run Worker"

set +e
exit_code=8
while [ $exit_code -eq 8 ]; do
    if [ $# -eq 0 ]; then
        python worker/app.py
        exit_code=$?
    else
        python worker/app.py $*
        exit_code=$?
    fi

    print_err "Exit Code: ${exit_code}"

    sleep 3
done
