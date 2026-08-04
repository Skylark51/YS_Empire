(() => {
  'use strict';

  const STATUS_LABELS = {
    running: '계산 중',
    waiting: '대기',
    warning: '확인 필요',
    done: '완료'
  };

  function serverFor(id) {
    return typeof getServer === 'function' ? getServer(id) : null;
  }

  function removeLegacyGameUi() {
    document.getElementById('serverOrgTree')?.remove();
    document.getElementById('gameServerDetail')?.remove();
    document.querySelectorAll('.server-org-tree, .game-action-layer, .game-state-icon, .game-memo-bubble').forEach(element => element.remove());
  }

  function settleMinimalLayout() {
    const workspace = document.querySelector('.workspace');
    const dock = document.getElementById('officeControlDock');
    if (!workspace || !dock) return false;

    removeLegacyGameUi();
    document.documentElement.setAttribute('data-theme', 'light');
    dock.classList.add('control-rail');
    if (dock.parentElement !== workspace) workspace.appendChild(dock);

    document.querySelector('.connection-cluster')?.remove();
    document.getElementById('connectionDialog')?.remove();

    const brand = document.querySelector('.brand');
    const tools = dock.querySelector('#officeFilterTools');
    const status = dock.querySelector('.status-strip');
    let footer = dock.querySelector('.control-rail-footer');

    if (!footer) {
      footer = document.createElement('div');
      footer.className = 'control-rail-footer';
      footer.innerHTML = '<span>YS EMPIRE</span><strong>MINIMAL CONTROL</strong>';
    }

    [brand, tools, status, footer].filter(Boolean).forEach(node => dock.appendChild(node));

    const topActions = document.querySelector('.top-actions');
    const addTask = document.getElementById('addTaskBtn');
    if (topActions && addTask && addTask.parentElement !== topActions) topActions.appendChild(addTask);

    document.querySelector('.todo-card')?.classList.add('minimal-hidden-control');
    document.querySelector('.event-console')?.classList.add('minimal-hidden-control');
    document.getElementById('themeToggleBtn')?.classList.add('minimal-hidden-control');
    document.getElementById('markDoneBtn')?.classList.add('minimal-hidden-control');
    document.getElementById('needsReviewBtn')?.classList.add('minimal-hidden-control');

    return true;
  }

  function ensureOfficeControls() {
    const dock = document.getElementById('officeControlDock');
    if (!dock) return;

    let tools = document.getElementById('officeFilterTools');
    let created = false;

    if (!tools) {
      created = true;
      tools = document.createElement('div');
      tools.id = 'officeFilterTools';
      tools.className = 'office-filter-tools';
      tools.innerHTML = `
        <label class="office-search-box" title="서버·직원·계산 검색">
          <span aria-hidden="true">⌕</span>
          <input id="officeServerSearch" type="search" placeholder="서버 또는 계산 검색" autocomplete="off" />
        </label>
        <select id="officeStatusFilter" class="office-status-filter" aria-label="서버 상태 필터">
          <option value="all">전체 상태</option>
          <option value="owned">내 서버</option>
          <option value="running">계산 중</option>
          <option value="waiting">대기</option>
          <option value="warning">확인 필요</option>
          <option value="done">완료</option>
        </select>
        <span id="officeVisibleCount" class="office-visible-count">0대 표시</span>`;
      dock.appendChild(tools);
    }

    dock.querySelector('.agent-setup-link')?.remove();
    settleMinimalLayout();

    if (created) document.dispatchEvent(new CustomEvent('ys:office-controls-ready'));
  }

  function calmCharacters() {
    document.querySelectorAll('.talking-character').forEach(character => {
      character.classList.remove('talking-character', 'speaking');
      character.removeAttribute('data-speech-pool');
      character.querySelector('.speech-bubble')?.remove();
    });
  }

  let decorationPending = false;

  function decorateCharacters() {
    removeLegacyGameUi();
    document.querySelectorAll('.office-character[data-server-id]').forEach(character => {
      const server = serverFor(character.dataset.serverId);
      if (!server) return;
      const status = ['running', 'waiting', 'warning', 'done'].includes(server.status) ? server.status : 'waiting';
      character.dataset.status = status;
      character.classList.remove('status-running', 'status-waiting', 'status-warning', 'status-done');
      character.classList.add(`status-${status}`);
      let dot = character.querySelector('.office-status-dot');
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'office-status-dot';
        character.appendChild(dot);
      }
      dot.className = `office-status-dot ${status}`;
      dot.title = STATUS_LABELS[status];
      dot.setAttribute('aria-label', STATUS_LABELS[status]);
      const label = character.querySelector('.character-name small');
      const labelText = `${server.id} · ${STATUS_LABELS[status]}`;
      if (label && label.textContent !== labelText) label.textContent = labelText;
    });
    calmCharacters();
    globalThis.YSLiveAgent?.applyFilters?.();
  }

  function scheduleDecoration() {
    if (decorationPending) return;
    decorationPending = true;
    requestAnimationFrame(() => {
      decorationPending = false;
      ensureOfficeControls();
      decorateCharacters();
    });
  }

  function install() {
    removeLegacyGameUi();
    ensureOfficeControls();
    decorateCharacters();

    const grid = document.getElementById('departmentGrid');
    if (grid) {
      const observer = new MutationObserver(scheduleDecoration);
      observer.observe(grid, { childList: true, subtree: true });
    }

    document.addEventListener('ys:status-snapshot', scheduleDecoration);
    document.addEventListener('ys:connection-state', event => {
      document.body.classList.toggle('agent-connected', Boolean(event.detail?.connected));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
