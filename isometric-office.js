(() => {
  'use strict';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const statusText = { waiting: '대기', running: '계산중', warning: '확인필요', done: '완료' };
  const preferredOrder = ['jbnu-owned', 'jbnu-hpc', 'jbnu-borrowed', 'ai', 'ewha', 'gpu-restricted', 'unist'];
  let activeDepartmentId = localStorage.getItem('ys-active-department') || 'jbnu-owned';
  let sidebarQuery = '';

  function orderedDepartments() {
    const map = new Map(departments.map(dept => [dept.id, dept]));
    return [
      ...preferredOrder.map(id => map.get(id)).filter(Boolean),
      ...departments.filter(dept => !preferredOrder.includes(dept.id))
    ];
  }

  function currentDepartment() {
    const ordered = orderedDepartments();
    return ordered.find(dept => dept.id === activeDepartmentId) || ordered[0];
  }

  function spriteMarkup(server) {
    if (server.avatar) {
      return `<img src="assets/characters/${escapeHtml(server.avatar)}" alt="" />`;
    }
    if (server.spriteGroup && typeof spriteStyle === 'function') {
      return `<span class="character-sprite" style="${spriteStyle(server)}" aria-hidden="true"></span>`;
    }
    return '<span class="worker-fallback" aria-hidden="true">?</span>';
  }

  function ensureSidebar() {
    let sidebar = document.getElementById('serverOrgSidebar');
    if (sidebar) return sidebar;
    sidebar = document.createElement('aside');
    sidebar.id = 'serverOrgSidebar';
    sidebar.className = 'server-org-sidebar';
    const workspace = document.querySelector('.workspace');
    const center = document.querySelector('.org-map-panel');
    workspace.insertBefore(sidebar, center);
    return sidebar;
  }

  function renderSidebar() {
    const sidebar = ensureSidebar();
    sidebar.innerHTML = `
      <div class="server-sidebar-header">
        <span class="eyebrow">SERVER ORGANIZATION</span>
        <h2>서버 조직도</h2>
        <label class="sidebar-search">
          <span>⌕</span>
          <input id="sidebarServerSearch" type="search" value="${escapeHtml(sidebarQuery)}" placeholder="서버·계산 검색" autocomplete="off" />
        </label>
      </div>
      <nav class="server-org-nav">
        ${orderedDepartments().map(dept => {
          const servers = dept.servers || [];
          const matching = servers.filter(server => !sidebarQuery || `${server.id} ${server.name} ${server.project} ${server.job}`.toLowerCase().includes(sidebarQuery));
          const active = dept.id === activeDepartmentId;
          return `
            <section class="org-nav-group ${active ? 'active' : ''}">
              <button class="org-department-btn" type="button" data-department-id="${escapeHtml(dept.id)}">
                <span><strong>${escapeHtml(dept.name)}</strong><small>${escapeHtml(dept.manager || '')}</small></span>
                <em>${servers.length}</em>
              </button>
              <div class="org-server-list">
                ${dept.restricted ? '<div class="org-special-row">glion1 · glion2 · 사용 제외</div>' : ''}
                ${dept.empty ? '<div class="org-special-row">2026.09 입주 예정</div>' : ''}
                ${matching.map(server => `
                  <button class="org-server-row ${selectedServerId === server.id ? 'selected' : ''}" type="button"
                          data-server-id="${escapeHtml(server.id)}" data-department-id="${escapeHtml(dept.id)}">
                    <i class="dot ${escapeHtml(server.status)}"></i>
                    <span><strong>${escapeHtml(server.id)}</strong><small>${escapeHtml(server.name)}</small></span>
                    <em>${escapeHtml(statusText[server.status] || '미확인')}</em>
                  </button>`).join('')}
                ${sidebarQuery && !matching.length && !dept.restricted && !dept.empty ? '<div class="org-special-row">검색 결과 없음</div>' : ''}
              </div>
            </section>`;
        }).join('')}
      </nav>`;

    sidebar.querySelector('#sidebarServerSearch')?.addEventListener('input', event => {
      sidebarQuery = event.target.value.trim().toLowerCase();
      renderSidebar();
      requestAnimationFrame(() => {
        const input = document.getElementById('sidebarServerSearch');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    });

    sidebar.querySelectorAll('.org-department-btn').forEach(button => {
      button.addEventListener('click', () => {
        activeDepartmentId = button.dataset.departmentId;
        localStorage.setItem('ys-active-department', activeDepartmentId);
        renderDepartments();
      });
    });

    sidebar.querySelectorAll('.org-server-row').forEach(button => {
      button.addEventListener('click', () => {
        activeDepartmentId = button.dataset.departmentId;
        localStorage.setItem('ys-active-department', activeDepartmentId);
        selectServer(button.dataset.serverId);
      });
    });
  }

  function characterSeat(server, index) {
    const selected = selectedServerId === server.id;
    const title = `${server.id} · ${server.name} · ${statusText[server.status] || '미확인'} · ${server.job || ''}`;
    return `
      <button class="character-seat ${selected ? 'selected' : ''}" type="button"
              data-server-id="${escapeHtml(server.id)}" data-status="${escapeHtml(server.status)}"
              title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"
              style="--seat-delay:${(index % 7) * -0.18}s">
        <span class="pixel-desk" aria-hidden="true"><i></i><b></b></span>
        <span class="pixel-chair" aria-hidden="true"></span>
        <span class="pixel-worker">${spriteMarkup(server)}</span>
        <i class="seat-status-lamp ${escapeHtml(server.status)}" aria-hidden="true"></i>
      </button>`;
  }

  function emptyStage(dept) {
    if (dept.restricted) {
      return '<div class="character-empty-stage"><span class="silent-rack"></span><span class="silent-rack"></span></div>';
    }
    if (dept.empty) {
      return '<div class="character-empty-stage"><span class="silent-desk"></span><span class="silent-desk"></span><span class="silent-desk"></span></div>';
    }
    return '';
  }

  function renderCharacterOffice() {
    const grid = document.getElementById('departmentGrid');
    const dept = currentDepartment();
    if (!grid || !dept) return;
    grid.className = 'department-grid character-office-grid';
    grid.innerHTML = `
      <div class="character-office-world">
        <div class="office-wall" aria-hidden="true">
          <span class="office-window one"></span>
          <span class="office-window two"></span>
          <span class="office-clock"></span>
        </div>
        <div class="office-floor" aria-hidden="true"></div>
        <button class="ceo-character-seat" type="button" title="이영섭 대표" aria-label="이영섭 대표">
          <span class="ceo-desk" aria-hidden="true"></span>
          <img src="assets/characters/ceo-youngseop.png" alt="" />
        </button>
        <section class="character-only-floor" aria-label="선택 부서 캐릭터">
          ${emptyStage(dept) || `<div class="character-seat-grid">${(dept.servers || []).map(characterSeat).join('')}</div>`}
        </section>
        <div class="tool-character-corner">
          <a href="research-tools.html#parserPanel" title="로건 · Gaussian Output Parser" aria-label="로건 · Gaussian Output Parser"><span class="tool-character tool-character-logan"></span></a>
          <a href="research-tools.html#siPanel" title="세라 · SI Generator" aria-label="세라 · SI Generator"><span class="tool-character tool-character-sarah"></span></a>
        </div>
      </div>`;

    grid.querySelectorAll('.character-seat').forEach(seat => {
      seat.addEventListener('click', () => selectServer(seat.dataset.serverId));
    });
  }

  function renderLayout() {
    document.body.classList.add('character-office-mode');
    document.querySelector('.panel-heading')?.classList.add('hidden-by-layout');
    document.querySelector('.command-toolbar')?.classList.add('hidden-by-layout');
    document.querySelector('.executive-row')?.classList.add('hidden-by-layout');
    document.querySelector('.office-tools-floor')?.classList.add('hidden-by-layout');
    document.querySelector('.connector.trunk')?.classList.add('hidden-by-layout');
    renderSidebar();
    renderCharacterOffice();
    if (typeof updateCounters === 'function') updateCounters();
    if (typeof populateServerSelect === 'function') populateServerSelect();
  }

  function install() {
    if (typeof departments === 'undefined' || typeof renderDepartments !== 'function') return;
    renderDepartments = renderLayout;
    const originalSelectServer = selectServer;
    selectServer = function patchedSelectServer(id) {
      originalSelectServer(id);
      renderSidebar();
      renderCharacterOffice();
    };
    renderDepartments();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
