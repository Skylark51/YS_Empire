(() => {
  'use strict';

  const GAME_STATES = Object.freeze(['idle', 'running', 'high-load', 'finished', 'failed', 'offline']);
  const STATE_LABELS = Object.freeze({
    idle: '대기',
    running: '계산 중',
    'high-load': '고부하',
    finished: '계산 완료',
    failed: '계산 실패',
    offline: '오프라인'
  });
  const STATE_ICONS = Object.freeze({
    idle: 'Z',
    running: '⌨',
    'high-load': '»',
    finished: '!',
    failed: '×',
    offline: '·'
  });

  let latestSnapshot = { nodes: [] };
  let latestNodes = new Map();
  let installed = false;

  const asNumber = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const parsed = Number.parseFloat(value.replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  function jobOf(node) {
    return node && node.job && typeof node.job === 'object' ? node.job : {};
  }

  function metricsOf(node) {
    return node && node.metrics && typeof node.metrics === 'object' ? node.metrics : {};
  }

  function deriveGameState(node = {}, server = {}) {
    const raw = String(node.state || node.status || server.liveStatus || server.status || 'idle').toLowerCase().replace(/_/g, '-');
    const job = jobOf(node);
    if (job.error_termination === true || ['failed', 'error'].includes(raw)) return 'failed';
    if (job.normal_termination === true || ['finished', 'completed', 'done'].includes(raw)) return 'finished';
    if (node.reachable === false || ['offline', 'unreachable', 'unknown'].includes(raw)) return 'offline';

    const metrics = metricsOf(node);
    const cpu = asNumber(metrics.cpu_percent ?? node.cpu_percent ?? node.cpu);
    const load1 = asNumber(metrics.load_1 ?? node.load1 ?? node.load_1);
    const coreMatch = String(server.cpu || '').match(/\d+/);
    const cores = coreMatch ? Number(coreMatch[0]) : 16;
    const highLoad = ['high-load', 'highload'].includes(raw) || cpu >= 85 || load1 >= Math.max(4, cores * 0.75);
    if (highLoad && ['running', 'busy', 'high-load', 'highload'].includes(raw)) return 'high-load';
    if (['running', 'busy'].includes(raw) || job.detected === true) return 'running';
    if (['warning'].includes(raw) || node.error) return 'failed';
    return 'idle';
  }

  function getNodeId(node) {
    return String(node?.id || node?.host || '').replace(/^ssh\s+/, '').trim();
  }

  function findNode(id) {
    return latestNodes.get(id) || (typeof getServer === 'function' ? getServer(id)?.liveNode : null) || null;
  }

  function getMemo(node, id) {
    const direct = node?.memo ?? node?.note ?? node?.annotation?.memo;
    if (typeof direct === 'string') return direct.trim();
    const memoMap = latestSnapshot?.memos;
    const mapped = memoMap && typeof memoMap === 'object' ? memoMap[id] : '';
    if (typeof mapped === 'string') return mapped.trim();
    if (mapped && typeof mapped.memo === 'string') return mapped.memo.trim();
    return '';
  }

  function formatPercent(value) {
    const number = asNumber(value);
    return number === null ? (value || '-') : `${Math.round(number * 10) / 10}%`;
  }

  function formatElapsed(value) {
    const seconds = asNumber(value);
    if (seconds === null || seconds < 0) return '-';
    const total = Math.floor(seconds);
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return [days ? `${days}일` : '', hours ? `${hours}시간` : '', minutes ? `${minutes}분` : '', (!days && !hours) ? `${secs}초` : ''].filter(Boolean).join(' ');
  }

  function formatDate(value) {
    if (!value || value === '-') return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('ko-KR', { hour12: false });
  }

  function valueOrDash(...values) {
    const found = values.find(value => value !== undefined && value !== null && value !== '');
    return found === undefined ? '-' : String(found);
  }

  function detailModel(node = {}, server = {}) {
    const job = jobOf(node);
    const metrics = metricsOf(node);
    const stringJob = typeof node.job === 'string' ? node.job : '';
    const calculation = valueOrDash(job.name, job.current_calculation, node.current_calculation, stringJob, server.job);
    const input = valueOrDash(job.input_file, node.input_file, node.input);
    const output = valueOrDash(job.output_file, node.output_file, node.output, stringJob);
    const directory = valueOrDash(job.working_directory, node.working_directory, node.directory, server.directory);
    const cpu = formatPercent(metrics.cpu_percent ?? node.cpu_percent ?? node.cpu ?? server.cpu);
    const memory = formatPercent(metrics.memory_percent ?? node.memory_percent ?? node.memory ?? server.memory);
    const load1 = valueOrDash(metrics.load_1, node.load_1, node.load1);
    const load5 = valueOrDash(metrics.load_5, node.load_5, node.load5);
    const load15 = valueOrDash(metrics.load_15, node.load_15, node.load15);
    const started = formatDate(job.started_at ?? node.started_at ?? node.started ?? server.started);
    const elapsed = formatElapsed(job.elapsed_seconds ?? node.elapsed_seconds);
    const termination = job.error_termination === true ? '오류 종료' : job.normal_termination === true ? '정상 종료' : deriveGameState(node, server) === 'running' || deriveGameState(node, server) === 'high-load' ? '실행 중' : '종료 정보 없음';
    return { calculation, input, output, directory, cpu, memory, load: `${load1} / ${load5} / ${load15}`, started, elapsed, termination };
  }

  function ensureOrgTree() {
    if (document.getElementById('serverOrgTree')) return;
    const workspace = document.querySelector('.workspace');
    if (!workspace) return;
    const nav = document.createElement('nav');
    nav.id = 'serverOrgTree';
    nav.className = 'server-org-tree pixel-panel';
    nav.setAttribute('aria-label', '서버 조직도');
    nav.innerHTML = `
      <div class="org-tree-heading"><span class="eyebrow">SERVER KINGDOM</span><h2>서버 조직도</h2></div>
      <section class="org-tree-group"><button class="org-tree-group-title" type="button" aria-expanded="true"><span>◆</span> JBNU</button><div id="jbnuOrgNodes" class="org-tree-nodes"></div></section>
      <section class="org-tree-group future"><button class="org-tree-group-title" type="button" aria-expanded="false"><span>◇</span> UNIST</button><p>추후 서버 추가 예정</p></section>`;
    workspace.insertBefore(nav, workspace.firstElementChild);
    nav.querySelectorAll('.org-tree-group-title').forEach(button => {
      button.addEventListener('click', () => {
        const group = button.closest('.org-tree-group');
        const collapsed = group.classList.toggle('collapsed');
        button.setAttribute('aria-expanded', String(!collapsed));
      });
    });
  }

  function lionServers() {
    if (typeof departments === 'undefined') return [];
    return departments.flatMap(department => department.servers || []).filter(server => /^(?:t?lion)\d+$/i.test(server.id));
  }

  function updateOrgTree() {
    ensureOrgTree();
    const list = document.getElementById('jbnuOrgNodes');
    if (!list) return;
    const servers = lionServers();
    const signature = servers.map(server => server.id).join('|');
    if (list.dataset.signature !== signature) {
      list.textContent = '';
      for (const server of servers) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'org-node-button';
        button.dataset.serverId = server.id;
        button.innerHTML = '<i aria-hidden="true"></i><span></span><small></small>';
        button.querySelector('span').textContent = server.id;
        button.querySelector('small').textContent = server.name;
        button.addEventListener('click', () => {
          selectServer(server.id);
          requestAnimationFrame(() => document.querySelector(`.server-card[data-server-id="${server.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        });
        list.appendChild(button);
      }
      list.dataset.signature = signature;
    }
    for (const server of servers) {
      const node = findNode(server.id) || {};
      const state = deriveGameState(node, server);
      const button = list.querySelector(`[data-server-id="${server.id}"]`);
      if (!button) continue;
      button.dataset.gameState = state;
      button.classList.toggle('selected', typeof selectedServerId !== 'undefined' && selectedServerId === server.id);
      button.title = `${server.id} · ${STATE_LABELS[state]}`;
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function npcSpriteMarkup(server) {
    if (server.avatar) {
      return `<img src="assets/characters/${escapeHtml(server.avatar)}" alt="${escapeHtml(server.name)} ${escapeHtml(server.role)}" />`;
    }
    if (server.spriteGroup && typeof spriteStyle === 'function') {
      return `<span class="character-sprite sprite-${escapeHtml(server.spriteGroup)}" style="${spriteStyle(server)}" role="img" aria-label="${escapeHtml(server.name)} ${escapeHtml(server.role)}"></span>`;
    }
    return '<span class="npc-fallback" aria-hidden="true">?</span>';
  }

  function npcMarkup(server) {
    const selected = typeof selectedServerId !== 'undefined' && selectedServerId === server.id;
    return `
      <button class="server-card office-npc ${selected ? 'selected' : ''}" type="button"
              data-server-id="${escapeHtml(server.id)}" data-status="${escapeHtml(server.status)}"
              aria-label="${escapeHtml(server.id)} ${escapeHtml(server.name)} 서버 정보 열기">
        <span class="npc-floor-ring" aria-hidden="true"></span>
        <span class="npc-workstation" aria-hidden="true"><i class="npc-monitor"></i><i class="npc-keyboard"></i><i class="npc-chair"></i></span>
        <span class="employee-scene npc-scene">
          <span class="monitor-glow"></span>
          ${npcSpriteMarkup(server)}
          <span class="work-pulse"><i></i><i></i><i></i></span>
        </span>
        <span class="npc-nameplate"><strong>${escapeHtml(server.id)}</strong><small>${escapeHtml(server.name)}</small></span>
        <span class="npc-state-label">${escapeHtml(STATE_LABELS[deriveGameState(server.liveNode || {}, server)])}</span>
      </button>`;
  }

  function zoneBody(department) {
    if (department.restricted) {
      return `<div class="map-equipment-bay"><span class="map-server-rack"><i></i><i></i><i></i></span><strong>glion1 · glion2</strong><small>GPU 장비 구역 · 직원 미배치</small></div>`;
    }
    if (department.empty) {
      return `<div class="map-future-bay"><span class="future-desk-row"><i></i><i></i><i></i></span><strong>UNIST 확장 구역</strong><small>추후 직원과 서버 배치 예정</small></div>`;
    }
    return `<div class="office-npc-grid">${department.servers.map(npcMarkup).join('')}</div>`;
  }

  function zoneMarkup(department) {
    return `
      <section class="department department-${escapeHtml(department.id)} office-zone zone-${escapeHtml(department.id)}" data-zone="${escapeHtml(department.id)}">
        <header class="office-zone-sign"><span>${escapeHtml(department.manager)}</span><strong>${escapeHtml(department.name)}</strong></header>
        ${zoneBody(department)}
      </section>`;
  }

  function selectNpc(id) {
    const panel = document.querySelector('.org-map-panel');
    const scrollLeft = panel?.scrollLeft || 0;
    const scrollTop = panel?.scrollTop || 0;
    selectServer(id);
    requestAnimationFrame(() => {
      if (panel) panel.scrollTo({ left: scrollLeft, top: scrollTop, behavior: 'auto' });
      document.querySelector(`.office-npc[data-server-id="${id}"]`)?.focus({ preventScroll: true });
    });
  }

  function configureOfficePresentation() {
    document.body.classList.add('office-map-mode');
    const heading = document.querySelector('.org-map-panel .panel-heading h2');
    const description = document.querySelector('.org-map-panel .panel-heading p');
    const empty = document.getElementById('emptyDetail');
    if (heading) heading.textContent = 'Lion 중앙 관제 오피스';
    if (description) description.textContent = '중앙 맵의 직원 NPC를 클릭하면 담당 서버와 현재 계산이 오른쪽에 표시됩니다.';
    if (empty) empty.textContent = '맵에서 직원 NPC를 클릭하면 서버와 계산 상세 정보가 표시됩니다.';
  }

  function renderOfficeMap() {
    const grid = document.getElementById('departmentGrid');
    if (!grid || grid.querySelector('.pixel-office-world')) return;
    const serverCount = typeof allServers === 'function' ? allServers().length : lionServers().length;
    grid.classList.add('office-map-grid');
    grid.innerHTML = `
      <div class="pixel-office-world" aria-label="영섭랜드 서버 관제 오피스 맵">
        <div class="office-wall-grid" aria-hidden="true"></div>
        <section class="command-deck" aria-label="이영섭 대표 관제석">
          <div class="command-lights" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="boss-command-scene">
            <span class="boss-watch-cone" aria-hidden="true"></span>
            <img src="assets/characters/ceo-youngseop.png" alt="직원들의 계산 업무를 감독하는 이영섭 대표" />
            <span class="boss-console" aria-hidden="true"><i></i><i></i><i></i></span>
          </div>
          <div class="command-copy"><span class="eyebrow">OWNER COMMAND DECK</span><h3>이영섭 대표 관제석</h3><p>직원 배치 · 계산 진행 감시 · 결과 검수</p></div>
          <div class="command-count"><strong>${serverCount}</strong><span>관제 좌석</span></div>
        </section>
        <div class="office-corridor main-corridor" aria-hidden="true"><span>CONTROL FLOOR 01</span></div>
        <div class="office-zone-layout">${departments.map(zoneMarkup).join('')}</div>
      </div>`;
    grid.querySelectorAll('.office-npc').forEach(npc => npc.addEventListener('click', () => selectNpc(npc.dataset.serverId)));
  }

  function ensureCardLayers(card) {
    const scene = card.querySelector('.employee-scene');
    if (!scene) return;
    if (!scene.querySelector('.game-action-layer')) {
      scene.insertAdjacentHTML('beforeend', `
        <span class="game-state-icon" aria-hidden="true"></span>
        <span class="game-memo-bubble" hidden></span>
        <span class="game-action-layer" aria-hidden="true"><i class="typing-hand left"></i><i class="typing-hand right"></i><i class="heat-pixel one"></i><i class="heat-pixel two"></i><i class="heat-pixel three"></i></span>`);
    }
  }

  function decorateCard(card) {
    const id = card.dataset.serverId;
    const server = typeof getServer === 'function' ? getServer(id) : {};
    if (!server) return;
    const node = findNode(id) || {};
    const gameState = deriveGameState(node, server);
    ensureCardLayers(card);
    card.dataset.gameState = gameState;
    card.classList.remove(...GAME_STATES.map(state => `character-${state}`));
    card.classList.add(`character-${gameState}`);
    const icon = card.querySelector('.game-state-icon');
    if (icon) {
      icon.textContent = STATE_ICONS[gameState];
      icon.title = STATE_LABELS[gameState];
    }
    const stateLabel = card.querySelector('.npc-state-label');
    if (stateLabel) stateLabel.textContent = STATE_LABELS[gameState];
    const badge = card.querySelector('.badge');
    if (badge) {
      badge.textContent = STATE_LABELS[gameState];
      badge.dataset.gameState = gameState;
    }
    const memo = getMemo(node, id);
    const bubble = card.querySelector('.game-memo-bubble');
    if (bubble) {
      bubble.textContent = memo.length > 18 ? `${memo.slice(0, 18)}…` : memo;
      bubble.hidden = !memo;
      bubble.title = memo;
    }
    card.setAttribute('aria-label', `${id} ${server.name} · ${STATE_LABELS[gameState]} · 서버 정보 열기`);
  }

  function decorateAllCards() {
    configureOfficePresentation();
    renderOfficeMap();
    document.querySelectorAll('.server-card').forEach(decorateCard);
    updateOrgTree();
  }
  function ensureDetailPanel() {
    if (document.getElementById('gameServerDetail')) return;
    const content = document.getElementById('detailContent');
    const actions = content?.querySelector('.detail-actions');
    if (!content || !actions) return;
    const section = document.createElement('section');
    section.id = 'gameServerDetail';
    section.className = 'game-server-detail';
    section.innerHTML = `
      <div class="game-detail-heading"><span class="eyebrow">LIVE CALCULATION</span><strong id="gameDetailState">-</strong></div>
      <dl class="game-detail-list">
        <div><dt>현재 계산</dt><dd id="gameDetailCalculation">-</dd></div>
        <div><dt>Input</dt><dd id="gameDetailInput">-</dd></div>
        <div><dt>Output</dt><dd id="gameDetailOutput">-</dd></div>
        <div><dt>Working Directory</dt><dd id="gameDetailDirectory">-</dd></div>
        <div><dt>CPU</dt><dd id="gameDetailCpu">-</dd></div>
        <div><dt>Memory</dt><dd id="gameDetailMemory">-</dd></div>
        <div><dt>Load 1 / 5 / 15</dt><dd id="gameDetailLoad">-</dd></div>
        <div><dt>시작 시각</dt><dd id="gameDetailStarted">-</dd></div>
        <div><dt>경과 시간</dt><dd id="gameDetailElapsed">-</dd></div>
        <div><dt>종료 여부</dt><dd id="gameDetailTermination">-</dd></div>
      </dl>
      <div class="server-memo-disabled" aria-describedby="memoBackendNotice">
        <label for="serverMemoInput">캐릭터 메모</label>
        <textarea id="serverMemoInput" rows="2" disabled placeholder="백엔드 메모 저장 API가 준비되면 사용할 수 있습니다."></textarea>
        <div><small id="memoBackendNotice">백엔드 저장 API 대기 · 현재 /api/status의 읽기 전용 메모만 표시</small><button id="saveServerMemoBtn" type="button" class="btn secondary" disabled>저장</button></div>
      </div>`;
    content.insertBefore(section, actions);
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  }

  function updateDetail(id) {
    ensureDetailPanel();
    const server = typeof getServer === 'function' ? getServer(id) : null;
    if (!server) return;
    const node = findNode(id) || {};
    const gameState = deriveGameState(node, server);
    const detail = detailModel(node, server);
    setText('gameDetailState', STATE_LABELS[gameState]);
    setText('gameDetailCalculation', detail.calculation);
    setText('gameDetailInput', detail.input);
    setText('gameDetailOutput', detail.output);
    setText('gameDetailDirectory', detail.directory);
    setText('gameDetailCpu', detail.cpu);
    setText('gameDetailMemory', detail.memory);
    setText('gameDetailLoad', detail.load);
    setText('gameDetailStarted', detail.started);
    setText('gameDetailElapsed', detail.elapsed);
    setText('gameDetailTermination', detail.termination);
    const memo = getMemo(node, id);
    const input = document.getElementById('serverMemoInput');
    if (input) input.value = memo;
    const detailBadge = document.getElementById('detailStatusBadge');
    if (detailBadge) {
      detailBadge.textContent = STATE_LABELS[gameState];
      detailBadge.dataset.gameState = gameState;
    }
  }

  function applySnapshot(snapshot) {
    latestSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : { nodes: [] };
    const nodes = Array.isArray(latestSnapshot.nodes) ? latestSnapshot.nodes : [];
    latestNodes = new Map(nodes.map(node => [getNodeId(node), node]).filter(([id]) => id));
    decorateAllCards();
    if (typeof selectedServerId !== 'undefined' && selectedServerId) updateDetail(selectedServerId);
  }

  function install() {
    if (installed) return;
    installed = true;
    ensureOrgTree();
    ensureDetailPanel();

    if (typeof renderDepartments === 'function') {
      const priorRender = renderDepartments;
      renderDepartments = function gameUiRenderDepartments(...args) {
        const result = priorRender.apply(this, args);
        decorateAllCards();
        return result;
      };
    }
    if (typeof selectServer === 'function') {
      const priorSelect = selectServer;
      selectServer = function gameUiSelectServer(id, ...args) {
        const result = priorSelect.call(this, id, ...args);
        updateDetail(id);
        updateOrgTree();
        return result;
      };
    }

    document.addEventListener('ys:status-snapshot', event => applySnapshot(event.detail?.snapshot || { nodes: event.detail?.nodes || [] }));
    decorateAllCards();
  }

  const api = Object.freeze({ deriveGameState, detailModel, formatElapsed, getMemo, STATE_LABELS });
  globalThis.YSGameUI = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  }
})();