#!/bin/bash
set -e

COMMAND=""

case $1 in
    cli|show-command|table-info )
        COMMAND=$1
        ;;

    * )
        echo "DataFlux Func PostgreSQL Tool"
        echo "Usage:"
        echo "  $ bash $0 cli         : Use CLI to access PostgreSQL"
        echo "  $ bash $0 show-command: Show CLI command to access PostgreSQL"
        exit
        ;;
esac

host=`python _config.py POSTGRESQL_HOST`
port=`python _config.py POSTGRESQL_PORT`
db=`python _config.py POSTGRESQL_DATABASE`
user=`python _config.py POSTGRESQL_USER`
password=`python _config.py POSTGRESQL_PASSWORD`

hostOpt=""
portOpt=""
dbOpt=""
userOpt=""
passwordEnv=""

if [ ${host} ]; then
    hostOpt="--host=${host}"
fi
if [ ${port} ]; then
    portOpt="--port=${port}"
fi
if [ ${db} ]; then
    dbOpt="--dbname=${db}"
fi
if [ ${user} ]; then
    userOpt="--username=${user}"
fi
if [ ${password} ]; then
    passwordEnv="PGPASSWORD=${password}"
fi

case ${COMMAND} in
    cli )
        export ${passwordEnv}
        psql ${hostOpt} ${portOpt} ${dbOpt} ${userOpt}
        ;;

    show-command )
        echo "${passwordEnv} psql ${hostOpt} ${portOpt} ${dbOpt} ${userOpt}"
        ;;

esac
