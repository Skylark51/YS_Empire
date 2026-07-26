# YS Lion Agent

영섭랜드 GitHub Pages와 Lion 서버 사이에서 동작하는 **로컬 읽기 전용 브리지**입니다.

GitHub Pages는 정적 웹사이트이므로 브라우저에서 SSH를 직접 실행할 수 없습니다. 대신 사용자 PC에서 이 Agent를 실행하고, Agent가 SSH 키를 사용해 각 Lion 노드의 상태를 읽어 `http://127.0.0.1:8765`로 제공합니다.

## 보안 원칙

- 서버 비밀번호와 개인키를 웹페이지에 입력하지 않습니다.
- Agent는 기본적으로 `127.0.0.1`에서만 열립니다.
- `/api/status`는 Bearer 토큰이 있어야 접근할 수 있습니다.
- 현재 버전은 상태 확인만 수행하며 계산 제출·종료 명령은 실행하지 않습니다.
- SSH는 `BatchMode=yes`로 실행되어 자동 로그인 설정이 없는 서버는 `확인필요`로 표시됩니다.

## 1. SSH 키 만들기

Windows에서 `setup_ssh_key.bat`를 실행합니다. 이미 `%USERPROFILE%\.ssh\id_ed25519`가 있다면 기존 키를 그대로 사용합니다.

표시되는 공개키 한 줄을 Lion 로그인 서버의 다음 파일에 추가합니다.

```bash
~/.ssh/authorized_keys
```

권한도 확인합니다.

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

개인키인 `id_ed25519` 파일은 다른 사람에게 보내거나 GitHub에 올리면 안 됩니다.

## 2. SSH 별칭 설정

기존 minegau에서 `ssh lion51`처럼 접속된다면 그 설정을 그대로 재사용할 수 있습니다. Windows SSH 설정 파일은 보통 다음 위치입니다.

```text
%USERPROFILE%\.ssh\config
```

직접 접속하는 예시는 다음과 같습니다.

```sshconfig
Host lion51
    HostName 실제.lion51.주소
    User skylark
    IdentityFile ~/.ssh/id_ed25519
```

로그인 서버를 거쳐야 한다면 `ProxyJump`를 사용합니다.

```sshconfig
Host jbnu-login
    HostName 실제.로그인서버.주소
    User skylark
    IdentityFile ~/.ssh/id_ed25519

Host lion*
    User skylark
    IdentityFile ~/.ssh/id_ed25519
    ProxyJump jbnu-login
```

기관 VPN이 필요한 구조라면 VPN 연결은 계속 필요합니다.

자동 로그인 테스트:

```powershell
ssh -o BatchMode=yes lion51 hostname
```

비밀번호 입력 없이 호스트명이 출력되어야 Agent가 자동 수집할 수 있습니다.

## 3. Agent 설정

`run_agent.bat`를 처음 실행하면 `config.example.json`을 복사해 `config.json`을 만들고 메모장으로 엽니다.

반드시 다음 값을 변경합니다.

```json
"api_token": "충분히_긴_임의의_문자열"
```

실제로 사용하지 않는 노드는 `nodes` 목록에서 삭제할 수 있습니다. SSH 별칭이 minegau와 다르면 `ssh_alias`를 현재 설정에 맞게 수정합니다.

`config.json`은 `.gitignore` 대상이며 저장소에 올리지 않습니다.

## 4. 실행 및 영섭랜드 연결

1. `run_agent.bat`를 실행합니다.
2. 콘솔에 `YS Lion Agent: http://127.0.0.1:8765`가 표시되는지 확인합니다.
3. 영섭랜드 상단의 `샘플 데이터` 버튼을 누릅니다.
4. Agent 주소에 `http://127.0.0.1:8765`를 입력합니다.
5. `config.json`에 설정한 토큰을 입력하고 연결합니다.

연결되면 서버별로 다음 값이 갱신됩니다.

- SSH 접속 성공 여부
- Gaussian 프로세스와 PID
- 현재 작업 디렉터리
- 최근 수정된 `.out` 또는 `.log` 파일
- CPU 수, 메모리, 1분 load average
- Gaussian 정상 종료 여부
- 대기·계산중·완료·확인필요 상태

## 진행률 해석

Gaussian은 모든 계산 유형에 공통인 정확한 진행률 값을 제공하지 않습니다. 현재 Agent는 최적화 `Step number`와 정상 종료 문구를 바탕으로 대략적인 진행률을 표시합니다.

기존 minegau가 계산 종류별 진행률이나 예상 종료 시간을 별도로 계산한다면, 그 스크립트의 출력 형식을 Agent에 연결하는 편이 더 정확합니다.

## 연결이 차단될 때

GitHub Pages는 HTTPS이고 Agent는 로컬 HTTP이므로 브라우저 정책에 따라 localhost 요청이 차단될 수 있습니다. 이 경우 프로젝트 폴더에서 다음처럼 영섭랜드 자체를 로컬로 실행합니다.

```powershell
python -m http.server 8000
```

그 뒤 `http://127.0.0.1:8000`에서 접속하면 됩니다.
