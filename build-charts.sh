#!/bin/bash
# This script is used to build the Func charts package.
# The production address is https://pubrepo.guance.com/chartrepo/func func-prod-chart
# The testing address is https://registry.jiagouyun.com/chartrepo/func-test func-test-chart
# param VERSION 1.6.7
# param IMAGETAG image_tag
# param REPO helm repo_address

VERSION=$1
IMAGETAG=$2
REPOSITORY=$3
REPO=$4

helm_info(){
    helm repo ls
}

build_charts(){
  #sed -e "s,{{tag}},${IMAGETAG},g" charts/values.yaml > charts/func/values.yaml
    if [[ $REPOSITORY == "pubrepo.dataflux-func.com" ]]; then
        sed -e "s,{{repository}},${REPOSITORY},g" charts/values.template.yaml > charts/func/values.yaml
        helm package charts/func --app-version ${IMAGETAG} --version ${VERSION}
        helm push func-${VERSION}.tgz oci://pubrepo.dataflux-func.com/dataflux-func
        rm -f func-${VERSION}.tgz
    else
        sed -e "s,{{repository}},${REPOSITORY},g" charts/values.template.yaml > charts/func/values.yaml
        helm package charts/func --app-version ${IMAGETAG} --version ${VERSION}
        helm cm-push func-${VERSION}.tgz ${REPO}
        rm -f func-${VERSION}.tgz
    fi
}



helm_info
build_charts
