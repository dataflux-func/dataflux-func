#!/bin/bash
# This script is used to build the Func charts package.
# The production address is https://pubrepo.guance.com/chartrepo/func func-prod-chart
# The testing address is https://registry.jiagouyun.com/chartrepo/func-test func-test-chart
# param VERSION 1.6.7
# param IMAGETAG image_tag
# param REPO helm repo_address

VERSION=$1
IMAGETAG=$2
REPO=$3

helm_info(){
    helm repo ls
}

build_charts(){
  #sed -e "s,{{tag}},${IMAGETAG},g" charts/values.yaml > charts/func/values.yaml
  helm package charts/func --app-version ${IMAGETAG} --version ${VERSION}
}

push_charts(){
    helm cm-push func-${VERSION}.tgz ${REPO}
    rm -f func-${VERSION}.tgz
}

helm_info
build_charts
push_charts
