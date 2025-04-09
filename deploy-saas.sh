#!/bin/bash

# This script will provide the latest version, please do not modify this script in your project

# get the Rancher config for the corresponding cluster
function get_rancher_config() {
  cluster_with_prefix=$1

  # get the prefix and cluster ID from the environment variable
  IFS=':' read -ra parts <<< "$cluster_with_prefix"
  prefix="${parts[0]}"
  cluster_id="${parts[2]}"

  # get the API URL and token from the environment variable
  IFS=' ' read -ra API_URLS <<< "$RANCHER_API_BASE_URL"
  IFS=' ' read -ra TOKENS <<< "$PROD_RANCHER_TOKEN"

  for url in "${API_URLS[@]}"; do
    if [[ "$url" == "${prefix}:"* ]]; then
      api_url="${url#*:}"
      break
    fi
  done

  for token in "${TOKENS[@]}"; do
    if [[ "$token" == "${prefix}:"* ]]; then
      rancher_token="${token#*:}"
      break
    fi
  done

  if [[ -z "$api_url" || -z "$rancher_token" ]]; then
    echo "Error: No Rancher configuration found for prefix $prefix" >&2
    return 1
  fi

  echo "$api_url"
  echo "$rancher_token"
  echo "$cluster_id"
}

function do_cd(){
  cluster_with_prefix=$1
  imageFullName=$2
  namespace=$3
  workload=$4
  version=$5
  workloadType=$6

  # get the Rancher config for the corresponding cluster
  rancher_config=($(get_rancher_config "$cluster_with_prefix"))

  if [[ $? -ne 0 ]]; then
    return 1
  fi

  api_url="${rancher_config[0]}"
  token="${rancher_config[1]}"
  cluster_id="${rancher_config[2]}"

  url=${api_url}/k8s/clusters/${cluster_id}/apis/apps/v1/namespaces/${namespace}/${workloadType}/${workload}
  imagePath=${imageFullName}:${version}

  data='[{"op":"replace","path":"/spec/template/spec/containers/0/image","value":"'${imagePath}'"}]'

  curl -u "${token}" -X PATCH -H 'Content-Type: application/json-patch+json' $url -d "${data}"
  # echo "${token}" -X PATCH -H 'Content-Type: application/json-patch+json' $url -d "${data}"
}

function deploy_cluster(){
  cluster_with_prefix=$1
  version=$2

  echo "do upgrade, version: ${version}"
  namespace=launcher
  imageFullName=${DEPLOY_IMAGE_HOST}${DEPLOY_IMAGE_PATH}

  # deploy deployments
  for wk in $DEPLOY_PROJECT_WORKLOAD
  do
    do_cd $cluster_with_prefix $imageFullName $DEPLOY_NAMESPACE $wk $version deployments
  done

  # deploy statefulsets
  for wk in $DEPLOY_PROJECT_STATEFULSET
  do
    do_cd $cluster_with_prefix $imageFullName $DEPLOY_NAMESPACE $wk $version statefulsets
  done
}

function each_cluster(){
  lastReleaseTag=$(git tag --list | grep -E "^release_" | sort -V | tail -1)
  lastDeployTag=$(git tag --list | grep -E "^deploy_" | sort -V | tail -1)

  splitV=(${lastDeployTag//_/ })
  splitSite=${splitV[2]}

  for cluster_with_prefix in $RANCHER_CLUSTER_IDS
  do
    IFS=':' read -ra parts <<< "$cluster_with_prefix"
    prefix="${parts[0]}"
    site="${parts[1]}"

    if [[ -z "$splitSite" || "$splitSite" == "all" || "$site" == "$splitSite" ]]; then
      echo "Deploying to cluster: $cluster_with_prefix with version: $lastReleaseTag"
      deploy_cluster $cluster_with_prefix $lastReleaseTag
    fi
  done
}

# each_cluster

function do_trigger_tag(){
  trigger_site=$1

  git fetch --tag
  lastReleaseTag=$(git tag --list | grep -E "^release_" | sort -V | tail -1)
  lastReleaseTagCommitID=$(git rev-list -n 1 ${lastReleaseTag})
  lastDeployTag=$(git tag --list | grep -E "^deploy_" | sort -V | tail -1)

  [[ ${#lastDeployTag} > 0 ]] && {
    v=(${lastDeployTag//_/ })
    v_main=${v[0]}

    # if the tag already exists, the next version number increases by 1
    # if the tag does not exist, the next version number is 00001
    deployCount=$[10#${lastDeployTag:${#v_main} + 1:5} + 100001]
    deployCount=${deployCount:1:5}

    echo $deployCount

    if [[ -z "$trigger_site" || "$trigger_site" == "all" ]]; then
      newDeployTag=${v_main}_${deployCount}
    else
      newDeployTag=${v_main}_${deployCount}_${trigger_site}
    fi

  } || {
    newDeployTag=deploy_00001
  }

  echo $newDeployTag

  # in the latest release tag, add a deploy tag, trigger CD action
  git tag -a $newDeployTag -m 'deploy trigger ${newDeployTag}' $lastReleaseTagCommitID
  git push --tags
}

while getopts ":t:d" opt; do
    case $opt in
        t)
            echo "add a tag to deploy trigger"
            param_t="$OPTARG"

            do_trigger_tag $param_t
            ;;
        d)
            echo "do deploy"
            each_cluster
            ;;
        ?)
            echo "-t: trigger CD action, with the option to specify site deployment, or 'all' to deploy all sites"
            exit 1
            ;;
    esac
done
