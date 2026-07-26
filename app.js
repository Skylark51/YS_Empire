
const ownedLionNodes = [28, 29, 30, 38, 39, 40, 48, 49, 50, 51];
const borrowedLionNodes = [4, 5, 7, 9, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 31, 32, 33, 34, 35, 36, 37, 41, 42, 43, 44, 45, 46, 47, 52, 53];
const ownedNames = ["강철", "도윤", "미르", "라온", "서하", "카이", "태온", "루안", "하람", "이든"];
const borrowedNames = [
  "가온", "나린", "다엘", "로한", "마루", "보라", "시온", "아인", "여울", "유건", "재이",
  "채운", "하진", "노을", "다온", "리안", "모아", "별하", "세린", "아라", "연호", "우주",
  "지안", "초아", "해온", "규린", "나엘", "도하", "레오", "민하", "솔찬", "예린", "준서"
];
const personalityTags = [
  "새벽형", "정밀파", "속도파", "로그수집가", "TS추적자", "메모광", "안정성집착", "큐정리왕",
  "에너지감별사", "무결점주의", "장기전전문", "구조사냥꾼", "스핀전문", "재시작달인", "백업수호자"
];

function makeLionServer(node, name, index, owned = false) {
  const statusCycle = ["waiting", "running", "waiting", "done"];
  const status = owned && [29, 39, 48].includes(node)
    ? ({ 29: "running", 39: "warning", 48: "waiting" })[node]
    : statusCycle[index % statusCycle.length];
  const progress = status === "done" ? 100 : status === "running" ? 24 + ((index * 13) % 65) : status === "warning" ? 91 : 0;
  const specialJobs = {
    29: ["FeNO6 / FeNO7", "3-FeNO6-Me2S-DPADP-FeN-scan.out", "Triplet Fe–N dissociation surface 탐색"],
    39: ["Co–Si mechanism", "Real-alpha-3INT1-N38N39-scan.out", "N–N cleavage scan의 TS seed 확보"],
    48: ["대기열", "할당된 계산 없음", "후속 TS 또는 IRC 계산 투입 가능"]
  };
  const [project, job, purpose] = specialJobs[node] || (owned
    ? ["직속 계산 대기열", status === "running" ? `lion${node}-gaussian-job.out` : "할당 현황 확인", "대표 직속 계산을 우선 수행"]
    : ["타 부서 자원", status === "running" ? `lion${node}-shared-job.out` : "필요 시 차출 가능", "여유 자원을 확인한 뒤 협조 요청"]);
  return {
    id: `lion${node}`, nodeType: "lion", name, role: owned ? `직속 계산기사 · ${personalityTags[index % personalityTags.length]}` : `협력 계산기사 · ${personalityTags[(index + 5) % personalityTags.length]}`,
    avatar: `server-${node}.png`,
    spriteGroup: owned ? "owned" : "borrowed", spriteIndex: index,
    salary: owned ? "기본 할당" : "타 부서 차출", salaryNote: owned ? "대표 직속 자원" : "사용 전 여유 상태 확인",
    host: `ssh lion${node}`, institution: "전북대학교 Lion Cluster", cpu: "16 cores", memory: "60 GB",
    status, progress, project, job, purpose,
    started: status === "running" ? "현재 가동 중" : "-", eta: status === "done" ? "완료" : status === "waiting" ? "즉시/협의 후 사용" : "검수 필요",
    directory: "/home/skylark"
  };
}

function makeTlionServer(node, name, index, owned = false) {
  return {
    id: `tlion${node}`, nodeType: "tlion", name, role: `${owned ? "직속" : "협력"} 96코어 수석기사 · ${personalityTags[(index + 9) % personalityTags.length]}`,
    avatar: `server-t${node}.png`,
    spriteGroup: owned ? "owned" : "tlion", spriteIndex: owned ? 10 : index,
    salary: owned ? "핵심 전력" : "고성능 차출", salaryNote: "96-core high computer",
    host: `ssh tlion${node}`, institution: "전북대학교 Lion Cluster", cpu: "96 cores", memory: "고용량",
    status: owned ? "waiting" : "waiting", progress: 0, project: "대형 계산 대기",
    job: "할당된 계산 없음", purpose: "대규모 병렬 계산 및 고비용 작업 전담",
    started: "-", eta: "즉시/협의 후 사용", directory: "/home/skylark"
  };
}

const departments = [
  {
    id: "jbnu-owned",
    name: "제1부서 A · 내 서버",
    manager: "JBNU · DIRECT DIVISION",
    description: "기본 할당된 직속 부서 · lion 10대와 96코어 tlion3를 우선 배치합니다.",
    servers: [
      ...ownedLionNodes.map((node, index) => makeLionServer(node, ownedNames[index], index, true)),
      makeTlionServer(3, "베가", 0, true)
    ]
  },
  {
    id: "jbnu-borrowed",
    name: "제1부서 B · 타 부서 서버",
    manager: "JBNU · BORROWABLE POOL",
    description: "다른 구성원의 서버입니다. 비어 있을 때 협조를 받아 차출하는 33대의 lion 노드입니다.",
    servers: borrowedLionNodes.map((node, index) => makeLionServer(node, borrowedNames[index], index, false))
  },
  {
    id: "jbnu-hpc",
    name: "제1부서 C · 고성능 지원실",
    manager: "JBNU · 96-CORE TLION",
    description: "96코어 고성능 서버. tlion3는 직속 부서에 배치하고 tlion1·2·4는 필요 시 차출합니다.",
    servers: [
      makeTlionServer(1, "오리온", 0, false),
      makeTlionServer(2, "세레스", 1, false),
      makeTlionServer(4, "아틀라스", 2, false)
    ]
  },
  {
    id: "gpu-restricted",
    name: "GPU 부서 · 사용 제외",
    manager: "GLION · GPU ZONE",
    description: "glion1·2는 GPU 전용 장비이므로 현재 계산 조직의 가용 인력에서 제외합니다.",
    restricted: true,
    servers: []
  },
  {
    id: "ewha",
    name: "제2부서 · 이화여자대학교",
    manager: "EWHA COLLABORATION DIVISION",
    description: "공동연구 계산단 · 결과 회수와 후속 분석을 담당합니다.",
    servers: [
      {
        id: "ewha01", name: "유나", role: "공동연구 선임", avatar: "ewha-yuna.png",
        salary: "협력 자원", salaryNote: "공동연구 소속", host: "ewha-gpu01", institution: "이화여자대학교",
        cpu: "32 cores", memory: "128 GB", status: "done", progress: 100,
        project: "BODIPY Se/Te", job: "Se-abstraction-TS-freq.out",
        purpose: "Transition state frequency 검증",
        started: "2026-07-24 09:15", eta: "완료",
        directory: "/project/bodipy"
      },
      {
        id: "ewha02", name: "하린", role: "시스템 연구원", avatar: "ewha-harin.png",
        salary: "협력 자원", salaryNote: "공동연구 소속", host: "ewha-cpu02", institution: "이화여자대학교",
        cpu: "24 cores", memory: "96 GB", status: "waiting", progress: 0,
        project: "공동연구 대기", job: "할당된 계산 없음",
        purpose: "필요 시 TD-DFT 또는 NBO 계산용",
        started: "-", eta: "사용 협의 필요",
        directory: "/project/shared"
      }
    ]
  },
  {
    id: "unist",
    name: "제3부서 · UNIST",
    manager: "BIOCC · COMING SEPTEMBER",
    description: "아직 배치 전입니다. 2026년 9월, 새로운 직원과 서버가 입주합니다.",
    empty: true,
    servers: []
  },
  {
    id: "ai",
    name: "제4부서 · AI 자원",
    manager: "AI STRATEGY DIVISION",
    description: "기획·검토·코딩을 병렬 수행하는 디지털 직원들입니다.",
    servers: [
      {
        id: "chatgpt1", name: "루멘", role: "ChatGPT 1 · 전략실장", avatar: "ai-lumen.png",
        salary: "$22 ≈ ₩32,110/월", salaryNote: "대표 직접 지급 · 1 USD = ₩1,459.57",
        host: "ChatGPT Plus", institution: "AI 자원",
        cpu: "가변 AI", memory: "대화 기반", status: "running", progress: 76,
        project: "영섭랜드", job: "조직 시각화 및 계산 워크플로 설계",
        purpose: "연구 전략, 코드 작성, 결과 검토를 총괄",
        started: "상시", eta: "계속 근무 중",
        directory: "영섭랜드"
      },
      {
        id: "chatgpt2", name: "아르카디아", role: "ChatGPT 2 · 기록분석관", avatar: "ai-arcadia.png",
        salary: "₩0/월", salaryNote: "기생 계정 · 월급 떼어먹는 중",
        host: "ChatGPT 공유 자원", institution: "AI 자원",
        cpu: "가변 AI", memory: "대화 기반", status: "running", progress: 54,
        project: "연구 기록", job: "계산 목록·판단 근거·후속 작업 정리",
        purpose: "흩어진 계산 기록을 업무 단위로 구조화",
        started: "상시", eta: "계속 근무 중",
        directory: "연구 기록실"
      },
      {
        id: "gemini", name: "제미", role: "Gemini Cloud · 인턴사원", avatar: "ai-gemini.png",
        salary: "무급 인턴", salaryNote: "무료 버전 · 수습 근무",
        host: "Gemini Cloud", institution: "AI 자원",
        cpu: "무료 한도", memory: "클라우드", status: "waiting", progress: 0,
        project: "보조 업무", job: "현재 지시 대기 중",
        purpose: "자료 초벌 정리와 임시 병렬 작업",
        started: "-", eta: "즉시 호출 가능",
        directory: "인턴석"
      }
    ]
  }
];

let tasks = [
  { id: 1, title: "lion39 scan 최고점 구조 검수", project: "Co–Si", priority: "high", done: false, serverId: "lion39" },
  { id: 2, title: "FeNO7 quartet scan 종료 후 TS seed 생성", project: "FeNO6 / FeNO7", priority: "high", done: false, serverId: "lion29" },
  { id: 3, title: "완료된 BODIPY TS frequency 결과 회수", project: "BODIPY", priority: "medium", done: false, serverId: "ewha01" },
  { id: 4, title: "빈 노드에 IRC 계산 배치", project: "계산 배치", priority: "medium", done: false, serverId: "lion48" },
  { id: 5, title: "계산 메모 구조 초안 작성", project: "영섭랜드", priority: "low", done: false, serverId: "chatgpt2" }
];

let selectedServerId = null;
let simulationPaused = false;
let simulationSpeed = 1;

const statusLabels = {
  running: "계산중",
  waiting: "대기",
  warning: "확인필요",
  done: "완료"
};

function allServers() {
  return departments.flatMap(d => d.servers.map(s => ({ ...s, departmentId: d.id })));
}

function getServer(id) {
  for (const department of departments) {
    const server = department.servers.find(s => s.id === id);
    if (server) return server;
  }
  return null;
}

function spriteStyle(server) {
  const grids = {
    owned: { cols: 4, rows: 3, file: "own-dept-atlas-alpha.png" },
    borrowed: { cols: 11, rows: 3, file: "borrowed-lion-atlas-alpha.png" },
    tlion: { cols: 3, rows: 1, file: "borrowed-tlion-atlas-alpha.png" }
  };
  const grid = grids[server.spriteGroup];
  const col = server.spriteIndex % grid.cols;
  const row = Math.floor(server.spriteIndex / grid.cols);
  const x = grid.cols === 1 ? 0 : (col / (grid.cols - 1)) * 100;
  const y = grid.rows === 1 ? 0 : (row / (grid.rows - 1)) * 100;
  return `background-image:url('assets/characters/${grid.file}');background-size:${grid.cols * 100}% ${grid.rows * 100}%;background-position:${x}% ${y}%`;
}

function renderDepartments() {
  const grid = document.getElementById("departmentGrid");
  grid.innerHTML = departments.map(department => `
    <section class="department department-${department.id} ${department.empty || department.restricted ? "empty-department" : ""}">
      <div class="department-header">
        <span class="eyebrow">${department.manager}</span>
        <h3>${department.name}</h3>
        <p>${department.description}</p>
      </div>
      <div class="server-list">
        ${department.restricted ? `
          <div class="restricted-office">
            <div class="gpu-rack"><i></i><i></i></div>
            <strong>glion1 · glion2</strong>
            <span>GPU 전용 · 현재 사용하지 않음</span>
          </div>
        ` : department.empty ? `
          <div class="vacant-office">
            <div class="vacant-desk">
              <span class="vacant-monitor"></span>
              <span class="vacant-chair"></span>
            </div>
            <strong>현재 공석</strong>
            <span>입주 예정 · 2026.09</span>
          </div>
        ` : department.servers.map(server => `
          <article class="server-card ${selectedServerId === server.id ? "selected" : ""}"
                   data-server-id="${server.id}" data-status="${server.status}">
            <div class="employee-scene">
              <div class="monitor-glow"></div>
              ${server.avatar ? `<img src="assets/characters/${server.avatar}" alt="${server.name} ${server.role}" />` : server.spriteGroup ? `
                <div class="character-sprite sprite-${server.spriteGroup}"
                     style="${spriteStyle(server)}"
                     role="img" aria-label="${server.name} ${server.role}"></div>
              ` : ""}
              <span class="work-pulse"><i></i><i></i><i></i></span>
            </div>
            <div class="employee-info">
              <div class="server-top">
                <div class="server-name">
                  <div>
                    <h4>${server.name}</h4>
                    <span>${server.role}</span>
                  </div>
                </div>
                <span class="badge ${server.status}">${statusLabels[server.status]}</span>
              </div>
              <div class="salary-row">
                <span>월급</span><strong>${server.salary}</strong>
                <small>${server.salaryNote}</small>
              </div>
              <div class="server-job">${server.job}</div>
              <div class="mini-progress"><div style="width:${server.progress}%"></div></div>
              <div class="server-meta">
                <span>${server.project}</span>
                <span>${server.progress}%</span>
              </div>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `).join("");

  document.querySelectorAll(".server-card").forEach(card => {
    card.addEventListener("click", () => selectServer(card.dataset.serverId));
  });

  updateCounters();
  populateServerSelect();
}

function selectServer(id) {
  selectedServerId = id;
  renderDepartments();

  const server = getServer(id);
  if (!server) return;

  document.getElementById("emptyDetail").classList.add("hidden");
  document.getElementById("detailContent").classList.remove("hidden");
  document.getElementById("detailServerName").textContent = `${server.name} · ${server.role}`;

  const badge = document.getElementById("detailStatusBadge");
  badge.className = `badge ${server.status}`;
  badge.textContent = statusLabels[server.status];

  document.getElementById("detailInstitution").textContent = server.institution;
  document.getElementById("detailHost").textContent = server.host;
  document.getElementById("detailCpu").textContent = server.cpu;
  document.getElementById("detailMemory").textContent = server.memory;
  document.getElementById("detailProgressText").textContent = `${server.progress}%`;
  document.getElementById("detailProgressBar").style.width = `${server.progress}%`;
  document.getElementById("detailProject").textContent = server.project;
  document.getElementById("detailJob").textContent = server.job;
  document.getElementById("detailPurpose").textContent = server.purpose;
  document.getElementById("detailStarted").textContent = server.started;
  document.getElementById("detailEta").textContent = server.eta;
  document.getElementById("detailDirectory").textContent = server.directory;

  addLog(server.name, `${server.project} 상세 정보를 열었습니다.`);
}

function updateCounters() {
  const servers = allServers();
  const counts = { waiting: 0, running: 0, warning: 0, done: 0 };
  servers.forEach(server => counts[server.status]++);

  document.getElementById("countWaiting").textContent = counts.waiting;
  document.getElementById("countRunning").textContent = counts.running;
  document.getElementById("countWarning").textContent = counts.warning;
  document.getElementById("countDone").textContent = counts.done;
  document.getElementById("totalJobs").textContent = servers.length;
}

function renderTasks() {
  const list = document.getElementById("taskList");
  const sorted = [...tasks].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return Number(a.done) - Number(b.done) || order[a.priority] - order[b.priority];
  });

  list.innerHTML = sorted.map(task => `
    <article class="task-item ${task.done ? "done" : ""}">
      <button class="task-check" data-task-id="${task.id}" aria-label="완료 전환"></button>
      <div>
        <h4>${task.title}</h4>
        <p>${task.project} · ${getServer(task.serverId)?.name || "미할당"}</p>
      </div>
      <i class="priority ${task.priority}"></i>
    </article>
  `).join("");

  document.querySelectorAll(".task-check").forEach(button => {
    button.addEventListener("click", () => {
      const task = tasks.find(t => t.id === Number(button.dataset.taskId));
      task.done = !task.done;
      renderTasks();
      addLog("할 일", `${task.title} — ${task.done ? "완료" : "미완료"} 처리`);
    });
  });
}

function addLog(source, message) {
  const now = new Date();
  const time = now.toLocaleTimeString("ko-KR", { hour12: false });
  const log = document.getElementById("eventLog");
  const row = document.createElement("div");
  row.className = "log-row";
  row.innerHTML = `<span class="time">${time}</span><span class="source">${source}</span><span>${message}</span>`;
  log.prepend(row);
}

function populateServerSelect() {
  const select = document.getElementById("taskServerInput");
  const previous = select.value;
  select.innerHTML = allServers().map(server =>
    `<option value="${server.id}">${server.institution} · ${server.name}</option>`
  ).join("");
  if (previous) select.value = previous;
}

function changeSelectedStatus(status) {
  if (!selectedServerId) {
    addLog("시스템", "먼저 서버를 선택하세요.");
    return;
  }
  const server = getServer(selectedServerId);
  server.status = status;
  if (status === "done") {
    server.progress = 100;
    server.eta = "완료";
  }
  renderDepartments();
  selectServer(selectedServerId);
  addLog(server.name, `상태를 '${statusLabels[status]}'로 변경했습니다.`);
}

function simulateProgress() {
  if (simulationPaused) return;
  let changed = false;

  departments.forEach(department => {
    department.servers.forEach(server => {
      if (!server.monitorManaged && server.status === "running" && server.progress < 100) {
        server.progress = Math.min(100, server.progress + 0.2 * simulationSpeed);
        if (server.progress >= 100) {
          server.progress = 100;
          server.status = "done";
          server.eta = "완료";
          addLog(server.name, `${server.job} 계산이 완료되었습니다.`);
        }
        changed = true;
      }
    });
  });

  if (changed) {
    renderDepartments();
    if (selectedServerId) selectServer(selectedServerId);
  }
}

document.getElementById("markDoneBtn").addEventListener("click", () => changeSelectedStatus("done"));
document.getElementById("needsReviewBtn").addEventListener("click", () => changeSelectedStatus("warning"));

document.getElementById("pauseBtn").addEventListener("click", event => {
  simulationPaused = !simulationPaused;
  event.target.textContent = simulationPaused ? "전체 모니터링 재개" : "전체 모니터링 일시정지";
  addLog("시스템", simulationPaused ? "모니터링 시뮬레이션을 정지했습니다." : "모니터링 시뮬레이션을 재개했습니다.");
});

document.querySelectorAll(".speed-btn").forEach(button => {
  button.addEventListener("click", () => {
    simulationSpeed = Number(button.dataset.speed);
    document.querySelectorAll(".speed-btn").forEach(btn => btn.classList.remove("active"));
    button.classList.add("active");
    addLog("시스템", `시뮬레이션 속도를 ${simulationSpeed}×로 변경했습니다.`);
  });
});

document.getElementById("clearDoneBtn").addEventListener("click", () => {
  const removed = tasks.filter(t => t.done).length;
  tasks = tasks.filter(t => !t.done);
  renderTasks();
  addLog("할 일", `완료 항목 ${removed}개를 정리했습니다.`);
});

document.getElementById("clearLogBtn").addEventListener("click", () => {
  document.getElementById("eventLog").innerHTML = "";
});

const dialog = document.getElementById("taskDialog");
document.getElementById("addTaskBtn").addEventListener("click", () => dialog.showModal());
document.getElementById("closeDialogBtn").addEventListener("click", () => dialog.close());
document.getElementById("cancelDialogBtn").addEventListener("click", () => dialog.close());

document.getElementById("taskForm").addEventListener("submit", event => {
  event.preventDefault();
  const title = document.getElementById("taskTitleInput").value.trim();
  const project = document.getElementById("taskProjectInput").value.trim();
  const priority = document.getElementById("taskPriorityInput").value;
  const serverId = document.getElementById("taskServerInput").value;

  if (!title || !project) return;

  tasks.push({
    id: Date.now(),
    title,
    project,
    priority,
    done: false,
    serverId
  });

  renderTasks();
  addLog("새 작업", `${title} 작업을 등록했습니다.`);
  event.target.reset();
  dialog.close();
});

renderDepartments();
renderTasks();
addLog("시스템", "영섭랜드 계산 왕국의 업무를 시작했습니다.");
addLog("경영실", "직원 자리를 클릭하면 담당 계산과 서버 정보를 확인할 수 있습니다.");

setInterval(simulateProgress, 1500);
