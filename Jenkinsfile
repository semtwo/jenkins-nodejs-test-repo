 pipeline {
      agent {
        kubernetes {
            yaml """
     apiVersion: v1
     kind: Pod
     spec:
     initContainers:
     - name: install-kubectl
       image: bitnami/kubectl:latest
       command: ["sh", "-c", "cp /opt/bitnami/kubectl/bin/kubectl /tools/ && chmod +x /tools/kubectl"]
       volumeMounts:
       - name: tools
         mountPath: /tools
     containers:
     - name: jnlp
       image: jenkins/inbound-agent:3309.v27b_9314fd1a_4-1
       # 이 에이전트도 공유 저장소에 접속해야 합니다.
       volumeMounts:
       - name: shared-workspace
         mountPath: /home/jenkins/agent/workspace
       - name: tools
         mountPath: /tools
     volumes:
     # 공유 저장소(PVC)를 이 Pod에 연결합니다.
     - name: shared-workspace
       persistentVolumeClaim:
         claimName: jenkins-kaniko-shared-workspace
     - name: tools
       emptyDir: {}
     """
         }
     }

     environment {
         DOCKER_HUB_USERNAME = "semtwo"
         IMAGE_NAME = "${DOCKER_HUB_USERNAME}/my-nodejs-app"
         IMAGE_TAG = "${env.BUILD_ID}"
         // initContainer가 복사해 둔 kubectl을 PATH에 추가합니다.
         PATH = "/tools:${env.PATH}"
     }

     stages {
         stage('Checkout') {
             steps {
                 // 소스 코드를 공유 저장소(/home/jenkins/agent/workspace)에 내려받습니다.
                 checkout scm
             }
         }

         // =================================================================
         // 2. Kaniko 빌드를 원격으로 실행
         // =================================================================
         stage('Build & Push with Kaniko') {
             steps {
                 withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                     script {
                         // Kaniko Pod는 Docker 인증 정보가 필요 없으므로, 여기서는 변수만 사용합니다.
                         // 실제 인증은 Kaniko Pod가 아닌, Kaniko Executor가 직접 처리합니다.
                         def authToken = "${DOCKER_USER}:${DOCKER_PASS}".bytes.encodeBase64().toString()
                         def dockerConfigJson = """{"auths":{"https://index.docker.io/v1/":{"auth":"${authToken}"}}}"""

                         // kubectl exec 명령어로 kaniko-builder Pod에게 원격으로 빌드를 지시합니다.
                         sh """
                             set -ex

                             echo "--- Remotely executing Kaniko build ---"

                             kubectl exec kaniko-builder --namespace jenkins -- /kaniko/executor \\
                               --dockerfile=/workspace/Dockerfile \\
                               --context=/workspace \\
                               --destination=${IMAGE_NAME}:${IMAGE_TAG} \\
                               --cache=true \\
                               --build-arg DOCKER_CONFIG_JSON='${dockerConfigJson}'
                         """
                     }
                     }
             }
         }

         stage('Update Manifest') {
             steps {
                 // 이 단계는 Jenkins 에이전트에서 실행되며, 공유 저장소의 파일을 수정합니다.
                 sh "sed -i 's|image: .*|image: ${IMAGE_NAME}:${IMAGE_TAG}|g' deployment.yaml"
                 echo "Updated deployment.yaml with new image: ${IMAGE_NAME}:${IMAGE_TAG}"
             }
         }

         stage('Deploy to Kubernetes') {
             steps {
                 withCredentials([file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')]) {
                     sh '''
                       export KUBECONFIG=${KUBECONFIG_FILE}

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