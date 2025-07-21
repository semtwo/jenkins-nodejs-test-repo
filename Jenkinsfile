pipeline {
    agent {
        kubernetes {
            label 'kaniko-build-agent'
            defaultContainer 'main'

            // =================================================================
            // 1. Pod 레벨의 보안 컨텍스트를 추가하여 파일 시스템 권한 문제를 해결합니다.
            // =================================================================
            securityContext {
                fsGroup 1000
            }

            // 작업용 컨테이너(main)
            containerTemplate {
                name 'main'
                image 'jenkins/inbound-agent:3309.v27b_9314fd1a_4-1'
                command 'sleep'
                args '99d'
                ttyEnabled true
                volumeMounts {
                    volumeMount {
                        mountPath '/home/jenkins/agent/workspace'
                        name 'shared-workspace'
                    }
                    volumeMount {
                        mountPath '/tools'
                        name 'tools'
                    }
                }
            }

            // kubectl을 준비하는 initContainer
            initContainerTemplate {
                name 'install-kubectl'
                image 'bitnami/kubectl:latest'
                command 'sh'
                args '-c "cp /opt/bitnami/kubectl/bin/kubectl /tools/ && chmod +x /tools/kubectl"'
                volumeMounts {
                    volumeMount {
                        mountPath '/tools'
                        name 'tools'
                    }
                }
            }

            // Pod가 사용할 볼륨들
            volumes {
                persistentVolumeClaim {
                    claimName 'jenkins-kaniko-shared-workspace'
                    readOnly false
                }
                emptyDirVolume {
                    mountPath '/tools'
                    memory false
                }
            }
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
                // 소스 코드를 공유 저장소(/home/jenkins/agent/workspace)에 내려받습니다.
                checkout scm
            }
        }

        // =================================================================
        // 2. Kaniko 빌드를 원격으로 실행
        // =================================================================
        stage('Build & Push with Kaniko') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    )
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
                // 이 단계는 Jenkins 에이전트에서 실행되며, 공유 저장소의 파일을 수정합니다.
                sh "sed -i 's|image: .*|image: ${IMAGE_NAME}:${IMAGE_TAG}|g' deployment.yaml"
                echo "Updated deployment.yaml with new image: ${IMAGE_NAME}:${IMAGE_TAG}"
            }
        }

        stage('Deploy to Kubernetes') {
            steps {
                withCredentials([
                    file(
                        credentialsId: 'kubeconfig',
                        variable: 'KUBECONFIG_FILE'
                    )
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