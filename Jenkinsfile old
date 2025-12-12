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
    volumes: [
        hostPathVolume(hostPath: '/tmp/jenkins-workspace', mountPath: '/home/jenkins/agent')
    ],
    serviceAccount: 'jenkins-admin'
) {
    node(POD_LABEL) {
        
        // Environment variables
        env.DOCKER_HUB_USERNAME = "semtwo"
        env.IMAGE_NAME = "${env.DOCKER_HUB_USERNAME}/my-nodejs-app"
        env.IMAGE_TAG = "${env.BUILD_ID}"

        stage('Setup Tools') {
            sh '''
                # kubectl을 현재 디렉토리에 설치
                curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                chmod +x kubectl
                # PATH에 현재 디렉토리 추가
                export PATH="${PWD}:${PATH}"
                ./kubectl version --client
            '''
        }

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
                        # PATH에 kubectl 경로 추가
                        export PATH="${PWD}:${PATH}"
                        
                        echo "--- Remotely executing Kaniko build ---"
                        ./kubectl exec kaniko-builder --namespace jenkins -- /kaniko/executor \\
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
            sh """
                export PATH="${PWD}:${PATH}"
                sed -i 's|image: .*|image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}|g' deployment.yaml
                echo "Updated deployment.yaml with new image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}"
            """
        }

        stage('Deploy to Kubernetes') {
            withCredentials([
                file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')
            ]) {
                sh '''
                  export PATH="${PWD}:${PATH}"
                  export KUBECONFIG=${KUBECONFIG_FILE}
                  echo "--- Applying manifests ---"
                  ./kubectl apply -f deployment.yaml
                  ./kubectl apply -f service.yaml
                '''
                echo "Deployment successful!"
            }
        }
    }
}