#!/bin/bash

function auto_tag(){
  lastTag=$(git tag --list | grep -E "^${1}" | sort -V | tail -1)

  [[ ${#lastTag} > 0 ]] && {
    v=(${lastTag//_/ })
    v_main=${v[0]}_${v[1]}

    # The tag for the current version already exists, and is incremented by 1 for future versions.
    releaseCount=$[10#${lastTag:${#v_main} + 1:2} + 101]
    releaseCount=${releaseCount:1:2}

    newTag=${v_main}_${releaseCount}
  } || {
    newTag=${1}_01
  }

  newTag=${newTag//[\.\/]/_}
  git tag $newTag
  git push --tag

  echo $newTag
}

git fetch --tag
while getopts ":fpr" opt; do
  case ${opt} in
    f )
      lastReleaseTag=$(git tag --list | grep -E "^release_" | sort -V | tail -1)
      auto_tag $lastReleaseTag
      ;;
    p )
      auto_tag pre_$(date +%Y%m%d)
      ;;
    r )
      auto_tag release_$(date +%Y%m%d)
      ;;
    \? )
      echo "Available Options:"
      echo "  -f  Create bug fix image on the final production release"
      echo "  -p  Create a pre-release image"
      echo "  -r  Create a production release image"
      ;;
  esac
done
