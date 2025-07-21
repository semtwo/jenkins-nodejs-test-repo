pipeline {
    agent {
        kubernetes {
            // 구버전 플러그인을 위해 yaml 블록을 사용합니다.
            // 모든 정의를 이 안에 명시적으로 작성합니다.
            defaultContainer 'main'
            yaml """
apiVersion: v1
kind: Pod
spec:
  # =================================================================
  # AccessDeniedException 해결을 위해 securityContext를 yaml에 직접 정의
  # =================================================================
  securityContext:
    fsGroup: 1000

  # initContainer를 yaml에 직접 정의
  initContainers:
    - name: install-kubectl
      image: bitnami/kubectl:latest
      command: ["sh", "-c", "cp /opt/bitnami/kubectl/bin/kubectl /tools/ && chmod +x /tools/kubectl"]
      volumeMounts:
        - name: tools
          mountPath: /tools

  # 우리의 작업용 컨테이너 'main'을 yaml에 직접 정의
  containers:
    - name: main
      image: jenkins/inbound-agent:jdk17
      command: ["sleep"]
      args: ["99d"]
      tty: true
      volumeMounts:
        - name: shared-workspace
          mountPath: /home/jenkins/agent/workspace
        - name: tools
          mountPath: /tools

  # Pod가 사용할 볼륨들을 yaml에 직접 정의
  volumes:
    - name: shared-workspace
      persistentVolumeClaim:
        claimName: jenkins-kaniko-shared-workspace
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
                // 이제 main 컨테이너가 정상적으로 생성되고, 권한 문제도 해결되어야 합니다.
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
                            echo "--- Remotely executing Kaniko build ---"
                            kubectl exec kaniko-builder --namespace jenkins -- /kaniko/executor \
                              --dockerfile=/workspace/Dockerfile \
                              --context=/workspace \
                              --destination=${IMAGE_NAME}:${IMAGE_TAG} \
                              --cache=true \
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