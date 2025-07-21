pipeline {
    agent {
        kubernetes {
            yaml """
apiVersion: v1
kind: Pod
spec:
  # =================================================================
  # 1. kubectl을 준비하는 initContainer 추가
  # =================================================================
  initContainers:
  - name: install-kubectl
    # kubectl이 포함된 경량 이미지를 사용합니다.
    image: bitnami/kubectl:latest
    # 공유 볼륨에 kubectl 실행 파일을 복사하는 명령을 실행합니다.
    command:
      - "sh"
      - "-c"
      - |
        echo "Copying kubectl to shared volume..."
        mkdir -p /home/jenkins/agent/tools
        cp /opt/bitnami/kubectl/bin/kubectl /home/jenkins/agent/tools/kubectl
        chmod +x /home/jenkins/agent/tools/kubectl
        echo "kubectl is ready."
    volumeMounts:
      - name: "workspace-volume"
        mountPath: "/home/jenkins/agent"
        readOnly: false
  # =================================================================
  # 2. 메인 컨테이너는 kaniko 하나로 단순화
  # =================================================================
    33   containers:
   - name: kaniko
     # 디버그 이미지는 쉘을 포함하고 있어 여러 명령어를 실행하기에 좋습니다.
     image: gcr.io/kaniko-project/executor:debug
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
        DOCKER_CONFIG = "/home/jenkins/agent/.docker"
        # =================================================================
        # 3. 공유 볼륨에 복사된 kubectl을 PATH에 추가
        # =================================================================
        PATH = "/home/jenkins/agent/tools:${env.PATH}"
    }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Build & Push with Kaniko') {
            steps {
                withCredentials([usernamePassword(credentialsId:
       'dockerhub-credentials', usernameVariable: 'DOCKER_USER', passwordVariable:
       'DOCKER_PASS')]) {
                    script {
                        def authToken = "${DOCKER_USER}:${DOCKER_PASS}"
                        .bytes.encodeBase64().toString()
                        def dockerConfig = """
                        {
                            "auths": {
                                "https://index.docker.io/v1/": {
                                    "auth": "${authToken}"
                                }
                            }
                        }
                        """
                        sh "mkdir -p ${DOCKER_CONFIG}"
                        writeFile(file: "${DOCKER_CONFIG}/config.json", text:
       dockerConfig)
                    }
                }
                container(name: 'kaniko', shell: '/busybox/sh') {
                    sh """
                        set -ex
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
                sh "sed -i 's|image: .*|image: ${IMAGE_NAME}:${IMAGE_TAG}|g'
                    deployment.yaml"
                echo "Updated deployment.yaml with new image: ${IMAGE_NAME}:
                    ${IMAGE_TAG}"
            }
        }
        stage('Deploy to Kubernetes') {
            steps {
                //
                =================================================================
                # 4. 이제 kaniko 컨테이너에서 kubectl을 바로 사용
                #
                =================================================================
                container(name: 'kaniko') {
                    withCredentials([file(credentialsId: 'kubeconfig',
                        variable: 'KUBECONFIG_FILE')]) {
                        sh '''
                          # PATH가 설정되었으므로 kubectl 명령이 바로
                          동작합니다.
                          export KUBECONFIG=${KUBECONFIG_FILE}

                          # kubectl이 잘 설치되었는지 확인 (디버깅용)
                          echo "--- Checking kubectl version ---"
                          kubectl version --client

                          echo "--- Applying manifests ---"
                          kubectl apply -f deployment.yaml
                          kubectl apply -f service.yaml
                         '''
                        echo "Deployment successful!"
                    }
                }
            }
        }
    }
}