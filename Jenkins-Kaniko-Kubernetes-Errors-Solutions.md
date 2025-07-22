# Jenkins + Kaniko + Kubernetes CI/CD 구축 시 발생한 주요 에러 및 해결방법

## 🚨 개요

Jenkins + Kaniko + Kubernetes를 이용한 CI/CD 파이프라인 구축 과정에서 발생했던 주요 에러들과 그 해결방법을 정리한 문서입니다. 실무에서 자주 발생하는 문제들이므로 참고하시면 도움이 될 것입니다.

---

## 📋 에러 목록

### 1. **파일 권한 에러 (AccessDeniedException)**

**에러 메시지:**
```
java.nio.file.AccessDeniedException: /home/jenkins/agent/workspace/jenkins-pipline
```

**발생 상황:**
- Jenkins Pod가 Git 체크아웃을 시도할 때 발생
- 워크스페이스 디렉토리에 쓰기 권한이 없을 때

**원인:**
- Jenkins Pod의 사용자 권한(UID/GID)과 PVC 마운트 권한이 불일치
- 호스트 디렉토리의 소유권이 Jenkins 사용자와 맞지 않음

**해결방법:**

1. **Jenkins Pod에 securityContext 설정:**
```yaml
securityContext:
  fsGroup: 1000
  runAsUser: 1000
  runAsGroup: 1000
```

2. **호스트 디렉토리 권한 설정:**
```bash
# PV가 사용하는 호스트 디렉토리 권한 변경
sudo chmod 777 /mnt/data
# 또는 소유권 변경
sudo chown -R 1000:1000 /mnt/data
```

**예방 방법:**
- PV 생성 시 미리 적절한 권한 설정
- Jenkins Pod의 securityContext를 항상 명시

---

### 2. **Kubernetes RBAC 권한 에러**

**에러 메시지:**
```
Error from server (Forbidden): pods "kaniko-builder" is forbidden: 
User "system:serviceaccount:jenkins:default" cannot get resource "pods" 
in API group "" in the namespace "jenkins"
```

**발생 상황:**
- Jenkins Pod에서 `kubectl` 명령어 실행 시
- Kubernetes API에 접근할 때

**원인:**
- Jenkins Pod가 기본 ServiceAccount(`default`)를 사용
- 기본 ServiceAccount에는 Pod 조회/실행 권한이 없음

**해결방법:**

1. **ServiceAccount 생성:**
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: jenkins-admin
  namespace: jenkins
```

2. **ClusterRole 생성:**
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: jenkins-admin
rules:
- apiGroups: ["*"]
  resources: ["*"]
  verbs: ["*"]
```

3. **ClusterRoleBinding 생성:**
```yaml
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

4. **Jenkins Pod에 ServiceAccount 지정:**
```yaml
spec:
  serviceAccountName: jenkins-admin
```

**보안 고려사항:**
- 실제 운영환경에서는 최소 권한 원칙 적용
- 필요한 리소스와 동작만 허용하는 세밀한 RBAC 설정 권장

---

### 3. **Jenkins Kubernetes Plugin의 Volume 무시 문제**

**에러 상황:**
```yaml
# Jenkinsfile에서 설정했지만
volumes:
- name: workspace-volume
  persistentVolumeClaim:
    claimName: jenkins-pv-claim

# 실제 생성된 Pod에서는
volumes:
- emptyDir:
    medium: ""
  name: "workspace-volume"  # ← PVC가 무시되고 emptyDir 사용
```

**발생 상황:**
- Declarative Pipeline에서 yaml 블록으로 volumes 설정
- 실제 생성된 Pod에서는 설정이 무시됨

**원인:**
- Jenkins Kubernetes Plugin의 알려진 버그/제한사항
- Declarative Pipeline에서 yaml 블록의 volumes 설정이 무시되는 경우 발생
- Plugin 버전에 따라 일부 기능이 제대로 동작하지 않음

**해결방법:**

**방법 1: Scripted Pipeline으로 전환 (권장)**
```groovy
// Declarative Pipeline (문제 발생)
pipeline {
    agent {
        kubernetes {
            yaml """
            volumes:
            - name: workspace-volume
              persistentVolumeClaim:
                claimName: jenkins-pv-claim
            """
        }
    }
}

// Scripted Pipeline (해결됨)
podTemplate(
    volumes: [
        hostPathVolume(hostPath: '/tmp/jenkins-workspace', mountPath: '/home/jenkins/agent')
    ],
    serviceAccount: 'jenkins-admin'
) {
    node(POD_LABEL) {
        // 파이프라인 로직
    }
}
```

**방법 2: hostPath 사용**
- PVC 대신 hostPath 볼륨 사용
- 단일 노드 클러스터에서는 문제없이 동작

**예방 방법:**
- Jenkins Kubernetes Plugin 최신 버전 사용
- 가능하면 Scripted Pipeline 방식 채택

---

### 4. **Kaniko Pod에서 파일 공유 실패**

**에러 상황:**
```
Jenkins Pod: /home/jenkins/agent/workspace/jenkins-pipline/Dockerfile ✅
Kaniko Pod:  ls: /home/jenkins/agent/workspace/jenkins-pipline: No such file or directory ❌
```

**발생 상황:**
- Jenkins Pod에서는 파일이 정상적으로 보임
- Kaniko Pod에서는 같은 경로에 파일이 없음

**원인:**
- Jenkins Pod와 Kaniko Pod가 서로 다른 볼륨을 사용
- Jenkins Pod: `emptyDir` (임시 볼륨)
- Kaniko Pod: `persistentVolumeClaim` (영구 볼륨)
- 두 Pod 간 파일 공유가 되지 않음

**해결방법:**

1. **두 Pod 모두 동일한 hostPath 사용:**

**Jenkins Pod (Scripted Pipeline):**
```groovy
podTemplate(
    volumes: [
        hostPathVolume(hostPath: '/tmp/jenkins-workspace', mountPath: '/home/jenkins/agent')
    ]
) {
    // ...
}
```

**Kaniko Pod:**
```yaml
volumes:
- name: shared-workspace
  hostPath:
    path: /tmp/jenkins-workspace
    type: DirectoryOrCreate
```

2. **호스트 디렉토리 생성:**
```bash
sudo mkdir -p /tmp/jenkins-workspace
sudo chmod 777 /tmp/jenkins-workspace
```

**검증 방법:**
```bash
# 파이프라인에서 두 Pod 모두에서 파일 목록 확인
echo "==== Jenkins Pod 파일 목록 ===="
ls -l ${env.WORKSPACE}

echo "==== Kaniko Pod 파일 목록 ===="
kubectl exec kaniko-builder --namespace jenkins -- ls -l ${env.WORKSPACE}
```

---

### 5. **Jenkins Plugin 호환성 에러**

**에러 메시지:**
```
java.lang.NoSuchMethodError: No such DSL method 'podSecurityContext' found among steps
java.lang.UnsupportedOperationException: must specify $class with an implementation
```

**발생 상황:**
- Scripted Pipeline에서 특정 함수 사용 시
- Jenkins Kubernetes Plugin 버전이 함수를 지원하지 않을 때

**원인:**
- Jenkins Kubernetes Plugin 버전과 사용하려는 함수의 비호환성
- 구버전 플러그인에서 신규 함수 미지원

**해결방법:**

1. **지원되지 않는 함수 제거:**
```groovy
// 문제 발생 코드
podTemplate(
    securityContext: podSecurityContext(fsGroup: 1000, runAsUser: 1000, runAsGroup: 1000)
) { ... }

// 해결된 코드 (함수 제거)
podTemplate(
    // securityContext 제거
) { ... }
```

2. **대체 방법 사용:**
```groovy
// podSecurityContext() 대신 yaml 블록 사용
podTemplate(
    yaml: """
apiVersion: v1
kind: Pod
spec:
  securityContext:
    fsGroup: 1000
    runAsUser: 1000
    runAsGroup: 1000
"""
) { ... }
```

3. **initContainers 파라미터 대체:**
```groovy
// 지원되지 않는 initContainers 파라미터 대신
// 런타임에 필요한 도구 설치
stage('Setup Tools') {
    sh '''
        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
        chmod +x kubectl
    '''
}
```

---

### 6. **kubectl 명령어 없음 에러**

**에러 메시지:**
```
kubectl: not found
sudo: not found
```

**발생 상황:**
- Jenkins Pod 내부에서 kubectl 명령어 실행 시
- sudo 권한이 필요한 작업 시도 시

**원인:**
- Jenkins 컨테이너 이미지에 kubectl이 기본 설치되지 않음
- Jenkins 컨테이너는 root 권한이 없음

**해결방법:**

1. **런타임에 kubectl 설치:**
```bash
stage('Setup Tools') {
    sh '''
        # kubectl 다운로드
        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
        chmod +x kubectl
        # 버전 확인
        ./kubectl version --client
    '''
}
```

2. **PATH에 현재 디렉토리 추가:**
```bash
# 각 스테이지에서 PATH 설정
export PATH="${PWD}:${PATH}"
./kubectl exec kaniko-builder ...
```

3. **sudo 없이 설치:**
```bash
# sudo 사용하지 않고 로컬 디렉토리에 설치
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
# 절대 경로로 실행
./kubectl version --client
```

---

### 7. **Docker Hub 인증 실패**

**에러 메시지:**
```
UNAUTHORIZED: authentication required; 
[map[Action:pull Class: Name:semtwo/my-nodejs-app Type:repository] 
 map[Action:push Class: Name:semtwo/my-nodejs-app Type:repository]]
```

**발생 상황:**
- Kaniko가 Docker Hub에 이미지 푸시 시도할 때
- Docker Hub 인증 정보가 없거나 잘못된 경우

**원인:**
- Kaniko Pod에 Docker Hub 인증 정보가 전달되지 않음
- Secret이 올바르게 마운트되지 않음

**해결방법:**

1. **Kubernetes Secret 생성:**
```bash
kubectl create secret docker-registry regcred \
  --docker-server=https://index.docker.io/v1/ \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_PASSWORD \
  --docker-email=YOUR_EMAIL \
  -n jenkins
```

2. **Kaniko Pod에 Secret 마운트:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: kaniko-builder
spec:
  containers:
  - name: kaniko
    image: gcr.io/kaniko-project/executor:debug
    volumeMounts:
      - name: docker-config
        mountPath: /kaniko/.docker
  volumes:
  - name: docker-config
    secret:
      secretName: regcred
      items:
        - key: .dockerconfigjson
          path: config.json
```

3. **Secret 확인:**
```bash
# Secret 존재 확인
kubectl get secrets -n jenkins

# Secret 내용 확인
kubectl get secret regcred -n jenkins -o yaml
```

**실무 팁:**
- Kubernetes Secret 사용이 실무 표준
- Jenkins Credentials보다 Kubernetes Secret이 더 안전
- Secret 이름과 키 이름 정확히 매칭 필요

---


## 💡 에러 예방을 위한 베스트 프랙티스

### 1. **단계별 검증**
- 각 스테이지마다 파일 존재 여부 확인
- 디버그 명령어 추가 (`ls`, `find`, `pwd`)

### 2. **권한 설정 표준화**
- 모든 Pod에 일관된 securityContext 적용
- 호스트 디렉토리 권한 미리 설정

### 3. **볼륨 전략 일관성**
- 모든 관련 Pod에서 동일한 볼륨 타입 사용
- hostPath vs PVC 혼용 금지

### 4. **Secret 관리**
- Kubernetes Secret 사용을 표준으로 채택
- Secret 이름과 키 명명 규칙 수립

### 5. **플러그인 버전 관리**
- Jenkins 및 플러그인 버전 고정
- 호환성 매트릭스 관리

---

## 🔍 트러블슈팅 체크리스트

### 권한 문제 발생 시:
- [ ] securityContext 설정 확인
- [ ] 호스트 디렉토리 권한 확인
- [ ] ServiceAccount 및 RBAC 설정 확인

### 파일 공유 문제 발생 시:
- [ ] 두 Pod의 볼륨 타입 일치 확인
- [ ] 마운트 경로 일치 확인
- [ ] 호스트 디렉토리 존재 확인

### 인증 문제 발생 시:
- [ ] Secret 존재 및 내용 확인
- [ ] Secret 마운트 경로 확인
- [ ] 인증 정보 유효성 확인

### 플러그인 문제 발생 시:
- [ ] Jenkins 및 플러그인 버전 확인
- [ ] 지원되지 않는 함수 사용 여부 확인
- [ ] 대체 방법 적용

---

## 📚 참고 자료

- [Jenkins Kubernetes Plugin 공식 문서](https://plugins.jenkins.io/kubernetes/)
- [Kaniko 트러블슈팅 가이드](https://github.com/GoogleContainerTools/kaniko/blob/main/docs/tutorial.md)
- [Kubernetes RBAC 공식 문서](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)
- [Docker Hub 인증 문서](https://docs.docker.com/docker-hub/access-tokens/)

이 문서가 Jenkins + Kaniko + Kubernetes CI/CD 구축 시 발생하는 문제 해결에 도움이 되기를 바랍니다. 추가 질문이나 새로운 에러가 발생하면 언제든 문의해 주세요! 