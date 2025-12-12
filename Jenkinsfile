podTemplate(
    label: 'main-agent-pod', // JNLP Agent Pod의 레이블 명시
    
    // 🚨 JNLP 권한 문제 해결을 위한 securityContext 추가
    yaml: '''
apiVersion: v1
kind: Pod
spec:
  securityContext:
    fsGroup: 1000 
''',
    
    containers: [
        containerTemplate(
            name: 'jnlp', 
            image: 'jenkins/inbound-agent:jdk17', // 성공 로그의 'main' 컨테이너 역할
            command: 'sleep', 
            args: '99d',
            ttyEnabled: true
        ),
        // Kaniko 컨테이너를 여기에 추가하는 대신, 별도 Pod로 실행합니다.
    ],
    volumes: [
        // 이 볼륨은 JNLP 컨테이너의 작업 디렉토리 권한 문제를 일으킵니다.
        hostPathVolume(hostPath: '/tmp/jenkins-workspace', mountPath: '/home/jenkins/agent')
    ],
    serviceAccount: 'jenkins-admin'
) {
    node('main-agent-pod') { // 수정된 레이블 사용
        
        // Environment variables ... (유지)

        stage('Setup Tools & Env') {
            // ... (kubectl 설치 로직 유지)
        }

        stage('Checkout') {
            checkout scm // (유지)
        }
        
        // 🚨 새로 추가된 스테이지: Kaniko Builder Pod 생성
        stage('Create Kaniko Builder') {
            sh '''
                set -ex
                # Secret이 이미 존재한다고 가정하고, regcred를 사용하여 Kaniko Pod를 생성합니다.
                # 컨테이너 이름은 성공 로그에서 사용된 'kaniko-builder'로 설정합니다.
                
                # --- 임시 Kaniko Pod YAML ---
                cat <<EOF | ./kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: kaniko-builder
  namespace: jenkins
spec:
  containers:
  - name: kaniko-builder
    image: gcr.io/kaniko-project/executor:latest
    args: ["sleep", "3600"] # 1시간 동안 유지
    volumeMounts:
    - name: docker-config
      mountPath: /kaniko/.docker
  restartPolicy: Never
  volumes:
  - name: docker-config
    secret:
      secretName: regcred # 이전에 생성하신 Secret 사용
EOF
                echo "Waiting for kaniko-builder Pod to be ready..."
                ./kubectl wait --for=condition=Ready pod/kaniko-builder --timeout=120s
            '''
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
                        # 🚨 성공 로그에서 사용된 kubectl exec 명령어로 복구
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
        
        // 🚨 새로 추가된 스테이지: Kaniko Pod 정리
        stage('Cleanup Kaniko Builder') {
            sh 'kubectl delete pod kaniko-builder --namespace jenkins --ignore-not-found=true'
        }

        // ... (Update Manifest 및 Deploy to Kubernetes 로직 유지)
    }
}