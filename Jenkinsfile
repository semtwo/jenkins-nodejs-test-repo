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
            args: ['-c', 'sleep 3600'], 
            volumeMounts: [
                [mountPath: '/workspace', name: 'workspace-volume'], 
                [mountPath: '/kaniko/.docker', name: 'docker-config']
            ]
        )
    ],
    volumes: [
        hostPathVolume(hostPath: '/tmp/jenkins-workspace', mountPath: '/home/jenkins/agent'),
        emptyDirVolume(mountPath: '/home/jenkins/agent/workspace', name: 'workspace-volume'),
        secretVolume(secretName: 'regcred', mountPath: '/kaniko/.docker', name: 'docker-config')
    ],
    serviceAccount: 'jenkins-admin'
) {
    node('main-agent-pod') { 
        
        stage('Checkout') {
            checkout scm 
        }

        stage('Build & Push with Kaniko') {
            container('kaniko') {
                sh """
                    set -ex
                    /kaniko/executor \\
                      --dockerfile=${WORKSPACE}/Dockerfile \\
                      --context=${WORKSPACE} \\
                      --destination=${env.IMAGE_NAME}:${env.IMAGE_TAG} \\
                      --cache=true
                """
            }
        }
        
        stage('Update Manifest') {
             sh """
                sed -i 's|image: .*|image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}|g' deployment.yaml
                echo "Updated deployment.yaml with new image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}"
            """
        }

        stage('Deploy to Kubernetes') {
            withCredentials([
                 file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')
            ]) {
                sh '''
                    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                    chmod +x kubectl
                    export PATH="${PWD}:${PATH}"
                    
                    export KUBECONFIG=${KUBECONFIG_FILE}
                    ./kubectl apply -f deployment.yaml
                    ./kubectl apply -f service.yaml
                '''
                echo "Deployment successful!"
            }
        }
    }
}