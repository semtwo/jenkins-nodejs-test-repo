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
                ./kubectl version --client
            '''
        }

        stage('Checkout') {
            checkout scm
        }

        stage('Build & Push with Kaniko') {
            sh """
                set -ex
                export PATH="${PWD}:${PATH}"
                
                echo "==== Jenkins Pod에서 Dockerfile 위치 검색 ===="
                find ${env.WORKSPACE} -name Dockerfile
                echo "==== Jenkins Pod에서 현재 작업 디렉토리 파일 목록 ===="
                ls -l ${env.WORKSPACE}

                echo "==== Kaniko Pod에서 파일 목록 확인 ===="
                ./kubectl exec kaniko-builder --namespace jenkins -- ls -l ${env.WORKSPACE}

                echo "--- Remotely executing Kaniko build ---"
                ./kubectl exec kaniko-builder --namespace jenkins -- /kaniko/executor \\
                  --dockerfile=Dockerfile \\
                  --context=${env.WORKSPACE} \\
                  --destination=${env.IMAGE_NAME}:${env.IMAGE_TAG} \\
                  --cache=true
            """
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