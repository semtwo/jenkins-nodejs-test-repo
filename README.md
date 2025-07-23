# Jenkins + Kaniko + Kubernetes로 완전 자동화 CI/CD 파이프라인 구축하기

## 🎯 프로젝트 개요

### 목표
Git Push만으로 Docker 이미지 빌드부터 Kubernetes 배포까지 완전 자동화되는 CI/CD 파이프라인 구축

### 아키텍처 플로우
```
Git Push → Jenkins Webhook → Kaniko Build → Docker Hub Push → Kubernetes Deploy
```

---

## 🖥️ 서버 환경 정보

### 하드웨어 & OS
- **OS**: Rocky Linux 
- **Kubernetes**: 단일 노드 클러스터
- **Jenkins**: v2.504.3
- **Docker Hub**: 이미지 레지스트리

### 주요 구성 요소
- **Jenkins**: CI/CD 파이프라인 오케스트레이션
- **Kaniko**: Docker 데몬 없이 컨테이너 이미지 빌드
- **Kubernetes**: 컨테이너 오케스트레이션 플랫폼
- **GitHub**: 소스 코드 저장소

---

## 📁 프로젝트 구조

```
jenkins-nodejs-test-repo/
├── app.js                          # Node.js 애플리케이션
├── Dockerfile                      # Docker 이미지 빌드 설정
├── Jenkinsfile                     # CI/CD 파이프라인 정의
├── deployment.yaml                 # Kubernetes Deployment 매니페스트
├── service.yaml                    # Kubernetes Service 매니페스트
├── kaniko-builder-pod.yaml         # Kaniko 빌더 Pod 설정
├── serviceAccount.yaml             # RBAC 권한 설정
└── volume.yaml                     # 스토리지 설정
```

---

## 🔧 단계별 구축 방법

### 1. Kubernetes RBAC 설정

**파일: `serviceAccount.yaml`**
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: jenkins-admin
  namespace: jenkins
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: jenkins-admin
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: jenkins-admin
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: jenkins-admin
subjects:
- kind: ServiceAccount
  name: jenkins-admin
  namespace: jenkins
```

```bash
kubectl apply -f serviceAccount.yaml
```

### 2. Docker Hub Secret 생성

```bash
kubectl create secret docker-registry regcred \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_PASSWORD \
  --docker-email=YOUR_EMAIL \
  -n jenkins
```

### 3. 호스트 디렉토리 준비

```bash
sudo mkdir -p /tmp/jenkins-workspace
sudo chmod 777 /tmp/jenkins-workspace
```

### 4. Kaniko Builder Pod 배포

**파일: `kaniko-builder-pod.yaml`**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: kaniko-builder
  namespace: jenkins
  labels:
    app: kaniko-builder
spec:
  restartPolicy: Always
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    command: ["/bin/sh", "-c", "sleep 100d"]
    volumeMounts:
      - name: shared-workspace
        mountPath: /home/jenkins/agent
      - name: docker-config
        mountPath: /kaniko/.docker
  volumes:
  - name: shared-workspace
    hostPath:
      path: /tmp/jenkins-workspace
      type: DirectoryOrCreate
  - name: docker-config
    secret:
      secretName: regcred
      items:
        - key: .dockerconfigjson
          path: config.json
```

```bash
kubectl apply -f kaniko-builder-pod.yaml
```

### 5. Jenkins Pipeline 설정 (Scripted Pipeline)

**파일: `Jenkinsfile`**
```groovy
podTemplate(
    containers: [
        containerTemplate(
            name: 'main', 
            image: 'jenkins/inbound-agent:jdk17', 
            command: 'sleep', 
            args: '99d',
            ttyEnabled: true
        )
    ],
    volumes: [
        hostPathVolume(hostPath: '/tmp/jenkins-workspace', mountPath: '/home/jenkins/agent')
    ],
    serviceAccount: 'jenkins-admin'
) {
    node(POD_LABEL) {
        
        // Environment variables
        env.DOCKER_HUB_USERNAME = "semtwo"
        env.IMAGE_NAME = "${env.DOCKER_HUB_USERNAME}/my-nodejs-app"
        env.IMAGE_TAG = "${env.BUILD_ID}"

        stage('Setup Tools') {
            sh '''
                curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
                chmod +x kubectl
                ./kubectl version --client
            '''
        }

        stage('Checkout') {
            checkout scm
        }

        stage('Build & Push with Kaniko') {
            sh """
                set -ex
                export PATH="${PWD}:${PATH}"

                echo "--- Remotely executing Kaniko build ---"
                ./kubectl exec kaniko-builder --namespace jenkins -- /kaniko/executor \\
                  --dockerfile=Dockerfile \\
                  --context=${env.WORKSPACE} \\
                  --destination=${env.IMAGE_NAME}:${env.IMAGE_TAG} \\
                  --cache=true
            """
        }

        stage('Update Manifest') {
            sh """
                export PATH="${PWD}:${PATH}"
                sed -i 's|image: .*|image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}|g' deployment.yaml
                echo "Updated deployment.yaml with new image: ${env.IMAGE_NAME}:${env.IMAGE_TAG}"
            """
        }

        stage('Deploy to Kubernetes') {
            withCredentials([
                file(credentialsId: 'kubeconfig', variable: 'KUBECONFIG_FILE')
            ]) {
                sh '''
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
```

### 6. 애플리케이션 매니페스트

**파일: `deployment.yaml`**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-nodejs-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-nodejs-app
  template:
    metadata:
      labels:
        app: my-nodejs-app
    spec:
      containers:
        - name: web
          image: semtwo/my-nodejs-app:initial
          ports:
            - containerPort: 8080
```

**파일: `service.yaml`**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-nodejs-app-service
spec:
  type: NodePort
  selector:
    app: my-nodejs-app
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
      nodePort: 30080
```

### 7. 샘플 애플리케이션

**파일: `app.js`**
```javascript
const http = require('http');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello World from Node.js in Kubernetes!\n');
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**파일: `Dockerfile`**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY app.js .
CMD ["node", "app.js"]
```

---

## 🚀 실행 및 테스트

### 1. Jenkins에서 파이프라인 생성
1. Jenkins 웹 UI 접속 (`http://<NODE_IP>:32000`)
2. 새 파이프라인 프로젝트 생성
3. Pipeline script from SCM 설정
4. GitHub 리포지토리 연결

### 2. 자동 배포 테스트
```bash
# 코드 수정 후 Git Push
git add .
git commit -m "Update application"
git push origin main

# 파이프라인 자동 실행 확인
# Jenkins 웹 UI에서 빌드 로그 확인
```

### 3. 배포된 애플리케이션 접속
```bash
# 서비스 확인
kubectl get svc -n jenkins

# 애플리케이션 접속
curl http://<NODE_IP>:30080
# 또는 브라우저에서 http://<NODE_IP>:30080
```

---

## 🔗 관련 문서

### 에러 해결 가이드
주요 에러 구축시 해결 방법들 정리해둠둠

📋 **[Jenkins-Kaniko-Kubernetes-Errors-Solutions.md](./Jenkins-Kaniko-Kubernetes-Errors-Solutions.md)**

주요 에러 유형:
- 파일 권한 에러 (AccessDeniedException)
- Kubernetes RBAC 권한 에러
- Jenkins Kubernetes Plugin의 Volume 무시 문제
- Kaniko Pod에서 파일 공유 실패
- Docker Hub 인증 실패
- 기타 호환성 및 설정 에러들

---

## 📊 성능 및 결과

### 파이프라인 실행 시간
- **전체 파이프라인**: 약 2-3분
- **Docker 이미지 빌드**: 약 30초
- **Kubernetes 배포**: 약 10초

### 자동화 범위
- ✅ Git Push 감지
- ✅ Docker 이미지 자동 빌드
- ✅ Docker Hub 자동 푸시
- ✅ Kubernetes 매니페스트 자동 업데이트
- ✅ Rolling Update 자동 배포
- ✅ 서비스 자동 노출

---

## 💡 핵심 포인트 및 팁

### 성공 요인
1. **Scripted Pipeline 사용**: Declarative Pipeline의 volume 제한 우회
2. **hostPath 볼륨 공유**: Jenkins와 Kaniko Pod 간 파일 공유
3. **Kubernetes Secret 활용**: 실무 표준 인증 방식
4. **적절한 RBAC 설정**: 보안과 기능성의 균형

### 주의사항
- Jenkins Kubernetes Plugin 버전 호환성 확인
- 볼륨 마운트 경로 일치 필수
- Secret 이름과 키 정확히 매칭
- 파일명 오타 주의 (service vs sevice)

---

## 🏆 최종 성공 아키텍처

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
│   Git Push  │───▶│   Jenkins    │───▶│   Kaniko    │───▶│  Docker Hub  │
└─────────────┘    │   Pipeline   │    │   Builder   │    └─────────────┘
                   └──────────────┘    └─────────────┘             │
                          │                    │                   │
                          ▼                    ▼                   ▼
                   ┌──────────────┐    ┌─────────────┐    ┌──────────────┐
                   │  hostPath    │◀──▶│  hostPath   │    │ Kubernetes   │
                   │  Volume      │    │  Volume     │◀───│ Deployment   │
                   └──────────────┘    └─────────────┘    └──────────────┘
```

---

## 🔗 참고 자료

- [Jenkins Kubernetes Plugin](https://plugins.jenkins.io/kubernetes/)
- [Kaniko 공식 문서](https://github.com/GoogleContainerTools/kaniko)
- [Kubernetes 공식 문서](https://kubernetes.io/docs/)
- [Docker Hub 공식 문서](https://docs.docker.com/docker-hub/)

---

## 📝 마무리

이번 프로젝트를 통해 Jenkins + Kaniko + Kubernetes를 활용한 완전 자동화 CI/CD 파이프라인을 성공적으로 구축할 수 있었다.
처음에는 일반적인 Docker 데몬 방식으로 컨테이너 이미지를 빌드하려고 했는데, 예상치 못한 설치 이슈로 인해 막혔었다. 하지만 이 문제 덕분에 Kaniko라는 새로운 도구를 알게 되었고, 실제로 사용해보면서 많은 것을 배울 수 있었다.
결과적으로는 전화위복이었던 것 같다. Docker 데몬 방식과 비교했을 때 Kaniko가 메모리와 디스크 사용량 면에서 훨씬 효율적이고, 특히 Kubernetes 환경에서는 보안과 리소스 관리 측면에서도 더 적합했다. 클라우드 환경에서 비용 절감 효과까지 생각하면, 앞으로도 이런 환경을 구축할 때는 Kaniko를 우선적으로 고려하게 될 것 같다.
솔직히 말하면 열흘 동안 정말 고생했다. 에러가 하나 해결되면 또 다른 에러가 나타나고, 그때마다 구글링과 공식 문서를 뒤져가며 해결책을 찾아야 했다. 특히 Jenkins Kubernetes Plugin의 볼륨 설정이 무시되는 문제나, Pod 간 파일 공유 이슈는 정말 머리가 아팠다.
하지만 마침내 파이프라인이 성공적으로 돌아가는 순간 그동안의 모든 고생이 한 번에 보상받는 느낌이었다. 덕분에 문제 해결 능력도 늘었고, Jenkins와 Kubernetes에 대한 이해도도 훨씬 깊어진 것 같다.
다음번에는 이런 삽질 없이 좀 더 효율적으로 구축할 수 있을 거라 확신한다.