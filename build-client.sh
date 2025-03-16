#!/bin/bash
set -e

# run generation tools
python tools/gen-zht.py
python tools/gen-opensource-md.py
python tools/gen-codelines-md.py

# build client
cd client
npm run build
