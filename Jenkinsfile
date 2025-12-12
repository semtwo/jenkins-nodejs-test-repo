podTemplate(
    label: 'main-agent-pod', 
    
    // 🚨 JNLP Agent RWX 문제 해결 및 안정화 YAML
    yaml: '''
apiVersion: v1
kind: Pod
spec:
  # HostPath 볼륨의 권한 문제 우회를 위해 Root(0) 권한으로 실행
  securityContext:
    fsGroup: 1000
    runAsUser: 0  
''',
    
    containers: [
        containerTemplate(
            name: 'jnlp', 
            image: 'jenkins/inbound-agent:jdk17', 
            ttyEnabled: true,
            // JNLP Agent가 Workspace 볼륨을 사용하도록 마운트
            volumeMounts: [
                volumeMount(mountPath: '/home/jenkins/agent', name: 'volume-0'),
                volumeMount(mountPath: '/home/jenkins/agent/workspace', name: 'workspace-volume') 
            ]
        ),
        // 🚨 Kaniko 빌드 컨테이너를 Pod에 추가 (통합)
        containerTemplate(
            name: 'kaniko', 
            image: 'gcr.io/kaniko-project/executor:latest',
            command: '/busybox/cat', // 컨테이너가 즉시 종료되는 것을 방지
            args: ' /dev/null',
            volumeMounts: [
                // Git Checkout 코드 공유 (context)
                volumeMount(mountPath: '/workspace', name: 'workspace-volume'), 
                // Docker Registry 인증 정보 (config.json)
                volumeMount(mountPath: '/kaniko/.docker', name: 'docker-config')
            ]
        )
    ],
    volumes: [
        // JNLP Agent 작업 디렉토리 (RWX 문제 해결 로직이 포함된 곳)
        hostPathVolume(hostPath: '/tmp/jenkins-workspace', mountPath: '/home/jenkins/agent'),
        // 🚨 코드와 빌드 컨텍스트를 공유하기 위한 EmptyDir 볼륨
        emptyDirVolume(mountPath: '/home/jenkins/agent/workspace', name: 'workspace-volume'),
        // 🚨 Docker Registry 인증을 위한 Secret 볼륨
        secretVolume(secretName: 'regcred', mountPath: '/kaniko/.docker', name: 'docker-config')
    ],
    serviceAccount: 'jenkins-admin'
) {
    node('main-agent-pod') { 
        
        // Environment variables ... (기존 유지)

        // 🚨 Setup Tools & Env 스테이지는 kubectl 사용하지 않으므로 삭제합니다.

        stage('Checkout') {
            checkout scm 
        }

        // 🚨 Build & Push with Kaniko (Kaniko 컨테이너 실행)
        stage('Build & Push with Kaniko') {
            container('kaniko') { // 🚨 kaniko 컨테이너에서 명령 실행
                sh """
                    set -ex
                    echo "--- Starting Kaniko Build inside Agent Pod ---"
                    /kaniko/executor \\
                      --dockerfile=${WORKSPACE}/Dockerfile \\
                      --context=${WORKSPACE} \\
                      --destination=${env.IMAGE_NAME}:${env.IMAGE_TAG} \\
                      --cache=true
                """
            }
        }
        
        // Update Manifest 및 Deploy 스테이지는 JNLP Agent(기본 컨테이너)에서 실행됩니다.

        stage('Update Manifest') {
             sh """
                sed -i 's|image: .*|image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}|g' deployment.yaml
                echo "Updated deployment.yaml with new image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}"
            """
        }

        stage('Deploy to Kubernetes') {
            // Deploy 스테이지가 실행될 때, kubectl이 필요합니다.
            // Jenkins Agent (jnlp 컨테이너)에 kubectl이 설치되어 있지 않으므로, 이 스테이지에서 다시 설치 로직을 넣어줍니다.
            withCredentials([
                 file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')
            ]) {
                sh '''
                    # 🚨 Deploy 스테이지에 kubectl 설치 및 PATH 설정 로직을 추가합니다.
                    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                    chmod +x kubectl
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