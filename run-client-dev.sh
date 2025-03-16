#!/bin/bash
set -e

# generate zht
python tools/gen-zht.py

# run client DEV
cd client
VUE_APP_BACKEND_SERVER=${DATAFLUX_FUNC_DEV_SERVER} npm run serve
