(() => {
  'use strict';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const statusText = { waiting: '대기', running: '계산중', warning: '확인필요', done: '완료' };
  const preferredOrder = ['jbnu-owned', 'jbnu-hpc', 'jbnu-borrowed', 'ai', 'ewha', 'gpu-restricted', 'unist'];
  let activeDepartmentId = localStorage.getItem('ys-active-department') || 'jbnu-owned';

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
      return `<img src="assets/characters/${escapeHtml(server.avatar)}" alt="${escapeHtml(server.name)}" />`;
    }
    if (server.spriteGroup && typeof spriteStyle === 'function') {
      return `<span class="character-sprite" style="${spriteStyle(server)}" role="img" aria-label="${escapeHtml(server.name)}"></span>`;
    }
    return '<span class="worker-fallback">?</span>';
  }

  function ensureSidebar() {
    let sidebar = document.getElementById('serverOrgSidebar');
    if (sidebar) return sidebar;
    sidebar = document.createElement('aside');
    sidebar.id = 'serverOrgSidebar';
    sidebar.className = 'server-org-sidebar';
    const workspace = document.querySelector('.workspace');
    const main = document.querySelector('.org-map-panel');
    workspace.insertBefore(sidebar, main);
    return sidebar;
  }

  function renderSidebar() {
    const sidebar = ensureSidebar();
    const query = (document.getElementById('serverSearchInput')?.value || '').trim().toLowerCase();
    sidebar.innerHTML = `
      <div class="server-sidebar-header">
        <span class="eyebrow">SERVER ORGANIZATION</span>
        <h2>서버 조직도</h2>
        <p>부서를 선택하면 중앙 화면에 해당 부서만 표시됩니다.</p>
      </div>
      <nav class="server-org-nav">
        ${orderedDepartments().map(dept => {
          const servers = dept.servers || [];
          const matching = servers.filter(server => !query || `${server.id} ${server.name} ${server.project} ${server.job}`.toLowerCase().includes(query));
          const isActive = dept.id === activeDepartmentId;
          const counts = servers.reduce((acc, server) => {
            acc[server.status] = (acc[server.status] || 0) + 1;
            return acc;
          }, {});
          return `
            <section class="org-nav-group ${isActive ? 'active' : ''}" data-department-id="${escapeHtml(dept.id)}">
              <button class="org-department-btn" type="button" data-department-id="${escapeHtml(dept.id)}">
                <span><strong>${escapeHtml(dept.name)}</strong><small>${escapeHtml(dept.manager || '')}</small></span>
                <em>${servers.length}</em>
              </button>
              <div class="org-mini-status">
                ${counts.running ? `<span class="running">${counts.running} 계산중</span>` : ''}
                ${counts.warning ? `<span class="warning">${counts.warning} 확인</span>` : ''}
                ${counts.waiting ? `<span>${counts.waiting} 대기</span>` : ''}
              </div>
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
                ${query && !matching.length && !dept.restricted && !dept.empty ? '<div class="org-special-row">검색 결과 없음</div>' : ''}
              </div>
            </section>`;
        }).join('')}
      </nav>`;

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

  function workstationMarkup(server) {
    return `
      <button class="server-card compact-workstation ${selectedServerId === server.id ? 'selected' : ''}" type="button"
              data-server-id="${escapeHtml(server.id)}" data-status="${escapeHtml(server.status)}">
        <span class="compact-desk" aria-hidden="true"><i></i><b></b></span>
        <span class="compact-worker">${spriteMarkup(server)}</span>
        <span class="compact-label">
          <strong>${escapeHtml(server.id)}</strong>
          <small>${escapeHtml(server.name)}</small>
          <em>${escapeHtml(statusText[server.status] || '미확인')}</em>
        </span>
        <span class="compact-progress"><i style="width:${Number(server.progress) || 0}%"></i></span>
      </button>`;
  }

  function specialStage(dept) {
    if (dept.restricted) {
      return `<div class="special-stage"><div class="gpu-racks"><i></i><i></i></div><strong>glion1 · glion2</strong><p>GPU 전용 장비이므로 현재 조직에서 제외합니다.</p></div>`;
    }
    if (dept.empty) {
      return `<div class="special-stage"><div class="empty-desks"><i></i><i></i><i></i></div><strong>UNIST 확장 공간</strong><p>2026년 9월 직원과 서버가 입주할 예정입니다.</p></div>`;
    }
    return '';
  }

  function renderOffice() {
    const grid = document.getElementById('departmentGrid');
    const dept = currentDepartment();
    if (!grid || !dept) return;
    grid.className = 'department-grid compact-office-grid';
    grid.innerHTML = `
      <div class="compact-office-world">
        <header class="compact-office-header">
          <div><span class="eyebrow">ACTIVE DEPARTMENT</span><h2>${escapeHtml(dept.name)}</h2><p>${escapeHtml(dept.description || '')}</p></div>
          <span class="department-seat-count">${(dept.servers || []).length}석</span>
        </header>
        <section class="compact-command-zone">
          <div class="command-desk"></div>
          <img src="assets/characters/ceo-youngseop.png" alt="이영섭 대표" />
          <div><span>OWNER · COMMAND</span><strong>이영섭 대표</strong><small>선택 부서 지휘 중</small></div>
        </section>
        <section class="compact-department-floor">
          ${specialStage(dept) || `<div class="compact-workstation-grid">${(dept.servers || []).map(workstationMarkup).join('')}</div>`}
        </section>
        <section class="compact-tools-strip">
          <a href="research-tools.html#parserPanel"><span class="tool-character tool-character-logan"></span><strong>로건</strong><small>Output Parser</small></a>
          <a href="research-tools.html#siPanel"><span class="tool-character tool-character-sarah"></span><strong>세라</strong><small>SI Generator</small></a>
        </section>
      </div>`;
    grid.querySelectorAll('.compact-workstation').forEach(card => {
      card.addEventListener('click', () => selectServer(card.dataset.serverId));
    });
  }

  function renderCompactLayout() {
    document.body.classList.add('compact-office-mode');
    document.querySelector('.executive-row')?.classList.add('hidden-by-layout');
    document.querySelector('.office-tools-floor')?.classList.add('hidden-by-layout');
    document.querySelector('.connector.trunk')?.classList.add('hidden-by-layout');
    const heading = document.querySelector('.org-map-panel .panel-heading h2');
    const desc = document.querySelector('.org-map-panel .panel-heading p');
    if (heading) heading.textContent = '선택 부서 오피스';
    if (desc) desc.textContent = '전체 조직은 왼쪽 사이드바에서 선택하고, 중앙에는 한 부서만 표시합니다.';
    renderSidebar();
    renderOffice();
    if (typeof updateCounters === 'function') updateCounters();
    if (typeof populateServerSelect === 'function') populateServerSelect();
  }

  function installSearchSync() {
    const input = document.getElementById('serverSearchInput');
    if (!input || input.dataset.sidebarBound) return;
    input.dataset.sidebarBound = 'true';
    input.addEventListener('input', renderSidebar);
  }

  function install() {
    if (typeof departments === 'undefined' || typeof renderDepartments !== 'function') return;
    renderDepartments = renderCompactLayout;
    const originalSelectServer = selectServer;
    selectServer = function patchedSelectServer(id) {
      originalSelectServer(id);
      renderSidebar();
      renderOffice();
    };
    renderDepartments();
    installSearchSync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
