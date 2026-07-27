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
  const on = (id, eventName, handler) => $(id)?.addEventListener(eventName, handler);
  const normaliseEndpoint = value => String(value || '').trim().replace(/\/+$/, '');
  const formatTime = value => {
    if (!value) return '-';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('ko-KR', { hour12: false });
  };
  const finiteNumber = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const bytesToGiB = value => {
    const bytes = finiteNumber(value);
    return bytes && bytes > 0 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : null;
  };

  function gaussianOf(node) {
    if (node?.gaussian && typeof node.gaussian === 'object') return node.gaussian;
    if (node?.job && typeof node.job === 'object') return node.job;
    return {};
  }

  function systemOf(node) {
    return node?.system && typeof node.system === 'object' ? node.system : {};
  }

  function setTheme(theme) {
    const resolved = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = resolved;
    localStorage.setItem('ys-theme', resolved);
    const button = $('themeToggleBtn');
    if (button) {
      button.textContent = resolved === 'dark' ? '☀' : '☾';
      button.title = resolved === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환';
      button.setAttribute('aria-label', button.title);
    }
  }

  function initialiseTheme() {
    const saved = localStorage.getItem('ys-theme');
    const preferred = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    setTheme(saved || preferred);
  }

  function setConnectionUi(mode, message) {
    const label = $('connectionLabel');
    const dot = $('connectionDot');
    const sync = $('lastSyncLabel');
    if (dot) dot.className = `connection-dot ${mode}`;
    if (label) {
      if (mode === 'online') label.textContent = 'Lion 실시간 연결';
      else if (mode === 'connecting') label.textContent = 'Agent 확인 중';
      else label.textContent = '샘플 데이터';
    }
    if (sync) sync.textContent = message;
  }

  function requestOptions({ method = 'GET', body, timeoutMs = 7000 } = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Accept: 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return {
      options: {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: 'no-store'
      },
      clear: () => window.clearTimeout(timer)
    };
  }

  async function fetchJson(path, options = {}) {
    const request = requestOptions(options);
    try {
      const response = await fetch(`${state.endpoint}${path}`, request.options);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      request.clear();
    }
  }

  async function fetchStatus(timeoutMs = 7000) {
    return fetchJson('/api/status', { timeoutMs });
  }

  async function requestAgentRefresh() {
    if (!state.token) return false;
    try {
      await fetchJson('/api/refresh', { method: 'POST', timeoutMs: 7000 });
      return true;
    } catch (error) {
      if (!String(error.message).includes('409')) throw error;
      return false;
    }
  }

  async function saveNote(nodeId, text, timeoutMs = 7000) {
    if (!state.connected || !state.token) throw new Error('Lion Agent에 먼저 연결해 주세요.');
    if (!/^(?:t?lion)\d+$/i.test(nodeId)) throw new Error('메모를 저장할 수 없는 서버입니다.');
    const saved = await fetchJson(`/api/notes/${encodeURIComponent(nodeId)}`, {
      method: 'PUT', body: { text }, timeoutMs
    });
    await refreshLive({ quiet: true, triggerCollection: false });
    return saved;
  }

  function notifyConnectionState() {
    document.dispatchEvent(new CustomEvent('ys:connection-state', {
      detail: { connected: state.connected, writable: state.connected && Boolean(state.token) }
    }));
  }

  function findServer(id) {
    if (typeof departments === 'undefined') return null;
    for (const department of departments) {
      const server = department.servers?.find(item => item.id === id);
      if (server) return server;
    }
    return null;
  }

  function legacyStatusForNode(node, fallback = 'waiting') {
    const raw = String(node?.state || node?.status || '').toLowerCase().replace(/_/g, '-');
    const gaussian = gaussianOf(node);
    if (node?.online === false || raw === 'offline') return 'warning';
    if (gaussian.error_termination === true || ['failed', 'error', 'warning'].includes(raw)) return 'warning';
    if (gaussian.normal_termination === true || ['done', 'finished', 'completed'].includes(raw)) return 'done';
    if (['running', 'high-load', 'busy'].includes(raw)) return 'running';
    if (['idle', 'waiting', 'unknown', 'busy-other'].includes(raw)) return 'waiting';
    return ['waiting', 'running', 'warning', 'done'].includes(fallback) ? fallback : 'waiting';
  }

  function jobLabel(node, server, gaussian) {
    if (typeof node.job === 'string' && node.job.trim()) return node.job;
    return gaussian.output_file || gaussian.input_file || gaussian.input_name || server.job || '할당된 계산 없음';
  }

  function cpuLabel(node, server, system) {
    const cores = finiteNumber(system.cpu?.cores);
    const usage = finiteNumber(system.cpu?.usage_percent);
    if (cores !== null && usage !== null) return `${cores} cores · ${usage.toFixed(1)}%`;
    if (cores !== null) return `${cores} cores`;
    return node.cpu || server.cpu;
  }

  function memoryLabel(node, server, system) {
    const total = bytesToGiB(system.memory?.total_bytes);
    const used = finiteNumber(system.memory?.used_percent);
    if (total && used !== null) return `${total} · ${used.toFixed(1)}% 사용`;
    if (total) return total;
    return node.memory || server.memory;
  }

  function applySnapshot(snapshot) {
    const nodes = Array.isArray(snapshot?.nodes) ? snapshot.nodes : [];
    for (const node of nodes) {
      const id = node.id || node.host;
      const server = findServer(id);
      if (!server) continue;
      const gaussian = gaussianOf(node);
      const system = systemOf(node);
      const status = legacyStatusForNode(node, server.status);
      const progress = finiteNumber(node.progress);
      const load1 = system.load_average?.one ?? node.load1 ?? '-';
      Object.assign(server, {
        status,
        progress: progress !== null ? Math.max(0, Math.min(100, progress)) : (status === 'done' ? 100 : server.progress),
        job: jobLabel(node, server, gaussian),
        directory: gaussian.working_directory || node.working_directory || node.directory || server.directory,
        started: gaussian.started_at || node.started_at || node.started || '-',
        eta: node.eta || (status === 'running' ? '계산 중' : status === 'done' ? '완료' : status === 'warning' ? '확인 필요' : '즉시 사용 가능'),
        cpu: cpuLabel(node, server, system),
        memory: memoryLabel(node, server, system),
        project: node.project || server.project,
        purpose: node.purpose || server.purpose,
        live: true,
        monitorManaged: true,
        liveNode: node,
        liveStatus: node.state || node.status || 'unknown',
        checkedAt: node.checked_at || snapshot.generated_at,
        load1,
        pid: gaussian.pid || node.pid || '-',
        error: node.error || '',
        stage: gaussian.stage || null,
        elapsedSeconds: gaussian.elapsed_seconds ?? null,
        lastEnergyHartree: gaussian.last_energy_hartree ?? null
      });
    }

    state.lastSync = snapshot?.generated_at || new Date().toISOString();
    state.connected = true;
    notifyConnectionState();
    if (typeof renderDepartments === 'function') renderDepartments();
    if (typeof selectedServerId !== 'undefined' && selectedServerId && typeof selectServer === 'function') selectServer(selectedServerId);
    applyFilters();
    setConnectionUi('online', `최근 동기화 ${formatTime(state.lastSync)}`);
    document.dispatchEvent(new CustomEvent('ys:status-snapshot', { detail: { snapshot, nodes } }));
  }

  async function refreshLive({ quiet = false, triggerCollection = false } = {}) {
    if (!state.endpoint) return false;
    if (!quiet) setConnectionUi('connecting', triggerCollection ? '새 상태를 수집하는 중' : 'Agent 응답을 기다리는 중');
    try {
      if (triggerCollection) {
        await requestAgentRefresh();
        await new Promise(resolve => window.setTimeout(resolve, 450));
      }
      const snapshot = await fetchStatus();
      applySnapshot(snapshot);
      if (!quiet && typeof addLog === 'function') addLog('Lion Agent', `${snapshot.nodes?.length || 0}개 노드 상태를 동기화했습니다.`);
      return true;
    } catch (error) {
      state.connected = false;
      notifyConnectionState();
      const reason = error.name === 'AbortError' ? '시간 초과' : error.message;
      setConnectionUi('offline', `연결 실패 · ${reason}`);
      if (!quiet && typeof addLog === 'function') addLog('Lion Agent', `연결 실패: ${reason}`);
      return false;
    }
  }

  function schedulePolling() {
    window.clearInterval(state.pollTimer);
    if (state.pollInterval > 0 && state.connected) {
      state.pollTimer = window.setInterval(() => refreshLive({ quiet: true }), state.pollInterval);
    }
  }

  function filterableElements() {
    const classic = [...document.querySelectorAll('.server-card[data-server-id]')];
    if (classic.length) return classic;
    return [...document.querySelectorAll('.office-character[data-server-id]')];
  }

  function applyFilters() {
    const cards = filterableElements();
    let visible = 0;
    for (const card of cards) {
      const server = findServer(card.dataset.serverId);
      if (!server) continue;
      const haystack = [server.id, server.name, server.role, server.project, server.job, server.institution]
        .join(' ').toLowerCase();
      const queryMatch = !state.query || haystack.includes(state.query);
      const section = card.closest('.department, .department-partition');
      const owned = section?.classList.contains('department-jbnu-owned') || section?.dataset.departmentId === 'jbnu-owned' || section?.dataset.departmentId === 'jbnu-hpc';
      const filterMatch = state.filter === 'all' || (state.filter === 'owned' && owned) || server.status === state.filter;
      card.hidden = !(queryMatch && filterMatch);
      if (!card.hidden) visible += 1;
    }
    document.querySelectorAll('.department, .department-partition').forEach(section => {
      const members = [...section.querySelectorAll('[data-server-id]')];
      if (members.length) section.hidden = members.every(card => card.hidden);
    });
    const counter = $('visibleServerCount') || $('officeVisibleCount');
    if (counter) counter.textContent = `${visible}대 표시`;
  }

  function populateLiveDetail(id) {
    const server = findServer(id);
    if (!server) return;
    if ($('detailCheckedAt')) $('detailCheckedAt').textContent = formatTime(server.checkedAt);
    if ($('detailLoad')) $('detailLoad').textContent = server.load1 ?? '-';
    if ($('detailPid')) $('detailPid').textContent = server.pid || '-';
  }

  if (typeof renderDepartments === 'function') {
    const originalRenderDepartments = renderDepartments;
    renderDepartments = function patchedRenderDepartments(...args) {
      const result = originalRenderDepartments.apply(this, args);
      applyFilters();
      return result;
    };
  }

  if (typeof selectServer === 'function') {
    const originalSelectServer = selectServer;
    selectServer = function patchedSelectServer(id, ...args) {
      const result = originalSelectServer.call(this, id, ...args);
      populateLiveDetail(id);
      return result;
    };
  }

  function fillConnectionForm() {
    if ($('agentEndpointInput')) $('agentEndpointInput').value = state.endpoint;
    if ($('agentTokenInput')) $('agentTokenInput').value = state.token;
    if ($('pollIntervalInput')) $('pollIntervalInput').value = String(state.pollInterval);
  }

  async function testConnection() {
    state.endpoint = normaliseEndpoint($('agentEndpointInput')?.value || state.endpoint);
    state.token = $('agentTokenInput')?.value.trim() || '';
    const result = $('connectionTestResult');
    if (result) {
      result.className = 'connection-test-result neutral';
      result.textContent = '연결을 확인하는 중입니다.';
    }
    try {
      const snapshot = await fetchStatus();
      if (result) {
        result.className = 'connection-test-result success';
        result.textContent = `연결 성공 · ${snapshot.nodes?.length || 0}개 노드 · /api/status`;
      }
      return true;
    } catch (error) {
      if (result) {
        result.className = 'connection-test-result error';
        result.textContent = `연결 실패 · ${error.name === 'AbortError' ? '시간 초과' : error.message}`;
      }
      return false;
    }
  }

  function disconnect() {
    window.clearInterval(state.pollTimer);
    state.connected = false;
    state.token = '';
    notifyConnectionState();
    sessionStorage.removeItem('ys-agent-token');
    setConnectionUi('offline', 'Lion Agent 미연결');
    if (typeof addLog === 'function') addLog('Lion Agent', '실시간 연결을 해제했습니다.');
  }

  function bindOptionalFilters() {
    for (const id of ['serverSearchInput', 'officeServerSearch']) {
      const input = $(id);
      if (!input || input.dataset.ysLiveBound === 'true') continue;
      input.dataset.ysLiveBound = 'true';
      input.addEventListener('input', event => {
        state.query = event.target.value.trim().toLowerCase();
        applyFilters();
      });
    }
    const select = $('officeStatusFilter');
    if (select && select.dataset.ysLiveBound !== 'true') {
      select.dataset.ysLiveBound = 'true';
      select.addEventListener('change', event => {
        state.filter = event.target.value;
        applyFilters();
      });
    }
    document.querySelectorAll('.filter-btn').forEach(button => {
      if (button.dataset.ysLiveBound === 'true') return;
      button.dataset.ysLiveBound = 'true';
      button.addEventListener('click', () => {
        state.filter = button.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(item => item.classList.toggle('active', item === button));
        applyFilters();
      });
    });
  }

  initialiseTheme();
  fillConnectionForm();
  applyFilters();
  bindOptionalFilters();

  on('themeToggleBtn', 'click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  on('connectionBtn', 'click', () => {
    fillConnectionForm();
    $('connectionDialog')?.showModal();
  });
  on('closeConnectionDialogBtn', 'click', () => $('connectionDialog')?.close());
  on('testAgentBtn', 'click', testConnection);
  on('disconnectAgentBtn', 'click', () => {
    disconnect();
    $('connectionDialog')?.close();
  });
  on('refreshLiveBtn', 'click', () => refreshLive({ triggerCollection: true }));
  on('connectionForm', 'submit', async event => {
    event.preventDefault();
    state.endpoint = normaliseEndpoint($('agentEndpointInput')?.value || state.endpoint);
    state.token = $('agentTokenInput')?.value.trim() || '';
    state.pollInterval = Number($('pollIntervalInput')?.value || 0);
    localStorage.setItem('ys-agent-endpoint', state.endpoint);
    localStorage.setItem('ys-agent-poll', String(state.pollInterval));
    if (state.token) sessionStorage.setItem('ys-agent-token', state.token);
    else sessionStorage.removeItem('ys-agent-token');
    const ok = await refreshLive({ triggerCollection: true });
    if (ok) {
      schedulePolling();
      $('connectionDialog')?.close();
    }
  });
  on('copySshBtn', 'click', async () => {
    const server = findServer(typeof selectedServerId !== 'undefined' ? selectedServerId : '');
    if (!server) return;
    const command = String(server.host || server.id).startsWith('ssh ') ? server.host : `ssh ${server.host || server.id}`;
    try {
      await navigator.clipboard.writeText(command);
      if (typeof addLog === 'function') addLog(server.name, `${command} 명령을 복사했습니다.`);
    } catch {
      if (typeof addLog === 'function') addLog(server.name, `SSH 명령: ${command}`);
    }
  });

  const grid = $('departmentGrid');
  if (grid) {
    const observer = new MutationObserver(() => {
      bindOptionalFilters();
      applyFilters();
    });
    observer.observe(grid, { childList: true, subtree: true });
  }

  document.addEventListener('ys:office-controls-ready', () => {
    bindOptionalFilters();
    applyFilters();
  });

  globalThis.YSLiveAgent = Object.freeze({
    saveNote,
    canSaveNotes: () => state.connected && Boolean(state.token),
    refresh: () => refreshLive({ triggerCollection: true }),
    applyFilters
  });

  if (state.token) refreshLive({ quiet: true }).then(ok => { if (ok) schedulePolling(); });
})();
