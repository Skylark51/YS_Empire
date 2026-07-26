# YS Lion Agent

영섭랜드와 JBNU Lion 서버 사이에서 동작하는 로컬 읽기 전용 브리지입니다.

## 실제 접속 구조

이 환경에서는 Windows가 `lion51` 같은 내부 노드를 직접 찾지 않습니다. 접속 경로는 다음과 같습니다.

```text
Windows
  └─ ssh lion.jbnu.ac.kr
       └─ ssh lion51
```

Lion 로그인 서버 안에서는 평소처럼 아래 명령만 사용합니다.

```bash
ssh lion51
```

`hostname` 같은 추가 명령은 필요하지 않습니다.

Agent도 동일하게 먼저 `lion.jbnu.ac.kr`에 접속한 뒤, 로그인 서버 안에서 `ssh lionXX`를 실행합니다. Windows의 `ProxyJump lionXX` 설정은 이 Agent에 필요하지 않습니다.

## Windows SSH 설정

`%USERPROFILE%\.ssh\config`에는 로그인 서버 설정만 있으면 됩니다.

```sshconfig
Host lion.jbnu.ac.kr
    HostName lion.jbnu.ac.kr
    User skylark
    Port 10022
    IdentityFile C:/Users/default.DESKTOP-SFALK24/.ssh/id_ed25519_lion_skylark
    IdentitiesOnly yes
```

접속 확인은 Windows PowerShell에서 다음처럼 합니다.

```powershell
ssh lion.jbnu.ac.kr
```

접속 후 Lion 로그인 서버 안에서:

```bash
ssh lion51
```

두 단계가 정상 동작하면 Agent가 같은 경로를 자동으로 사용합니다.

## Agent 설정

`run_agent.bat`를 처음 실행하면 `config.example.json`을 복사해 `config.json`을 만듭니다.

기본 연결 설정은 다음과 같습니다.

```json
"connection_mode": "gateway_shell",
"gateway": "lion.jbnu.ac.kr"
```

반드시 토큰을 변경합니다.

```json
"api_token": "충분히_긴_임의의_문자열"
```

노드 목록의 `ssh_alias`는 로그인 서버 안에서 실제로 입력하는 이름과 같아야 합니다.

```json
{ "id": "lion51", "ssh_alias": "lion51", "default_directory": "/home/skylark" }
```

## 실행

```text
run_agent.bat
```

실행 파일은 내부적으로 `gateway_agent.py`를 호출합니다. 이 래퍼가 다음 경로를 구성합니다.

```text
lion.jbnu.ac.kr -> ssh lion28
lion.jbnu.ac.kr -> ssh lion29
...
lion.jbnu.ac.kr -> ssh lion51
```

정상 실행 시 콘솔에 다음 내용이 표시됩니다.

```text
접속 경로: lion.jbnu.ac.kr -> ssh lionXX (gateway_shell)
YS Lion Agent: http://127.0.0.1:8765
```

그다음 영섭랜드 상단의 `샘플 데이터` 버튼을 눌러 다음 값을 입력합니다.

```text
Agent 주소: http://127.0.0.1:8765
접근 토큰: config.json의 api_token
```

## 보안 원칙

- Lion 비밀번호와 개인키를 웹페이지에 입력하지 않습니다.
- Agent는 기본적으로 `127.0.0.1`에서만 열립니다.
- 현재 버전은 계산 상태 확인만 수행합니다.
- 계산 제출, 종료, 파일 수정 명령은 실행하지 않습니다.
- `config.json`은 GitHub에 올리지 않습니다.

## 수집 정보

- SSH 접속 성공 여부
- 사용자 `skylark`의 Gaussian 프로세스
- Gaussian PID와 실행 시간
- 현재 작업 디렉터리
- 최근 `.out` 또는 `.log` 파일
- CPU, 메모리, 1분 load average
- 대기, 계산중, 완료, 확인필요 상태

GitHub Pages에서 로컬 Agent 요청이 브라우저 정책으로 차단되면 프로젝트 폴더에서 아래 명령으로 영섭랜드도 로컬 실행합니다.

```powershell
python -m http.server 8000
```

접속 주소는 `http://127.0.0.1:8000`입니다.
