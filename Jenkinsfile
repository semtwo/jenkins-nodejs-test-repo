podTemplate(
    label: 'main-agent-pod', 
    yaml: '''
apiVersion: v1
kind: Pod
spec:
  securityContext:
    fsGroup: 1000
    runAsUser: 0  
''',
    
    containers: [
        containerTemplate(
            name: 'jnlp', 
            image: 'jenkins/inbound-agent:jdk17', 
            ttyEnabled: true,
            volumeMounts: [
                [mountPath: '/home/jenkins/agent', name: 'volume-0'],
                [mountPath: '/home/jenkins/agent/workspace', name: 'workspace-volume'] 
            ]
        ),
        containerTemplate(
            name: 'kaniko', 
            image: 'gcr.io/kaniko-project/executor:debug', 
            command: 'sh', 
            args: '-c "sleep 3600"', // Kaniko 대기 명령
            volumeMounts: [
                [mountPath: '/workspace', name: 'workspace-volume'], 
                [mountPath: '/kaniko/.docker', name: 'docker-config']
            ]
        )
    ],
    volumes: [
        hostPathVolume(hostPath: '/tmp/jenkins-workspace', mountPath: '/home/jenkins/agent'),
        emptyDirVolume(mountPath: '/home/jenkins/agent/workspace', name: 'workspace-volume'),
        emptyDirVolume(mountPath: '/kaniko/.docker', name: 'docker-config') 
    ],
    serviceAccount: 'jenkins-admin'
) {
    node('main-agent-pod') { 
        
        // 환경 변수 정의
        def IMAGE_NAME = 'semtwo/jenkins-nodejs-test-repo'
        def IMAGE_TAG = "build-${env.BUILD_NUMBER}"
        
        // Credential을 사용하여 인증 파일 생성
        withCredentials([
            usernamePassword(credentialsId: 'dockerhub-credentials', 
                             usernameVariable: 'DOCKER_USER', 
                             passwordVariable: 'DOCKER_PASS')
        ]) {
            
            stage('Checkout') {
                checkout scm 
            }
            
            stage('Authenticate Docker') {
                container('jnlp') {
                    sh """
                        set -ex
                        
                        mkdir -p \${WORKSPACE}/.docker/
                        
                        DOCKER_REGISTRY_URL="https://index.docker.io/v1/"
                        
                        DOCKER_AUTH_BASE64=\$(echo -n "\$DOCKER_USER:\$DOCKER_PASS" | base64)

                        echo "{\\"auths\\": {\\"\$DOCKER_REGISTRY_URL\\": {\\"auth\\": \\"\$DOCKER_AUTH_BASE64\\"}}}" > \${WORKSPACE}/.docker/config.json
                        
                        cp \${WORKSPACE}/.docker/config.json /kaniko/.docker/config.json
                        
                        echo "Docker configuration file created successfully."
                    """
                }
            }

            stage('Build & Push with Kaniko') {
                container('kaniko') {
                    sh """
                        set -ex
                        /kaniko/executor \\
                          --dockerfile=\${WORKSPACE}/Dockerfile \\
                          --context=\${WORKSPACE} \\
                          --destination=${IMAGE_NAME}:${IMAGE_TAG} \\ 
                          --cache=true \\
                          --dockerfile-config=/kaniko/.docker/config.json
                    """
                }
            }
            def DEFAULT_TAG = 'app' // Jenkins Credential ID 'docker-tag-name'에서 가져온 값
            def CURRENT_IMAGE_TAG = "${DEFAULT_TAG}-${env.BUILD_NUMBER}"
            
            stage('Update Manifest') {
                container('jnlp') { // JNLP Agent 컨테이너에서 실행
                    sh """
                        # ${SECURE_IMAGE_NAME}:${CURRENT_IMAGE_TAG}를 배포 파일에 반영
                        sed -i 's|image: .*|image: \${SECURE_IMAGE_NAME}:\${CURRENT_IMAGE_TAG}|g' deployment.yaml
                        echo "Updated deployment.yaml with new image: \${SECURE_IMAGE_NAME}:\${CURRENT_IMAGE_TAG}"
                    """
                }
            }

            stage('Deploy to Kubernetes') {
                // kubectl 사용을 위해 kubeconfig credential을 가져옵니다.
                withCredentials([
                     file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')
                ]) {
                    container('jnlp') { // JNLP Agent 컨테이너에서 실행
                        sh '''
                            set -ex
                            # 🚨 Deploy 스테이지마다 kubectl 설치 (JNLP Agent에는 기본 설치되어 있지 않음)
                            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                            chmod +x kubectl
                            export PATH="${PWD}:${PATH}"
                            
                            # KUBECONFIG 환경 변수를 설정하여 kubectl이 클러스터에 접근하도록 합니다.
                            export KUBECONFIG=${KUBECONFIG_FILE}
                            echo "--- Applying manifests ---"
                            ./kubectl apply -f deployment.yaml
                            ./kubectl apply -f service.yaml
                            echo "Deployment successful!"
                        '''
                    }
                }
            }           
        }
    }
}