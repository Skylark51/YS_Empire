(() => {
  'use strict';

  const state = {
    endpoint: localStorage.getItem('ys-agent-endpoint') || 'http://127.0.0.1:8765',
    token: sessionStorage.getItem('ys-agent-token') || '',
    pollInterval: Number(localStorage.getItem('ys-agent-poll') || 10000),
    pollTimer: null,
    connected: false,
    filter: 'all',
    query: '',
    lastSync: null
  };

  const $ = id => document.getElementById(id);
  const normaliseEndpoint = value => value.trim().replace(/\/+$/, '');
  const formatTime = value => value ? new Date(value).toLocaleString('ko-KR', { hour12: false }) : '-';

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ys-theme', theme);
    $('themeToggleBtn').textContent = theme === 'dark' ? '☀' : '☾';
    $('themeToggleBtn').title = theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환';
  }

  function initialiseTheme() {
    const saved = localStorage.getItem('ys-theme');
    const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    setTheme(saved || preferred);
  }

  function setConnectionUi(mode, message) {
    const label = $('connectionLabel');
    const dot = $('connectionDot');
    const sync = $('lastSyncLabel');
    dot.className = `connection-dot ${mode}`;
    if (mode === 'online') label.textContent = 'Lion 실시간 연결';
    else if (mode === 'connecting') label.textContent = 'Agent 확인 중';
    else label.textContent = '샘플 데이터';
    sync.textContent = message;
  }

  async function agentFetch(path, timeoutMs = 6000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      if (state.token) headers.Authorization = `Bearer ${state.token}`;
      const response = await fetch(`${state.endpoint}${path}`, { headers, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function findServer(id) {
    for (const department of departments) {
      const server = department.servers.find(item => item.id === id);
      if (server) return server;
    }
    return null;
  }

  function applySnapshot(snapshot) {
    const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
    for (const node of nodes) {
      const server = findServer(node.id || node.host);
      if (!server) continue;
      Object.assign(server, {
        status: node.status || server.status,
        progress: Number.isFinite(node.progress) ? node.progress : server.progress,
        job: node.job || '할당된 계산 없음',
        directory: node.directory || server.directory,
        started: node.started || '-',
        eta: node.eta || (node.status === 'running' ? '계산 중' : '-'),
        cpu: node.cpu || server.cpu,
        memory: node.memory || server.memory,
        project: node.project || server.project,
        purpose: node.purpose || server.purpose,
        live: true,
        checkedAt: node.checked_at || snapshot.generated_at,
        load1: node.load1 ?? '-',
        pid: node.pid || '-',
        error: node.error || ''
      });
    }
    state.lastSync = snapshot.generated_at || new Date().toISOString();
    state.connected = true;
    renderDepartments();
    if (selectedServerId) selectServer(selectedServerId);
    applyFilters();
    setConnectionUi('online', `최근 동기화 ${formatTime(state.lastSync)}`);
  }

  async function refreshLive({ quiet = false } = {}) {
    if (!state.endpoint) return;
    if (!quiet) setConnectionUi('connecting', 'Agent 응답을 기다리는 중');
    try {
      const snapshot = await agentFetch('/api/status');
      applySnapshot(snapshot);
      if (!quiet) addLog('Lion Agent', `${snapshot.nodes?.length || 0}개 노드 상태를 동기화했습니다.`);
      return true;
    } catch (error) {
      state.connected = false;
      setConnectionUi('offline', `연결 실패 · ${error.name === 'AbortError' ? '시간 초과' : error.message}`);
      if (!quiet) addLog('Lion Agent', `연결 실패: ${error.message}`);
      return false;
    }
  }

  function schedulePolling() {
    clearInterval(state.pollTimer);
    if (state.pollInterval > 0 && state.connected) {
      state.pollTimer = setInterval(() => refreshLive({ quiet: true }), state.pollInterval);
    }
  }

  function applyFilters() {
    const cards = [...document.querySelectorAll('.server-card')];
    let visible = 0;
    for (const card of cards) {
      const server = findServer(card.dataset.serverId);
      if (!server) continue;
      const haystack = [server.id, server.name, server.role, server.project, server.job, server.institution].join(' ').toLowerCase();
      const queryMatch = !state.query || haystack.includes(state.query);
      const section = card.closest('.department');
      const owned = section?.classList.contains('department-jbnu-owned') || section?.classList.contains('department-jbnu-hpc');
      const filterMatch = state.filter === 'all' || (state.filter === 'owned' && owned) || server.status === state.filter;
      card.hidden = !(queryMatch && filterMatch);
      if (!card.hidden) visible += 1;
    }
    document.querySelectorAll('.department').forEach(section => {
      const normalCards = [...section.querySelectorAll('.server-card')];
      if (normalCards.length) section.hidden = normalCards.every(card => card.hidden);
    });
    $('visibleServerCount').textContent = `${visible}대 표시`;
  }

  function populateLiveDetail(id) {
    const server = findServer(id);
    if (!server) return;
    $('detailCheckedAt').textContent = formatTime(server.checkedAt);
    $('detailLoad').textContent = server.load1 ?? '-';
    $('detailPid').textContent = server.pid || '-';
  }

  const originalRenderDepartments = renderDepartments;
  renderDepartments = function patchedRenderDepartments() {
    originalRenderDepartments();
    applyFilters();
  };

  const originalSelectServer = selectServer;
  selectServer = function patchedSelectServer(id) {
    originalSelectServer(id);
    populateLiveDetail(id);
  };

  function fillConnectionForm() {
    $('agentEndpointInput').value = state.endpoint;
    $('agentTokenInput').value = state.token;
    $('pollIntervalInput').value = String(state.pollInterval);
  }

  async function testConnection() {
    state.endpoint = normaliseEndpoint($('agentEndpointInput').value);
    state.token = $('agentTokenInput').value.trim();
    const result = $('connectionTestResult');
    result.className = 'connection-test-result neutral';
    result.textContent = '연결을 확인하는 중입니다.';
    try {
      const health = await agentFetch('/api/health');
      result.className = 'connection-test-result success';
      result.textContent = `연결 성공 · ${health.service || 'YS Lion Agent'} · ${health.version || ''}`;
      return true;
    } catch (error) {
      result.className = 'connection-test-result error';
      result.textContent = `연결 실패 · ${error.message}`;
      return false;
    }
  }

  function disconnect() {
    clearInterval(state.pollTimer);
    state.connected = false;
    state.token = '';
    sessionStorage.removeItem('ys-agent-token');
    setConnectionUi('offline', 'Lion Agent 미연결');
    addLog('Lion Agent', '실시간 연결을 해제했습니다.');
  }

  initialiseTheme();
  fillConnectionForm();
  applyFilters();

  $('themeToggleBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  $('connectionBtn').addEventListener('click', () => { fillConnectionForm(); $('connectionDialog').showModal(); });
  $('closeConnectionDialogBtn').addEventListener('click', () => $('connectionDialog').close());
  $('testAgentBtn').addEventListener('click', testConnection);
  $('disconnectAgentBtn').addEventListener('click', () => { disconnect(); $('connectionDialog').close(); });
  $('refreshLiveBtn').addEventListener('click', () => refreshLive());
  $('connectionForm').addEventListener('submit', async event => {
    event.preventDefault();
    state.endpoint = normaliseEndpoint($('agentEndpointInput').value);
    state.token = $('agentTokenInput').value.trim();
    state.pollInterval = Number($('pollIntervalInput').value);
    localStorage.setItem('ys-agent-endpoint', state.endpoint);
    localStorage.setItem('ys-agent-poll', String(state.pollInterval));
    sessionStorage.setItem('ys-agent-token', state.token);
    const ok = await refreshLive();
    if (ok) { schedulePolling(); $('connectionDialog').close(); }
  });

  $('serverSearchInput').addEventListener('input', event => { state.query = event.target.value.trim().toLowerCase(); applyFilters(); });
  document.querySelectorAll('.filter-btn').forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(item => item.classList.toggle('active', item === button));
      applyFilters();
    });
  });
  $('copySshBtn').addEventListener('click', async () => {
    const server = findServer(selectedServerId);
    if (!server) return;
    const command = server.host.startsWith('ssh ') ? server.host : `ssh ${server.host}`;
    try { await navigator.clipboard.writeText(command); addLog(server.name, `${command} 명령을 복사했습니다.`); }
    catch { addLog(server.name, `SSH 명령: ${command}`); }
  });

  const observer = new MutationObserver(() => applyFilters());
  observer.observe($('departmentGrid'), { childList: true });

  if (state.token) refreshLive({ quiet: true }).then(ok => { if (ok) schedulePolling(); });
})();
