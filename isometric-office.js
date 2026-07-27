(() => {
  'use strict';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const statusText = { waiting: '대기', running: '계산중', warning: '확인필요', done: '완료' };
  const departmentOrder = ['jbnu-owned', 'jbnu-hpc', 'jbnu-borrowed', 'ai', 'ewha', 'gpu-restricted', 'unist'];
  let activeFilter = 'all';

  function orderedDepartments() {
    const byId = new Map(departments.map(department => [department.id, department]));
    return [
      ...departmentOrder.map(id => byId.get(id)).filter(Boolean),
      ...departments.filter(department => !departmentOrder.includes(department.id))
    ];
  }

  function matchesFilter(server, department) {
    const query = (document.getElementById('serverSearchInput')?.value || '').trim().toLowerCase();
    const searchable = `${server.id} ${server.name} ${server.role || ''} ${server.project || ''} ${server.job || ''} ${server.purpose || ''}`.toLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (activeFilter === 'owned') return department.id === 'jbnu-owned' || (department.id === 'jbnu-hpc' && server.id === 'tlion3');
    if (['running', 'waiting', 'warning', 'done'].includes(activeFilter)) return server.status === activeFilter;
    return true;
  }

  function spriteMarkup(server) {
    if (server.avatar) {
      return `<img src="assets/characters/${escapeHtml(server.avatar)}" alt="${escapeHtml(server.name)}" />`;
    }
    if (server.spriteGroup && typeof spriteStyle === 'function') {
      return `<span class="character-sprite" style="${spriteStyle(server)}" role="img" aria-label="${escapeHtml(server.name)}"></span>`;
    }
    return '<span class="worker-fallback" aria-hidden="true">?</span>';
  }

  function ensureLayout() {
    document.body.classList.add('characters-only-layout');
    const workspace = document.querySelector('.workspace');
    const center = document.querySelector('.org-map-panel');
    const right = document.querySelector('.side-panel');
    let left = document.getElementById('serverOrgSidebar');

    if (!left) {
      left = document.createElement('aside');
      left.id = 'serverOrgSidebar';
      left.className = 'server-org-sidebar';
      left.innerHTML = `
        <div class="server-sidebar-title">
          <span class="eyebrow">SERVER CONTROL</span>
          <h2>서버 조직도</h2>
          <p>서버·계산·상태 정보는 이 사이드바에서 관리합니다.</p>
        </div>
        <div id="sidebarControlSlot" class="sidebar-control-slot"></div>
        <nav id="serverOrgNav" class="server-org-nav"></nav>`;
      workspace.insertBefore(left, center);
    }

    const controlSlot = document.getElementById('sidebarControlSlot');
    ['.connection-cluster', '.top-actions', '.status-strip', '.command-toolbar'].forEach(selector => {
      const element = document.querySelector(selector);
      if (element && !controlSlot.contains(element)) controlSlot.appendChild(element);
    });

    const eventConsole = document.querySelector('.event-console');
    if (eventConsole && !right.contains(eventConsole)) right.appendChild(eventConsole);

    document.querySelector('.panel-heading')?.classList.add('layout-hidden');
    document.querySelector('.executive-row')?.classList.add('layout-hidden');
    document.querySelector('.office-tools-floor')?.classList.add('layout-hidden');
    document.querySelector('.connector.trunk')?.classList.add('layout-hidden');
    document.querySelector('.topbar')?.classList.add('brand-only-topbar');
  }

  function renderSidebar() {
    const nav = document.getElementById('serverOrgNav');
    if (!nav) return;

    nav.innerHTML = orderedDepartments().map(department => {
      const servers = (department.servers || []).filter(server => matchesFilter(server, department));
      const allCount = (department.servers || []).length;
      return `
        <section class="sidebar-department">
          <div class="sidebar-department-heading">
            <span><strong>${escapeHtml(department.name)}</strong><small>${escapeHtml(department.manager || '')}</small></span>
            <em>${allCount}</em>
          </div>
          ${department.restricted ? '<div class="sidebar-special">glion1 · glion2 · GPU 사용 제외</div>' : ''}
          ${department.empty ? '<div class="sidebar-special">UNIST · 2026.09 입주 예정</div>' : ''}
          <div class="sidebar-server-list">
            ${servers.map(server => `
              <button type="button" class="sidebar-server ${selectedServerId === server.id ? 'selected' : ''}" data-server-id="${escapeHtml(server.id)}">
                <i class="dot ${escapeHtml(server.status)}"></i>
                <span>
                  <strong>${escapeHtml(server.id)} · ${escapeHtml(server.name)}</strong>
                  <small>${escapeHtml(server.job || '할당된 계산 없음')}</small>
                </span>
                <em>${escapeHtml(statusText[server.status] || '미확인')}</em>
              </button>`).join('')}
            ${!department.restricted && !department.empty && !servers.length ? '<div class="sidebar-special">현재 필터에 해당하는 서버 없음</div>' : ''}
          </div>
        </section>`;
    }).join('');

    nav.querySelectorAll('.sidebar-server').forEach(button => {
      button.addEventListener('click', () => selectServer(button.dataset.serverId));
    });
  }

  function characterMarkup(server) {
    return `
      <button type="button" class="office-character server-card ${selectedServerId === server.id ? 'selected' : ''}"
              data-server-id="${escapeHtml(server.id)}" data-status="${escapeHtml(server.status)}"
              aria-label="${escapeHtml(server.id)} ${escapeHtml(server.name)} 서버 선택">
        <span class="character-desk" aria-hidden="true"><i></i><b></b></span>
        <span class="character-body">${spriteMarkup(server)}</span>
      </button>`;
  }

  function renderCenter() {
    const grid = document.getElementById('departmentGrid');
    if (!grid) return;

    const visibleServers = [];
    orderedDepartments().forEach(department => {
      if (department.restricted || department.empty) return;
      (department.servers || []).forEach(server => {
        if (matchesFilter(server, department)) visibleServers.push(server);
      });
    });

    grid.className = 'department-grid characters-only-grid';
    grid.innerHTML = `
      <div class="character-office-world" aria-label="영섭랜드 픽셀 캐릭터 오피스">
        <div class="office-back-wall" aria-hidden="true">
          <span class="office-window one"></span><span class="office-window two"></span><span class="office-window three"></span>
          <span class="office-clock"></span>
        </div>
        <div class="owner-station">
          <span class="owner-desk" aria-hidden="true"></span>
          <img src="assets/characters/ceo-youngseop.png" alt="이영섭 대표" />
        </div>
        <div class="all-character-floor">
          ${visibleServers.map(characterMarkup).join('')}
        </div>
        <div class="research-character-row">
          <a href="research-tools.html#parserPanel" aria-label="로건 Gaussian Output Parser"><span class="tool-character tool-character-logan"></span></a>
          <a href="research-tools.html#siPanel" aria-label="세라 SI Generator"><span class="tool-character tool-character-sarah"></span></a>
        </div>
        <div class="office-props" aria-hidden="true"><i class="plant-left"></i><i class="plant-right"></i><i class="meeting-table"></i></div>
      </div>`;

    grid.querySelectorAll('.office-character').forEach(character => {
      character.addEventListener('click', () => selectServer(character.dataset.serverId));
    });
  }

  function renderEverything() {
    ensureLayout();
    renderSidebar();
    renderCenter();
    if (typeof updateCounters === 'function') updateCounters();
    if (typeof populateServerSelect === 'function') populateServerSelect();
  }

  function bindFilterControls() {
    const search = document.getElementById('serverSearchInput');
    if (search && !search.dataset.characterLayoutBound) {
      search.dataset.characterLayoutBound = 'true';
      search.addEventListener('input', () => {
        renderSidebar();
        renderCenter();
      });
    }

    document.querySelectorAll('.filter-btn').forEach(button => {
      if (button.dataset.characterLayoutBound) return;
      button.dataset.characterLayoutBound = 'true';
      button.addEventListener('click', () => {
        activeFilter = button.dataset.filter || 'all';
        document.querySelectorAll('.filter-btn').forEach(item => item.classList.toggle('active', item === button));
        renderSidebar();
        renderCenter();
      });
    });
  }

  function verifyLayout() {
    const expectedVisibleCount = orderedDepartments().reduce((count, department) => {
      if (department.restricted || department.empty) return count;
      return count + (department.servers || []).filter(server => matchesFilter(server, department)).length;
    }, 0);
    const checks = [
      document.querySelector('.workspace')?.children[0]?.id === 'serverOrgSidebar',
      document.querySelector('.org-map-panel .panel-heading')?.classList.contains('layout-hidden'),
      document.querySelector('.org-map-panel .command-toolbar') === null,
      document.querySelector('.sidebar-control-slot .command-toolbar') !== null,
      document.querySelector('.characters-only-grid') !== null,
      document.querySelectorAll('.office-character').length === expectedVisibleCount,
      document.querySelectorAll('.office-character[title]').length === 0,
      document.querySelectorAll('.character-status-light').length === 0,
      document.querySelector('.side-panel .detail-card') !== null,
      document.querySelector('.side-panel .event-console') !== null
    ];
    if (checks.some(check => !check)) console.warn('YS Empire 10-point layout verification failed', checks);
  }

  function install() {
    if (typeof departments === 'undefined' || typeof renderDepartments !== 'function') return;
    renderDepartments = renderEverything;
    const originalSelectServer = selectServer;
    selectServer = function patchedSelectServer(id) {
      originalSelectServer(id);
      renderSidebar();
      renderCenter();
    };
    renderDepartments();
    bindFilterControls();
    requestAnimationFrame(verifyLayout);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
