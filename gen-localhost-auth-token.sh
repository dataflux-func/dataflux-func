#!/bin/bash
set -e

localhost_auth_token_header=`python _config.py _WEB_LOCALHOST_AUTH_TOKEN_HEADER`
localhost_auth_token_path=`python _config.py _WEB_LOCALHOST_AUTH_TOKEN_PATH`

if [ ! -f ${localhost_auth_token_path} ]; then
    echo ${RANDOM} | md5sum | cut -c 1-32 > ${localhost_auth_token_path};
    sleep 1
else
    echo "Localhost auth token already generated"
fi
