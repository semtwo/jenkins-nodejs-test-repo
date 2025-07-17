pipeline {
    agent {
        kubernetes {
            yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: kaniko
    image: semtwo/kaniko-kubectl:latest
    imagePullPolicy: Always
    command:
    - "/busybox/cat"
    tty: true
    resources:
      requests:
        cpu: "200m"
        memory: "512Mi"
    volumeMounts:
      - name: "workspace-volume"
        mountPath: "/home/jenkins/agent"
        readOnly: false
  volumes:
    - name: "workspace-volume"
      emptyDir:
        medium: ""
  imagePullSecrets:
    - name: regcred
 """
         }
     }
    environment {
        DOCKER_HUB_USERNAME = "semtwo"
        IMAGE_NAME = "${DOCKER_HUB_USERNAME}/my-nodejs-app"
        IMAGE_TAG = "${env.BUILD_ID}"
        DOCKER_CONFIG = "/home/jenkins/agent/.docker" // Kaniko가 인증 파일을 찾을 경로
    }
    stages {
        stage('Checkout') {
            steps {
                // Git 저장소에서 소스 코드를 가져옵니다.
                // 이 단계에서 app.js, Dockerfile, deployment.yaml, service.yaml 등이 에이전트의 작업 공간으로 복사됩니다.
                checkout scm
            }
        }
        stage('Build & Push with Kaniko') {
            steps {
                // 1. Docker Hub 인증 정보를 사용하여 config.json 파일을 직접 생성합니다.
                // 이 파일은 Kaniko가 Docker Hub에 인증할 때 사용됩니다.
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    script {
                        // 사용자 이름과 비밀번호를 Base64로 인코딩하여 인증 토큰을 만듭니다.
                        def authToken = "${DOCKER_USER}:${DOCKER_PASS}".bytes.encodeBase64().toString()
                        // Kaniko가 인식하는 Docker config.json 파일의 내용을 정의합니다.
                        def dockerConfig = """
                        {
                            "auths": {
                                "https://index.docker.io/v1/": {
                                    "auth": "${authToken}"
                                }
                            }
                        }
                        """
                        // 작업 공간에 .docker 디렉토리를 만들고 그 안에 config.json 파일을 씁니다.
                        sh "mkdir -p ${DOCKER_CONFIG}"
                        writeFile(file: "${DOCKER_CONFIG}/config.json", text: dockerConfig)
                    }
                }

                // 2. kaniko 컨테이너 안에서 이미지 빌드 및 푸시를 실행합니다.
                container(name: 'kaniko', shell: '/busybox/sh') {
                    sh """
                        set -ex # 디버깅을 위해 명령어 실행 전 출력 및 오류 시 즉시 종료

                        echo "--- Checking kubectl version (inside kaniko) ---"
                        kubectl version --client # kubectl이 제대로 설치되었는지 확인 (디버깅용)

                        echo "--- Building and Pushing Docker Image ---"
                        /kaniko/executor \\
                        --dockerfile=`pwd`/Dockerfile \\
                        --context=`pwd` \\
                        --destination=${IMAGE_NAME}:${IMAGE_TAG} \\
                        --cache=true
                        """
                }
            }
        }
        stage('Update Manifest') {
            steps {
                // 배포할 deployment.yaml 파일의 이미지 태그를 방금 빌드한 새 이미지 태그로 교체합니다.
                sh "sed -i 's|image: .*|image: ${IMAGE_NAME}:${IMAGE_TAG}|g' deployment.yaml"
                echo "Updated deployment.yaml with new image: ${IMAGE_NAME}:${IMAGE_TAG}"
            }
        }
        stage('Deploy to Kubernetes') {
            steps {
                // 4. kaniko 컨테이너 안에서 최종 배포를 실행합니다.
                // 이제 kubectl이 이 컨테이너 안에 있으므로, 별도의 kubectl 컨테이너가 필요 없습니다.
                container(name: 'kaniko') {
                    withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')]) {
                        // KUBECONFIG 환경 변수를 설정하여 kubectl이 클러스터에 인증하도록 합니다.
                        sh 'export KUBECONFIG=${KUBECONFIG_FILE} && kubectl apply -f deployment.yaml && kubectl apply -f service.yaml'
                        echo "Deployment successful!"
                    }
                }
            }
        }
    }
}