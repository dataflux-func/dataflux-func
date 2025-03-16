#!/bin/bash
set -e

source run-base.sh

# Check Setup
print_log "[STARTER] Check CONFIG._IS_INSTALLED"
python _check_setup.py
if [ $? -ne 0 ]; then
    print_err 'Setup failed.'
    exit 1
fi

# Run Beat
print_log "[STARTER] Run Beat"

set +e
exit_code=8
while [ $exit_code -eq 8 ]; do
    python worker/beat.py
    exit_code=$?

    print_err "Exit Code: ${exit_code}"

    sleep 3
done
