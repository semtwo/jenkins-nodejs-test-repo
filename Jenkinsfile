def IMAGE_NAME = 'semtwo/jenkins-nodejs-test-repo'
def DEFAULT_TAG = 'app'

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
            args: '-c "sleep 3600"',
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
        
        def CURRENT_IMAGE_TAG = "${DEFAULT_TAG}-${env.BUILD_NUMBER}"
        
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
                    // **최종 수정**: --dockerfile-config 제거
                    sh "set -ex && /kaniko/executor --dockerfile=\${WORKSPACE}/Dockerfile --context=\${WORKSPACE} --destination=${IMAGE_NAME}:${CURRENT_IMAGE_TAG} --cache=true"
                }
            }
            
            stage('Update Manifest') {
                container('jnlp') {
                    sh """
                        sed -i 's|image: .*|image: ${IMAGE_NAME}:${CURRENT_IMAGE_TAG}|g' deployment.yaml
                        echo "Updated deployment.yaml with new image: ${IMAGE_NAME}:${CURRENT_IMAGE_TAG}"
                    """
                }
            }

            stage('Deploy to Kubernetes') {
                withCredentials([
                     file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')
                ]) {
                    container('jnlp') {
                        sh '''
                            set -ex
                            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                            chmod +x kubectl
                            export PATH="${PWD}:${PATH}"
                            
                            export KUBECONFIG=${KUBECONFIG_FILE}
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