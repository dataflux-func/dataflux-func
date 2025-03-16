# DataFlux Func

DataFlux Func is a platform for developing, managing, executing Python scripts.

- [Requirements](#Requirements)
- [Installation](#Installation)
- [Uninstallation](#Uninstallation)
- [Configuration](#Configuration)

## Description

This Chart use [Helm](https://helm.sh) package manager to deploy DataFlux Func on [Kubernetes](http://kubernetes.io) cluster.

## Requirements

- Kubernetes 1.14+
- [Helm 3.0-beta3+](https://helm.sh/zh/docs/intro/install/)

## Installation

1. Enabling Ingress and Pvc Storage Mounts to Deploy Func

To install a chart with the version name `<RELEASE_NAME>`, do the following:

```sh
$ helm repo add func https://pubrepo.guance.com/chartrepo/func
$ helm repo update

# Installation
$ helm install <RELEASE_NAME> func/func -n <NameSpace> --create-namespace \
  --set storage.pvc.enabled=true,storage.pvc.storageClass="<you-storageClass>" \
  --set ingress.enabled=true,ingress.hostName="myfunc.com"

NAME: func
LAST DEPLOYED: Wed Apr 20 16:57:56 2022
NAMESPACE: <NameSpace>
STATUS: deployed
REVISION: 1
NOTES:
1. Get the application URL by running these commands:

  http://myfunc.com/

# Check Status
kubectl get pods -n <NameSpace>
```

This command deploys Func on a Kubernetes cluster in its default configuration. The [Configuration](#Configuration) section lists the available options during installation.

2. Enabling NodePort and HostPath Storage Mount to deploy Func

To install a chart with version name `<RELEASE_NAME>`, note that `nodeSelector` must be set, do the following:

```sh
$ helm repo add func https://pubrepo.guance.com/chartrepo/func
$ helm repo update

# Installation
$ helm install <RELEASE_NAME> func/func -n <NameSpace> --create-namespace  \
  --set storage.hostPath.enabled=true,storage.hostPath.path="<you path>",storage.pvc.enabled=false,storage.hostPath.nodeSelector."key"=<value> \
  --set server.service.nodePortEnable=true,server.service.nodePort=30100

NAME: func
LAST DEPLOYED: Wed Apr 20 19:30:49 2022
NAMESPACE: <NameSpace>
STATUS: deployed
REVISION: 1
NOTES:
1. Get the application URL by running these commands:
  export NODE_PORT=$(kubectl get --namespace <NameSpace> -o jsonpath="{.spec.ports[0].nodePort}" services func-server)
  export NODE_IP=$(kubectl get nodes --namespace <NameSpace> -o jsonpath="{.items[0].status.addresses[0].address}")
  echo http://$NODE_IP:$NODE_PORT
```

> Tip: List all versions `helm list -n <your namespace>`

## Uninstallation

To uninstall/delete the `<RELEASE_NAME>` deployment:

```sh
$ helm delete <RELEASE_NAME> -n func
```

This command will remove all Kubernetes components associated with the chart and remove the version.

## Configuration

The following table lists the available options and their default values for the starter chart.

| Parameter                           | Description                            | Default                                          |
| ----------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `timeZore`                          | container time zone                    | `CST`                                            |
| `image.repository`                  | Func image address                     | `pubrepo.guance.com/dataflux-func/dataflux-func` |
| `image.tag`                         | Image tag                              | `nil`                                            |
| `image.pullPolicy`                  | Image pull policy                      | `IfNotPresent`                                   |
| `storage.pvc.enabled`               | Enable PVC or not                      | `true`                                           |
| `storage.pvc.storageClass`          | Storage class                          | `nfs-client`                                     |
| `storage.mysql.storageRequests`     | Mysql storage size                     | `50Gi`                                           |
| `storage.redis.storageRequests`     | Redis storage size                     | `10Gi`                                           |
| `storage.resources.storageRequests` | Resource storage size                  | `10Gi`                                           |
| `storage.hostPath.enabled`          | Enable host mounting or not            | `false`                                          |
| `storage.hostPath.path`             | Host mounting path                     | `/data`                                          |
| `storage.hostPath.nodeSelector`     | Node selector                          | `{}`                                             |
| `nameOverride`                      | Override App name                      | ``                                               |
| `fullnameOverride`                  | Override App full name                 | ``                                               |
| `func.MYSQL_HOST`                   | MySQL host                             | `mysql`                                          |
| `func.MYSQL_PORT`                   | MySQL port                             | `3306`                                           |
| `func.MYSQL_USER`                   | MySQL user                             | `root`                                           |
| `func.MYSQL_PASSWORD`               | MySQL password                         | `dea45f7be3dd8184`                               |
| `func.MYSQL_DATABASE`               | MySQL database                         | `dataflux_func`                                  |
| `func.REDIS_HOST`                   | Redis host                             | `redis`                                          |
| `func.REDIS_DATABASE`               | Redis database                         | `5`                                              |
| `func.REDIS_PASSWORD`               | Redis password                         | `dsfs3%sf4343`                                   |
| `func.LOG_LEVEL`                    | Func log level                         | `WARNING`                                        |
| `func.LOG_FILE_FORMAT`              | Func log file format                   | `text`                                           |
| `func.WEB_BASE_URL`                 | Func base URL for web                  | ``                                               |
| `ingress.enabled`                   | Enable ingress or not                  | `false`                                          |
| `ingress.className`                 | ingress class name                     | ``                                               |
| `ingress.hostName`                  | ingress hostname                       | `myfunc.com`                                     |
| `ingress.annotations`               | ingress annotations                    | ``                                               |
| `ingress.hosts[].paths[].path`      | ingress path                           | `/`                                              |
| `ingress.hosts[].paths[].pathType`  | ingress path type                      | `ImplementationSpecific`                         |
| `ingress.tls[]`                     | ingress TLS                            | ``                                               |
| `mysql.enabled`                     | Enable MySQL or not                    | `true`                                           |
| `mysql.replicas`                    | MySQL replicas                         | `1`                                              |
| `mysql.image.repository`            | MySQL image address                    | `pubrepo.guance.com/dataflux-func/mysql`         |
| `mysql.image.tag`                   | MySQL image tag                        | `5.7.26`                                         |
| `redis.enabled`                     | Enable Redis or not                    | `true`                                           |
| `redis.replicas`                    | Redis replicas                         | `1`                                              |
| `redis.image.repository`            | Redis image address                    | `pubrepo.guance.com/dataflux-func/redis`         |
| `redis.image.tag`                   | Redis image tag                        | `5.0.7`                                          |
| `server.enabled`                    | Enable Func server service or not      | `true`                                           |
| `server.replicas`                   | Func server replicas                   | `1`                                              |
| `server.service.nodePortEnable`     | Enable nodePort for Func server or not | `false`                                          |
| `server.service.port`               | Func server port                       | `8088`                                           |
| `server.service.type`               | Func server port type                  | `NodePort`                                       |
| `server.service.nodePort`           | Func server nodePort port              | `31080`                                          |
| `worker_0.enabled`                  | Enable Func worker_0 service or not    | `true`                                           |
| `worker_0.replicas`                 | Func worker_0 replicas                 | `1`                                              |
| `worker_1.enabled`                  | Enable Func worker_1 service or not    | `true`                                           |
| `worker_1.replicas`                 | Func worker_1 replicas                 | `1`                                              |
| `worker_2.enabled`                  | Enable Func worker_2 service or not    | `true`                                           |
| `worker_2.replicas`                 | Func worker_2 replicas                 | `2`                                              |
| `worker_3.enabled`                  | Enable Func worker_3 service or not    | `true`                                           |
| `worker_3.replicas`                 | Func worker_3 replicas                 | `1`                                              |
| `worker_5.enabled`                  | Enable Func worker_5 service or not    | `true`                                           |
| `worker_5.replicas`                 | Func worker_5 replicas                 | `1`                                              |
| `worker_6.enabled`                  | Enable Func worker_6 service or not    | `true`                                           |
| `worker_6.replicas`                 | Func worker_6 replicas                 | `1`                                              |
| `beat.enabled`                      | Enable Func worker_beat service or not | `true`                                           |
| `beat.replicas`                     | Func worker_beat replicas              | `1`                                              |

Use `--set key=value[,key=value]` to specify each option for helm installation.

For example, deploying without the built-in MySQL, Redis:

```sh
$ helm install <RELEASE_NAME> func/func -n func --create-namespace  \
  --set storage.pvc.enabled=true --set storage.pvc.storageClass="<you-storageClass>" \
  --set ingress.enabled=true,ingress.hostName="www.func.com" \
  --set mysql.enabled=false,redis.enabled=false \
  --set func.MYSQL_HOST="<your mysql host>,func.MYSQL_PASSWORD="<mysql password>" \
  --set func.REDIS_HOST="<your redis host>",func.REDIS_PASSWORD="<redis password>"
```

Alternatively, a yaml file specifying the values of the above options can be provided to the chart installation. For example

```sh
$ helm install <RELEASE_NAME> -f values.yaml func/func
```
