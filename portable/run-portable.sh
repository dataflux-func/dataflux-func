#!/bin/bash
set -e

ETC_PATH=/etc/dataflux-func
if [ -f ${ETC_PATH} ]; then
    source ${ETC_PATH}
fi

# This script references the official Docker docs and the following article
#   https://www.cnblogs.com/helf/p/12889955.html

function stopPrevStack {
    docker stack remove "$1"

    isRunning=1
    while [ $isRunning -ne 0 ]; do
        echo 'Waiting...'
        sleep 3

        isRunning=`docker ps | grep "$1_" | wc -l`
    done
}

function blankLine {
    echo ''
}

function log {
    echo -e "\033[33m$1\033[0m$2"
}
function log_update_line {
    echo -e "\r\033[33m$1\033[0m$2\c"
}
function error {
    echo -e "\033[31m$1\033[0m"
}

function delay_run {
    for i in {10..1}; do
        if [ $i -eq 1 ]; then
            log_update_line "You have ${i} second to interrupt this action by pressing CTRL + C   "
        else
            log_update_line "You have ${i} seconds to interrupt this action by pressing CTRL + C  "
        fi
        sleep 1
    done
    log ""
}

# Init
__PREV_DIR=${PWD}
__PORTABLE_DIR=$(cd `dirname $0`; pwd)
__SERVER_SECRET=`echo ${RANDOM} | md5sum | cut -c 1-16`
__MYSQL_PASSWORD=`echo ${RANDOM} | md5sum | cut -c 1-16`

__CONFIG_FILE=data/user-config.yaml
__DOCKER_STACK_FILE=docker-stack.yaml
__DOCKER_STACK_EXAMPLE_FILE=docker-stack.example.yaml

__PROJECT_NAME=dataflux-func

__DOCKER_VERSION=24.0.9
__DOCKER_BIN_FILE=docker-${__DOCKER_VERSION}.tgz
__SYSTEMD_FILE=docker.service

__LOGROTATE_FILE=/etc/logrotate.d/${__PROJECT_NAME}

__DATAFLUX_FUNC_IMAGE_GZIP_FILE=dataflux-func.tar.gz
__MYSQL_IMAGE_GZIP_FILE=mysql.tar.gz
__REDIS_IMAGE_GZIP_FILE=redis.tar.gz
__IMAGE_LIST_FILE=image-list
__VERSION_FILE=version

# Options
OPT_MINI=FALSE
OPT_PORT=DEFAULT
OPT_INSTALL_DIR=DEFAULT
OPT_NO_MYSQL=FALSE
OPT_NO_REDIS=FALSE
OPT_AUTO_SETUP=FALSE
OPT_AUTO_SETUP_ADMIN_USERNAME=""
OPT_AUTO_SETUP_ADMIN_PASSWORD=""
OPT_AUTO_SETUP_AK_ID=""
OPT_AUTO_SETUP_AK_SECRET=""
OPT_EXTRA_CONFIG=""

while [ $# -ge 1 ]; do
    case $1 in
        # Minimum deployment
        --mini )
            OPT_MINI=TRUE
            shift
            ;;

        # Port
        --port=* )
            OPT_PORT="${1#*=}"
            shift
            ;;
        --port )
            OPT_PORT=$2
            shift 2
            ;;

        # Install dir
        --install-dir=* )
            OPT_INSTALL_DIR="${1#*=}"
            shift
            ;;
        --install-dir )
            OPT_INSTALL_DIR=$2
            shift 2
            ;;

        # Do not start the built-in MySQL
        --no-mysql )
            OPT_NO_MYSQL=TRUE
            shift
            ;;

        # Do not start the built-in Redis
        --no-redis )
            OPT_NO_REDIS=TRUE
            shift
            ;;

        # Auto setup
        --auto-setup )
            OPT_AUTO_SETUP=TRUE
            shift
            ;;

        # admin username for auto setup
        --auto-setup-admin-username=* )
            OPT_AUTO_SETUP_ADMIN_USERNAME="${1#*=}"
            shift
            ;;
        --auto-setup-admin-username )
            OPT_AUTO_SETUP_ADMIN_USERNAME=$2
            shift 2
            ;;

        # admin password for auto setup
        --auto-setup-admin-password=* )
            OPT_AUTO_SETUP_ADMIN_PASSWORD="${1#*=}"
            shift
            ;;
        --auto-setup-admin-password )
            OPT_AUTO_SETUP_ADMIN_PASSWORD=$2
            shift 2
            ;;

        # AccessKey ID for auto setup
        --auto-setup-ak-id=* )
            OPT_AUTO_SETUP_AK_ID="${1#*=}"
            shift
            ;;
        --auto-setup-ak-id )
            OPT_AUTO_SETUP_AK_ID=$2
            shift 2
            ;;

        # AccessKey Secret for auto setup
        --auto-setup-ak-secret=* )
            OPT_AUTO_SETUP_AK_SECRET="${1#*=}"
            shift
            ;;
        --auto-setup-ak-secret )
            OPT_AUTO_SETUP_AK_SECRET=$2
            shift 2
            ;;

        # Extra configs
        --extra-config=* )
            if [ "${OPT_EXTRA_CONFIG}" ]; then
                OPT_EXTRA_CONFIG="${OPT_EXTRA_CONFIG}\n${1#*=}"
            else
                OPT_EXTRA_CONFIG="${1#*=}"
            fi
            shift
            ;;
        --extra-config )
            if [ "${OPT_EXTRA_CONFIG}" ]; then
                OPT_EXTRA_CONFIG="${OPT_EXTRA_CONFIG}\n$2"
            else
                OPT_EXTRA_CONFIG="$2"
            fi
            shift 2
            ;;

        * )
            error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Install options
# Port
_PORT=8088
if [ ${OPT_PORT} != "DEFAULT" ]; then
    _PORT=${OPT_PORT}
fi

# Install dir
_INSTALL_DIR=/usr/local/${__PROJECT_NAME}
if [ ${OPT_INSTALL_DIR} != "DEFAULT" ]; then
    # Specify install dir
    _INSTALL_DIR=${OPT_INSTALL_DIR}/${__PROJECT_NAME}
else
    # Use default install dir, prefer prev install dir
    if [ ${INSTALLED_DIR} ]; then
        log "* Found previous install directory: ${INSTALLED_DIR}"
        _INSTALL_DIR=${INSTALLED_DIR}
    fi
fi

log "Project name: ${__PROJECT_NAME}"
log "Port        : ${_PORT}"
log "Install dir : ${_INSTALL_DIR}/"
log "Version     : `cat ${__PORTABLE_DIR}/${__VERSION_FILE}`"

# Check install dir
if [ ${INSTALLED_DIR} ] && [ ${INSTALLED_DIR} != ${_INSTALL_DIR} ]; then
    log ""
    log "You are reinstalling / upgrading DataFlux Func into a different directory by mistake."
    log "  Previous (from ${ETC_PATH}):"
    log "    -> ${INSTALLED_DIR}"
    log "  Current:"
    log "    -> ${_INSTALL_DIR} "
    log "When you are reinstalling / upgrading DataFlux Func, the --install-dir option is not needed."
    exit 1
fi

# Load image info
source ${__PORTABLE_DIR}/${__IMAGE_LIST_FILE}

# Check if arch matches
if [ `uname -m` != ${IMAGE_ARCH} ]; then
    log ""
    log "Arch not match:"
    log "  current : `uname -m`"
    log "  portable: ${IMAGE_ARCH}"
    exit 1
fi

# Enter the dir of the script
cd ${__PORTABLE_DIR}

# Check Docker version / Install Docker
if [ `command -v docker` ]; then
    CURR_DOCKER_VERSION=`docker --version | grep -Eo '[0-9]+\.[0-9]+\.[0-9]'`
    if [ ${CURR_DOCKER_VERSION} != ${__DOCKER_VERSION} ]; then
        log ""
        log "The current version of the DataFlux Func prefers another version of Docker"
        log "  Current Docker (docker --version):"
        log "    -> ${CURR_DOCKER_VERSION}"
        log "  DataFlux Func prefers:"
        log "    -> ${__DOCKER_VERSION} "


        if [ ${OPT_AUTO_SETUP} = "TRUE" ]; then
            ACTION="reinstall"

        else
            log ""
            log "Reinstalling Docker will stop the docker service and shut down all running containers, this will make all your service unavailable!"
            log ""
            log "Do you want to reinstall the Docker ${__DOCKER_VERSION} (current: ${CURR_DOCKER_VERSION}) ?"
            log "  -> abort    : Stop and do nothing"
            log "  -> skip     : Skip reinstalling Docker, use current version of Docker and continue to install DataFlux Func"
            log "  -> reinstall: Reinstall Docker and install DataFlux Func"
            read -p "Your choice: " ACTION
        fi

        if [ "${ACTION}" == "reinstall" ]; then
            log "[Reinstall Docker and install DataFlux Func]"

            if [ ${OPT_AUTO_SETUP} = "FALSE" ]; then
                delay_run
            fi

            # Stop Docker service
            log "Stop Docker service"
            systemctl stop docker

            CONTAINERD_SHIM_RUNC=containerd-shim-runc-v2
            if pidof "${CONTAINERD_SHIM_RUNC}" > /dev/null; then
                killall -9 "${CONTAINERD_SHIM_RUNC}"
                sleep 10
            fi

            # Reinstall Docker
            log "Reinstall Docker"
            tar -zxvf ${__DOCKER_BIN_FILE}
            cp docker/* /usr/bin/

            log "Start Docker service"
            systemctl start docker

        elif [ "${ACTION}" == "skip" ]; then
            log "[Skip reinstalling Docker, use current version of Docker and continue to install DataFlux Func]"
            delay_run

        else
            log "[Stop and do nothing]"
            exit 0
        fi
    fi

else
    log "Install and prepare docker ${__DOCKER_VERSION}"
    tar -zxvf ${__DOCKER_BIN_FILE}
    cp docker/* /usr/bin/

    # Add systemd config
    cp ${__SYSTEMD_FILE} /etc/systemd/system/${__SYSTEMD_FILE}
    chmod 666 /etc/systemd/system/${__SYSTEMD_FILE}
    systemctl daemon-reload
    systemctl start docker
    systemctl enable ${__SYSTEMD_FILE}

    # Prepare Docker Swarm
    docker swarm init --advertise-addr=127.0.0.1 --default-addr-pool=10.255.0.0/16
fi

# Stop prev Stack
stopPrevStack ${__PROJECT_NAME}

# Load DataFlux Func image
blankLine
log "Loading image: ${__DATAFLUX_FUNC_IMAGE_GZIP_FILE}"
docker load < ${__DATAFLUX_FUNC_IMAGE_GZIP_FILE}

# Load MySQL image if necessary
if [ ${OPT_NO_MYSQL} = "FALSE" ]; then
    log "Loading image: ${__MYSQL_IMAGE_GZIP_FILE}"
    docker load < ${__MYSQL_IMAGE_GZIP_FILE}
fi

# Load Redis image if necessary
if [ ${OPT_NO_REDIS} = "FALSE" ]; then
    log "Loading image: ${__REDIS_IMAGE_GZIP_FILE}"
    docker load < ${__REDIS_IMAGE_GZIP_FILE}
fi

# Create required dirs
blankLine
mkdir -p ${_INSTALL_DIR}/{data,data/resources/extra-python-packages,data/logs,data/sqldump,mysql,redis}

cd ${_INSTALL_DIR}
log "In ${_INSTALL_DIR}"

# Copy Docker Stack example file
cp ${__PORTABLE_DIR}/${__DOCKER_STACK_EXAMPLE_FILE} ${_INSTALL_DIR}/${__DOCKER_STACK_EXAMPLE_FILE}

# Create pre-config file
blankLine
if [ ! -f ${__CONFIG_FILE} ]; then
    echo -e "# Pre-generated config:"                > ${__CONFIG_FILE}
    echo -e "SECRET          : ${__SERVER_SECRET}"  >> ${__CONFIG_FILE}
    echo -e "MYSQL_HOST      : mysql"               >> ${__CONFIG_FILE}
    echo -e "MYSQL_PORT      : 3306"                >> ${__CONFIG_FILE}
    echo -e "MYSQL_USER      : root"                >> ${__CONFIG_FILE}
    echo -e "MYSQL_PASSWORD  : ${__MYSQL_PASSWORD}" >> ${__CONFIG_FILE}
    echo -e "MYSQL_DATABASE  : dataflux_func"       >> ${__CONFIG_FILE}
    echo -e "REDIS_HOST      : redis"               >> ${__CONFIG_FILE}
    echo -e "REDIS_PORT      : 6379"                >> ${__CONFIG_FILE}
    echo -e "REDIS_DATABASE  : 5"                   >> ${__CONFIG_FILE}
    echo -e "REDIS_PASSWORD  : ''"                  >> ${__CONFIG_FILE}
    echo -e "REDIS_USE_TLS   : false"               >> ${__CONFIG_FILE}

    # Use auto setup
    if [ ${OPT_AUTO_SETUP} = "TRUE" ]; then
        echo -e "\n# Auto Setup:"  >> ${__CONFIG_FILE}
        echo -e "AUTO_SETUP: true" >> ${__CONFIG_FILE}

        if [ ${OPT_AUTO_SETUP_ADMIN_USERNAME} ] || [ ${OPT_AUTO_SETUP_ADMIN_PASSWORD} ]; then
            echo -e "\n# Auto setup admin:" >> ${__CONFIG_FILE}

            if [ ${OPT_AUTO_SETUP_ADMIN_USERNAME} ]; then
                echo -e "AUTO_SETUP_ADMIN_USERNAME: ${OPT_AUTO_SETUP_ADMIN_USERNAME}" >> ${__CONFIG_FILE}
            fi

            if [ ${OPT_AUTO_SETUP_ADMIN_PASSWORD} ]; then
                echo -e "AUTO_SETUP_ADMIN_PASSWORD: ${OPT_AUTO_SETUP_ADMIN_PASSWORD}" >> ${__CONFIG_FILE}
            fi
        fi

        if [ ${OPT_AUTO_SETUP_AK_SECRET} ]; then
            echo -e "\n# Auto setup AK:" >> ${__CONFIG_FILE}

            if [ ${OPT_AUTO_SETUP_AK_ID} ]; then
                echo -e "AUTO_SETUP_AK_ID    : ${OPT_AUTO_SETUP_AK_ID}" >> ${__CONFIG_FILE}
            fi

            echo -e "AUTO_SETUP_AK_SECRET: ${OPT_AUTO_SETUP_AK_SECRET}" >> ${__CONFIG_FILE}
        fi
    fi

    # Add extra configs
    if [ "${OPT_EXTRA_CONFIG}" ]; then
        echo -e "\n# Extra configs:" >> ${__CONFIG_FILE}
        echo -e ${OPT_EXTRA_CONFIG} >> ${__CONFIG_FILE}
    fi

    log "New config file with random secret/password created:"
else
    log "Config file already exists:"
fi
log "  ${_INSTALL_DIR}/${__CONFIG_FILE}"

# Create Docker Stack config file
blankLine
if [ ! -f ${__DOCKER_STACK_FILE} ]; then
    cp ${__DOCKER_STACK_EXAMPLE_FILE} ${__DOCKER_STACK_FILE}

    # Create a config file and use a random key/password
    if [ ${OPT_MINI} = "TRUE" ]; then
        # Using --mini to install, remove [Worker default] part
        sed -i "/# WORKER DEFAULT START/,/# WORKER DEFAULT END/d" \
            ${__DOCKER_STACK_FILE}
    else
        # Using default options to install, remove [Worker mini] part
        sed -i "/# WORKER MINI START/,/# WORKER MINI END/d" \
            ${__DOCKER_STACK_FILE}
    fi

    # Using --no-mysql to install, remove [MySQL] parts
    if [ ${OPT_NO_MYSQL} = "TRUE" ]; then
        sed -i "/# MYSQL START/,/# MYSQL END/d" \
            ${__DOCKER_STACK_FILE}
    fi

    # Using --no-redis to install, remove [Redis] parts
    if [ ${OPT_NO_REDIS} = "TRUE" ]; then
        sed -i "/# REDIS START/,/# REDIS END/d" \
            ${__DOCKER_STACK_FILE}
    fi

    sed -i \
        -e "s#<MYSQL_PASSWORD>#${__MYSQL_PASSWORD}#g" \
        -e "s#<MYSQL_IMAGE>#${MYSQL_IMAGE}#g" \
        -e "s#<REDIS_IMAGE>#${REDIS_IMAGE}#g" \
        -e "s#<DATAFLUX_FUNC_IMAGE>#${DATAFLUX_FUNC_IMAGE}#g" \
        -e "s#<PORT>#${_PORT}#g" \
        -e "s#<INSTALL_DIR>#${_INSTALL_DIR}#g" \
        ${__DOCKER_STACK_FILE}

    log "New docker stack file with random secret/password created:"

else
    log "Docker stack file already exists:"

    # Change version
    sed -i -E \
        -e "s#pubrepo.jiagouyun.com/dataflux-func/dataflux-func.+#${DATAFLUX_FUNC_IMAGE}#g" \
        ${__DOCKER_STACK_FILE}

    # Adding a TLS version to MySQL service
    if [ `grep "\-\-tls\-version" ${__DOCKER_STACK_FILE} | wc -l` -eq 0 ]; then
            echo 'Add `--tls-version=TLSv1.2` to mysql service'
            sed -i \
                -e "s#command: --innodb-large-prefix=on#command: --tls-version=TLSv1.2 --innodb-large-prefix=on#g" \
                ${__DOCKER_STACK_FILE}
    fi
fi
log "  ${_INSTALL_DIR}/${__DOCKER_STACK_FILE}"

# Create logrotate config
blankLine
if [ `command -v logrotate` ] && [ -d /etc/logrotate.d ]; then
    echo -e "${_INSTALL_DIR}/data/logs/dataflux-func.log {"  > ${__LOGROTATE_FILE}
    echo -e "    missingok"                                 >> ${__LOGROTATE_FILE}
    echo -e "    copytruncate"                              >> ${__LOGROTATE_FILE}
    echo -e "    compress"                                  >> ${__LOGROTATE_FILE}
    echo -e "    daily"                                     >> ${__LOGROTATE_FILE}
    echo -e "    rotate 7"                                  >> ${__LOGROTATE_FILE}
    echo -e "    dateext"                                   >> ${__LOGROTATE_FILE}
    echo -e "}"                                             >> ${__LOGROTATE_FILE}

    log "Logrotate config file created:"
    log "  ${__LOGROTATE_FILE}"
fi

# Do deploy
blankLine
log "Deploying: ${__PROJECT_NAME}"
docker stack deploy ${__PROJECT_NAME} -c ${__DOCKER_STACK_FILE} --resolve-image never

# Waiting for completion
blankLine
log "Please wait 30 seconds for the system to be ready..."
sleep 30
docker ps

# Go back to prev dir
cd ${__PREV_DIR}

# Some tips
blankLine
if [ ${OPT_MINI} = "TRUE" ]; then
    log "Notice: DataFlux Func is running in MINI mode"
fi
if [ ${OPT_NO_MYSQL} = "TRUE" ]; then
    log "Notice: Built-in MySQL is NOT deployed, please specify your MySQL server configs in setup page."
fi
if [ ${OPT_NO_REDIS} = "TRUE" ]; then
    log "Notice: Built-in Redis is NOT deployed, please specify your Redis server configs in setup page."
fi

blankLine
log "Port:"
log "    ${_PORT}"
log "Installed dir:"
log "    ${_INSTALL_DIR}"
log "To shut down:"
log "    sudo docker stack remove ${__PROJECT_NAME}"
log "To start:"
log "    sudo docker stack deploy ${__PROJECT_NAME} -c ${_INSTALL_DIR}/${__DOCKER_STACK_FILE}"
log "To uninstall:"
log "    sudo docker stack remove ${__PROJECT_NAME}"
log "    sudo rm -rf ${_INSTALL_DIR}"
log "    sudo rm -f /etc/logrotate.d/${__PROJECT_NAME}"

blankLine
log "In some systems or network environments, containers may be slow to start."
log "Please use the following command to check the status of the containers:"
log "    sudo docker ps -a"
log "Once all containers are running, use browser to visit http://<IP or Domain>:${_PORT}/"

# Write install info to /etc/dataflux-func
if [ ! -f ${ETC_PATH} ]; then
    echo "INSTALLED_DIR=${_INSTALL_DIR}" > ${ETC_PATH}
fi
