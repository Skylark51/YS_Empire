# 영섭랜드 서버 관제실

전북대학교 Lion Cluster의 Gaussian 계산 상태를 픽셀 오피스 형태로 확인하는 웹 대시보드입니다.

- 배포 화면: `https://skylark51.github.io/YS_Empire/`
- 저장소: `https://github.com/Skylark51/YS_Empire`
- 프런트엔드: GitHub Pages 정적 웹앱
- 실시간 수집: Windows에서 실행하는 `server-agent`

## 현재 구조

GitHub Pages는 SSH 명령을 직접 실행하거나 서버 비밀번호를 안전하게 보관할 수 없습니다. 따라서 다음과 같이 분리합니다.

```text
GitHub Pages
    ↓ HTTP API + Bearer token
Windows Lion Agent (127.0.0.1:8765)
    ↓ SSH key / BatchMode=yes
lion.jbnu.ac.kr
    ↓ 내부 ssh
lionXX / tlionXX
```

브라우저에는 Lion 비밀번호나 SSH 개인키를 저장하지 않습니다. Agent 접근 토큰은 현재 탭의 `sessionStorage`에만 저장됩니다.

## 주요 기능

- lion/tlion 노드별 실시간 접속 및 Gaussian 상태 확인
- 계산 파일, PID, 시작 시각, 작업 디렉터리, Load, CPU, 메모리 표시
- 계산 단계 및 정상/오류 종료 판정
- 서버별 메모 저장
- 다크 모드와 라이트 모드
- 서버명·직원명·계산명 검색 및 상태 필터
- 직속 서버와 차출 가능 서버 구분
- 픽셀 캐릭터 상태 표시와 우측 상세 패널

## 최초 실행

### 1. 저장소 준비

```powershell
git clone https://github.com/Skylark51/YS_Empire.git
cd YS_Empire\server-agent
```

Git 없이 ZIP으로 내려받아도 됩니다.

### 2. SSH 자동 로그인 설정

배포 화면의 **연결 설정** 버튼 또는 `agent-setup.html`을 참고합니다.

핵심 조건은 다음 두 명령이 비밀번호 없이 성공하는 것입니다.

```powershell
ssh -o BatchMode=yes skylark@lion.jbnu.ac.kr "hostname"
ssh skylark@lion.jbnu.ac.kr "ssh -o BatchMode=yes lion28 hostname"
```

Agent는 `BatchMode=yes`를 사용하므로 비밀번호 입력이 필요한 상태에서는 노드를 오프라인으로 처리합니다.

### 3. Agent 설정

`server-agent\run_agent.bat`을 처음 실행하면 `config.example.json`을 `config.json`으로 복사합니다.

`config.json`에서 다음 값을 변경합니다.

```json
{
  "api_token": "충분히 긴 임의 문자열"
}
```

`config.json`은 로컬 전용이며 GitHub에 업로드하지 않습니다.

### 4. Agent 실행

```powershell
server-agent\run_agent.bat
```

정상 실행 주소:

```text
http://127.0.0.1:8765/api/health
```

### 5. 웹 화면 연결

1. 영섭랜드 하단의 **샘플 데이터 / Lion Agent 미연결** 버튼을 누릅니다.
2. Agent 주소를 `http://127.0.0.1:8765`로 둡니다.
3. `config.json`의 `api_token`을 입력합니다.
4. **연결 테스트** 후 **저장하고 연결**을 누릅니다.

## 수집 대상

기본 설정은 JBNU CPU 풀을 자동 확장합니다.

- 직속: lion28, 29, 30, 38, 39, 40, 48, 49, 50, 51, tlion3
- 차출 가능: 나머지 lion CPU 노드
- 고성능 지원: tlion1, tlion2, tlion4
- 제외: glion1, glion2

## 보안 원칙

- SSH 개인키와 서버 비밀번호를 웹 코드에 입력하지 않습니다.
- `server-agent/config.json`을 커밋하지 않습니다.
- `server-agent/data/`의 캐시·이력·메모를 커밋하지 않습니다.
- Agent는 기본적으로 `127.0.0.1`에서만 수신합니다.
- 원격 명령은 상태 조회용이며 계산 제출·종료·파일 수정은 수행하지 않습니다.

## 테스트

```powershell
cd server-agent
py -m unittest discover -s tests -v
py -m py_compile agent.py collector.py node_collector.py storage.py gateway_agent.py
```
