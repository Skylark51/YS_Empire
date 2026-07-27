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

  function ensureOfficeControls() {
    const dock = document.getElementById('officeControlDock');
    if (!dock || document.getElementById('officeFilterTools')) return;

    const tools = document.createElement('div');
    tools.id = 'officeFilterTools';
    tools.className = 'office-filter-tools';
    tools.innerHTML = `
      <label class="office-search-box" title="서버·직원·계산 검색">
        <span aria-hidden="true">⌕</span>
        <input id="officeServerSearch" type="search" placeholder="lion 또는 계산명 검색" autocomplete="off" />
      </label>
      <select id="officeStatusFilter" class="office-status-filter" aria-label="서버 상태 필터">
        <option value="all">전체 상태</option>
        <option value="owned">내 서버</option>
        <option value="running">계산 중</option>
        <option value="waiting">대기</option>
        <option value="warning">확인 필요</option>
        <option value="done">완료</option>
      </select>
      <span id="officeVisibleCount" class="office-visible-count">0대 표시</span>
      <a class="agent-setup-link" href="agent-setup.html" target="_blank" rel="noopener">연결 설정</a>`;

    const connection = dock.querySelector('.connection-cluster');
    if (connection) connection.insertAdjacentElement('afterend', tools);
    else dock.prepend(tools);
    document.dispatchEvent(new CustomEvent('ys:office-controls-ready'));
  }

  let decorationPending = false;

  function decorateCharacters() {
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
