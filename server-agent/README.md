# YS Empire Server Agent

`server-agent`는 Windows에서 `lion.jbnu.ac.kr` 게이트웨이를 거쳐 지정 Lion 노드의 시스템 상태와 Gaussian 계산 상태를 읽는 로컬 전용 백엔드입니다. 원격 명령은 조회만 수행하며 프로세스·계산·파일을 변경하지 않습니다.

## 실행

1. 기존 `config.json`을 그대로 사용합니다. 이 구현은 해당 파일을 읽기만 합니다.
2. 프로젝트의 `server-agent` 폴더에서 `run_agent.bat`을 실행합니다.
3. 기본 주소는 `http://127.0.0.1:8765`입니다.

직접 실행:

```powershell
py gateway_agent.py
```

현재 연결 경로:

```text
Windows → ssh lion.jbnu.ac.kr → ssh lionXX → bash -s
```

`gateway_agent.py`가 기존 `gateway_shell` 경로를 유지합니다. 수집기는 게이트웨이 여부와 무관하게 각 노드 별칭을 대상으로 읽기 전용 스크립트를 전달합니다.

## API

### `GET /api/status`

요청 헤더:

```http
Authorization: Bearer <config.json의 api_token>
```

응답의 최상위 구조:

```json
{
  "schema_version": "2.0",
  "generated_at": "2026-07-26T12:00:00+09:00",
  "source": {
    "connection_mode": "gateway_shell",
    "gateway": "lion.jbnu.ac.kr",
    "live": true
  },
  "summary": {
    "nodes_total": 11,
    "online": 10,
    "offline": 1,
    "running": 2,
    "finished": 1,
    "failed": 0,
    "idle": 7
  },
  "nodes": []
}
```

각 `nodes[]`는 다음 상세 구조를 가집니다.

```json
{
  "id": "lion28",
  "ssh_alias": "lion28",
  "online": true,
  "state": "running",
  "system": {
    "hostname": "lion28",
    "uptime_seconds": 86400,
    "load_average": {"one": 1.1, "five": 0.9, "fifteen": 0.7},
    "cpu": {"usage_percent": 42.5, "cores": 16},
    "memory": {
      "total_bytes": 68719476736,
      "used_bytes": 34359738368,
      "available_bytes": 34359738368,
      "used_percent": 50.0
    },
    "swap": {
      "total_bytes": 8589934592,
      "used_bytes": 0,
      "free_bytes": 8589934592,
      "used_percent": 0.0
    },
    "disk": {
      "path": "/",
      "total_bytes": 1000000000,
      "used_bytes": 250000000,
      "available_bytes": 750000000,
      "used_percent": 25.0
    },
    "scratch": null
  },
  "gaussian": {
    "detected": true,
    "status": "running",
    "pid": 12345,
    "user": "skylark",
    "started_at": "2026-07-26T10:00:00+09:00",
    "elapsed_seconds": 7200,
    "input_name": "job.gjf",
    "input_file": "/work/job.gjf",
    "checkpoint_file": "/work/job.chk",
    "output_file": "/work/job.out",
    "working_directory": "/work",
    "stage": "optimization",
    "last_energy_hartree": -123.456789,
    "normal_termination": false,
    "error_termination": false,
    "output_size_bytes": 1234567
  },
  "note": null,
  "checked_at": "2026-07-26T12:00:00+09:00",
  "latency_ms": 380,
  "error": null
}
```

`state`는 `running`, `finished`, `failed`, `idle`, `offline` 중 하나입니다. Gaussian `stage`는 `startup`, `scf`, `optimization`, `frequency`, `scan`, `transition_state`, `irc`, `completed`, `error`, `unknown` 중 하나 또는 `null`입니다.

기존 `live.js`를 수정하지 않기 위해 각 노드에는 `status`, `progress`, `job`, `directory`, `started`, `eta`, `cpu`, `memory`, `load1`, `pid` 호환 필드도 함께 반환됩니다.

## 수집 방식

- 시스템: `/proc/uptime`, `/proc/loadavg`, `/proc/stat`, `/proc/meminfo`, `df`
- CPU 사용률: `/proc/stat`을 0.20초 간격으로 두 번 읽은 실제 구간 사용률
- Gaussian: `ps`에서 `g16`/`g09` 드라이버를 우선 찾고 link 프로세스를 보조 사용
- 경로: `/proc/<pid>/cwd`, 표준 입출력 fd, 실행 인자, 입력 파일 `%chk`
- 단계 및 종료: 출력 파일의 마지막 최대 512 KiB에서 SCF/Opt/Freq/IRC/종료 표식 판정
- 에너지: 마지막 `SCF Done`, `EUMP2`, `CCSD(T)` 값

큰 출력 파일 전체를 반복해서 읽지 않습니다. 프로세스가 사라진 다음에는 `cache.json`에 기록된 마지막 output만 다시 확인하여 Normal/Error termination을 확정합니다.

## 로컬 영구 데이터

모든 파일은 `server-agent/data/`에 있습니다.

- `cache.json`: 마지막 전체 스냅샷 및 마지막 계산
- `history.json`: `finished` 또는 `failed`로 전환된 계산의 중복 없는 종료 기록
- `notes.json`: 사용자 메모

메모 예시:

```json
{
  "schema_version": "1.0",
  "updated_at": "2026-07-26T12:00:00+09:00",
  "notes": {
    "lion28": {
      "text": "촉매 최적화 계산 전용",
      "updated_at": "2026-07-26T12:00:00+09:00"
    }
  }
}
```

파일 저장은 임시 파일을 같은 폴더에 쓴 뒤 교체합니다. 손상된 JSON 하나는 기본 빈 구조로 격리되며 수집 전체를 중단하지 않습니다.

## 선택 설정

현재 `config.json`을 수정하지 않아도 기본값으로 동작합니다. 필요할 때만 다음 키를 직접 추가할 수 있습니다.

```json
{
  "max_parallel_nodes": 6,
  "gaussian_tail_bytes": 524288,
  "history_limit": 2000
}
```

`gaussian_tail_bytes`는 코드에서 64 KiB 이상, 2 MiB 이하로 제한됩니다.

## 테스트

```powershell
py -m unittest discover -s tests -v
py -m py_compile agent.py collector.py node_collector.py storage.py gateway_agent.py
```

테스트는 상태 파싱, 종료 판정, null 계약, 읽기 전용 스크립트, 이력 중복 방지, 노드 장애 격리를 확인합니다.
