podTemplate(
    containers: [
        containerTemplate(
            name: 'main', 
            image: 'jenkins/inbound-agent:jdk17', 
            command: 'sleep', 
            args: '99d',
            ttyEnabled: true
        )
    ],
    initContainers: [
        containerTemplate(
            name: 'install-kubectl',
            image: 'bitnami/kubectl:latest',
            command: 'sh',
            args: '-c "cp /opt/bitnami/kubectl/bin/kubectl /tools/ && chmod +x /tools/kubectl"'
        )
    ],
    volumes: [
        hostPathVolume(hostPath: '/tmp/jenkins-workspace', mountPath: '/home/jenkins/agent'),
        emptyDirVolume(mountPath: '/tools')
    ],
    serviceAccount: 'jenkins-admin'
) {
    node(POD_LABEL) {
        
        // Environment variables
        env.DOCKER_HUB_USERNAME = "semtwo"
        env.IMAGE_NAME = "${env.DOCKER_HUB_USERNAME}/my-nodejs-app"
        env.IMAGE_TAG = "${env.BUILD_ID}"
        env.PATH = "/tools:${env.PATH}"

        stage('Checkout') {
            checkout scm
        }

        stage('Build & Push with Kaniko') {
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
                          --destination=${env.IMAGE_NAME}:${env.IMAGE_TAG} \\
                          --cache=true \\
                          --build-arg DOCKER_CONFIG_JSON='${dockerConfigJson}'
                    """
                }
            }
        }

        stage('Update Manifest') {
            sh "sed -i 's|image: .*|image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}|g' deployment.yaml"
            echo "Updated deployment.yaml with new image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}"
        }

        stage('Deploy to Kubernetes') {
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