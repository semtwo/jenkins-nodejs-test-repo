// 파이프라인 정의
pipeline {
    agent {
            kubernetes {
                // Pod 템플릿 정의
                yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    imagePullPolicy: Always
    command:          
    - /busybox/cat
    tty: true
    resources:
      requests:
        cpu: "200m"
        memory: "512Mi"
    volumeMounts:     
      - name: workspace-volume
        mountPath: /home/jenkins/agent
        readOnly: false
  - name: kubectl
    image: bitnami/kubectl:latest
    imagePullPolicy: Always
    command:
    - cat
    tty: true
    resources:
      requests:
        cpu: "100m"
        memory: "256Mi"
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent
        readOnly: false
  volumes:
    - name: workspace-volume
      emptyDir: {}
"""
         }
    }
    environment {
        DOCKER_HUB_USERNAME = "semtwo"
        IMAGE_NAME = "${DOCKER_HUB_USERNAME}/my-nodejs-app"
        IMAGE_TAG = "${env.BUILD_ID}"
        DOCKER_CONFIG = "/home/jenkins/agent/.docker"
    }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Build & Push with Kaniko') {
            steps {
                // 1. Docker Hub 인증 정보를 사용하여 config.json 파일을 직접 생성합니다.
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    script {
                        // Base64 인코딩된 인증 토큰 생성
                        def authToken = "${DOCKER_USER}:${DOCKER_PASS}".bytes.encodeBase64().toString()
                        // config.json 파일 내용 정의
                        def dockerConfig = """
                        {
                            "auths": {
                                "https://index.docker.io/v1/": {
                                    "auth": "${authToken}"
                                }
                            }
                        }
                        """
                        // 작업 공간에 .docker 디렉토리를 만들고 config.json 파일을 씁니다.
                        sh "mkdir -p ${DOCKER_CONFIG}"
                        writeFile(file: "${DOCKER_CONFIG}/config.json", text: dockerConfig)
                    }
                }
                // 2. kaniko 컨테이너에서 이미지 빌드 및 푸시
                container(name: 'kaniko', shell: '/busybox/sh') {
                    // Kaniko는 DOCKER_CONFIG 환경 변수를 자동으로 인식하여 인증에 사용합니다.
                    sh """
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
                sh "sed -i 's|image: .*|image: ${IMAGE_NAME}:${IMAGE_TAG}|g' deployment.yaml"
                echo "Updated deployment.yaml with new image: ${IMAGE_NAME}:${IMAGE_TAG}"
            }
        }
        stage('Deploy to Kubernetes') {
            steps {
                container(name: 'kubectl') {
                    withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')]) {
                        sh 'export KUBECONFIG=${KUBECONFIG_FILE} && kubectl apply -f deployment.yaml && kubectl apply -f service.yaml'
                        echo "Deployment successful!"
                    }
                }
            }
        }
    }
}