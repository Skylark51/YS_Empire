# 영섭랜드 계산 왕국 — 픽셀 오피스 v1.01

Gaussian 계산 서버와 AI 자원을 실제 직원이 일하는 픽셀 사무실처럼 시각화한 오프라인 웹 대시보드입니다.

## 현재 포함된 기능

- 이영섭 대표와 서버마다 서로 다른 픽셀 직원
- 직속 부서: lion28, 29, 30, 38, 39, 40, 48, 49, 50, 51 및 96코어 tlion3
- 타 부서 차출 자원: 나머지 lion 33대
- 고성능 지원실: 96코어 tlion1, tlion2, tlion4
- GPU 사용 제외 구역: glion1, glion2
- 전북대학교 / 이화여자대학교 / UNIST / AI 자원 부서
- UNIST 부서는 현재 공석으로 표시
- ChatGPT 1·2와 Gemini Cloud 인턴의 이름·직급·월급 표시
- 서버별 계산 상태, CPU, 메모리, 프로젝트, 파일명, 진행률 표시
- 직원 자리 클릭 시 우측 서버·계산 상세 패널 표시
- 완료 처리 및 검수 필요 표시
- 연구 할 일 우선순위 큐
- 새 계산 작업 등록
- 이벤트 로그
- 계산 진행률 시뮬레이션
- 반응형 화면

## 실행 방법

### 가장 간단한 방법

`index.html` 파일을 Chrome 또는 Edge로 열면 됩니다.

### 로컬 서버 방식

Python이 설치되어 있다면 이 폴더에서 다음을 실행합니다.

```bash
python -m http.server 8000
```

브라우저에서 다음 주소를 엽니다.

```text
http://localhost:8000
```

Windows에서는 `실행.bat`를 더블클릭해도 됩니다.

## 데이터 수정 위치

현재 샘플 서버와 계산 정보는 `app.js` 상단의 노드 목록과 생성 함수에 있습니다. 화면의 진행 상태는 아직 Ganglia 실시간 값이 아닌 샘플/수동 상태입니다.

예:

```javascript
{
  id: "lion29",
  name: "도윤",
  role: "선임 계산기사",
  avatar: "jbnu-doyun.png",
  salary: "서버 자원",
  host: "ssh lion29",
  institution: "전북대학교",
  cpu: "16 cores",
  memory: "60 GB",
  status: "running",
  progress: 68,
  project: "FeNO6 / FeNO7",
  job: "3-FeNO6-...out"
}
```

## 다음 개발 단계

1. 서버 SSH 접속 및 실제 상태 수집
2. `ps`, `top`, Gaussian output tail 기반 실제 진행률 계산
3. Ganglia 또는 Slurm/PBS 데이터 연동
4. 계산 제출용 run script 생성
5. Gaussian Evidence Extractor 결과 연동
6. SQLite 기반 프로젝트·서버·계산 이력 저장
7. 알림 기능
8. 데스크톱 EXE 패키징

이 버전은 화면 구성과 사용자 흐름을 확인하기 위한 프론트엔드 프로토타입입니다.
