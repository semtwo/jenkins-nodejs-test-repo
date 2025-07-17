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
    volumeMounts:     
      - name: docker-config
        mountPath: /kaniko/.docker
      - name: workspace-volume
        mountPath: /home/jenkins/agent
        readOnly: false
  - name: kubectl
    image: bitnami/kubectl:latest
    imagePullPolicy: Always
    command:
    - cat
    tty: true
    volumeMounts:
      - name: workspace-volume
        mountPath: /home/jenkins/agent
        readOnly: false
  volumes:
    - name: docker-config
      projected:
        sources:
        - secret:
          name: dockerhub-secret
          items:
            - key: .dockerconfigjson
              path: config.json
    - name: workspace-volume
      emptyDir: {}
"""
         }
    }
    environment {
        // 환경 변수 설정
        DOCKER_HUB_USERNAME = "semtwo"
        IMAGE_NAME = "${DOCKER_HUB_USERNAME}/my-nodejs-app"
        // 빌드마다 고유한 태그를 생성 (예: my-nodejs-app:3)
        IMAGE_TAG = "${env.BUILD_ID}"
    }
    stages {
        stage('Checkout') {
            steps {
                // Git 저장소에서 소스 코드를 가져옵니다.
                checkout scm
            }
        }
        stage('Build & Push with Kaniko') {
            steps {
                // 1. kubectl 컨테이너에서 Docker Hub 인증용 Secret 생성
                container(name: 'kubectl') {
                    withCredentials([usernamePassword(credentialsId:'dockerhub-credentials', usernameVariable: 'DOCKER_USER', passwordVariable:'DOCKER_PASS')]) 
                    {
                        sh 'kubectl create secret docker-registry dockerhub-secret --docker-server=https://index.docker.io/v1/ --docker-username=${DOCKER_USER} --docker-password=${DOCKER_PASS} --dry-run=client -o yaml | kubectl apply -f -'
                    }
                }
                // 2. kaniko 컨테이너에서 이미지 빌드 및 푸시
                container(name: 'kaniko', shell: '/busybox/sh') {
                    sh """
                        /kaniko/executor \\
                        --dockerfile=`pwd`/Dockerfile \\
                        --context=`pwd` \\
                        --destination=${IMAGE_NAME}:${IMAGE_TAG} \\
                        --cache=true
                    """
                }
                // 3. kubectl 컨테이너에서 사용이 끝난 Secret 삭제
                container(name: 'kubectl') {
                    sh 'kubectl delete secret dockerhub-secret'
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
                // 4. kubectl 컨테이너에서 최종 배포
                container(name: 'kubectl') {
                    withCredentials([file(credentialsId: 'kubeconfig',
                        variable: 'KUBECONFIG_FILE')]) {
                        sh 'export KUBECONFIG=${KUBECONFIG_FILE} && kubectl apply -f deployment.yaml && kubectl apply -f service.yaml'
                        echo "Deployment successful!"
                    }
                }
            }
        }
    }
}