pipeline {
    agent {
        kubernetes {
            defaultContainer 'main'
            yaml """
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: jenkins-admin
  securityContext:
    fsGroup: 1000
    runAsUser: 1000
    runAsGroup: 1000

  initContainers:
    - name: install-kubectl
      image: bitnami/kubectl:latest
      command: ["sh", "-c", "cp /opt/bitnami/kubectl/bin/kubectl /tools/ && chmod +x /tools/kubectl"]
      volumeMounts:
        - name: tools
          mountPath: /tools

  containers:
    - name: main
      image: jenkins/inbound-agent:jdk17
      command: ["sleep"]
      args: ["99d"]
      tty: true
      volumeMounts:
        - name: workspace-volume
          mountPath: /home/jenkins/agent
        - name: tools
          mountPath: /tools

  volumes:
    - name: workspace-volume
      hostPath:
        path: /tmp/jenkins-workspace
        type: DirectoryOrCreate
    - name: tools
      emptyDir: {}
"""
        }
    }

    environment {
        DOCKER_HUB_USERNAME = "semtwo"
        IMAGE_NAME = "${DOCKER_HUB_USERNAME}/my-nodejs-app"
        IMAGE_TAG = "${env.BUILD_ID}"
        PATH = "/tools:${env.PATH}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build & Push with Kaniko') {
            steps {
                withCredentials([
                    usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')
                ]) {
                    script {
                        def authToken = "${DOCKER_USER}:${DOCKER_PASS}".bytes.encodeBase64().toString()
                        def dockerConfigJson = '{"auths":{"https://index.docker.io/v1/":{"auth":"' + authToken + '"}}}'

                        sh """
                            set -ex
                            echo "==== Jenkins Pod에서 Dockerfile 위치 검색 ===="
                            find ${env.WORKSPACE} -name Dockerfile
                            echo "==== Jenkins Pod에서 현재 작업 디렉토리 파일 목록 ===="
                            ls -l ${env.WORKSPACE}

                            echo "==== Kaniko Pod에서 파일 목록 확인 ===="
                            kubectl exec kaniko-builder --namespace jenkins -- ls -l ${env.WORKSPACE}

                            echo "==== Kaniko Pod에서 Dockerfile 위치 검색 ===="
                            kubectl exec kaniko-builder --namespace jenkins -- find ${env.WORKSPACE} -name Dockerfile

                            echo "--- Remotely executing Kaniko build ---"
                            kubectl exec kaniko-builder --namespace jenkins -- /kaniko/executor \\
                              --dockerfile=Dockerfile \\
                              --context=${env.WORKSPACE} \\
                              --destination=${IMAGE_NAME}:${IMAGE_TAG} \\
                              --cache=true \\
                              --build-arg DOCKER_CONFIG_JSON='${dockerConfigJson}'
                        """
                    }
                }
            }
        }

        stage('Update Manifest') {
            steps {
                sh "sed -i 's|image: .*|image: ${IMAGE_NAME}:${IMAGE_TAG}|g' deployment.yaml"
                echo "Updated deployment.yaml with new image: ${IMAGE_NAME}:${IMAGE_TAG}"
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                withCredentials([
                    file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')
                ]) {
                    sh '''
                      export KUBECONFIG=${KUBECONFIG_FILE}
                      echo "--- Applying manifests ---"
                      kubectl apply -f deployment.yaml
                      kubectl apply -f service.yaml
                    '''
                    echo "Deployment successful!"
                }
            }
        }
    }
}