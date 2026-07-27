(() => {
  'use strict';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const sectorOrder = ['jbnu-owned', 'jbnu-hpc', 'jbnu-borrowed', 'jbnu', 'ai', 'ewha', 'gpu-restricted', 'reserve', 'unist'];
  const stateMap = { waiting: '대기', running: '계산중', warning: '확인필요', done: '완료' };

  function stateLabel(status) {
    return stateMap[status] || '상태 미확인';
  }

  function bodyReady() {
    document.body.classList.add('isometric-office-mode');
    const heading = document.querySelector('.org-map-panel .panel-heading h2');
    const description = document.querySelector('.org-map-panel .panel-heading p');
    const legend = document.querySelector('.org-map-panel .legend');
    const executive = document.querySelector('.executive-row');
    const trunk = document.querySelector('.connector.trunk');
    if (heading) heading.textContent = '영섭랜드 중앙 오피스';
    if (description) description.textContent = '직원 자리를 클릭하면 서버와 계산 상세가 오른쪽 패널에 표시됩니다.';
    if (legend) legend.style.display = 'none';
    if (executive) executive.style.display = 'none';
    if (trunk) trunk.style.display = 'none';
  }

  function spriteMarkup(server) {
    if (server.avatar) {
      return `<img src="assets/characters/${escapeHtml(server.avatar)}" alt="${escapeHtml(server.name)} ${escapeHtml(server.role || '')}" />`;
    }
    if (server.spriteGroup && typeof spriteStyle === 'function') {
      return `<span class="character-sprite sprite-${escapeHtml(server.spriteGroup)}" style="${spriteStyle(server)}" role="img" aria-label="${escapeHtml(server.name)} ${escapeHtml(server.role || '')}"></span>`;
    }
    return '<span class="iso-worker-fallback" aria-hidden="true">?</span>';
  }

  function stationMarkup(server, index) {
    const selected = typeof selectedServerId !== 'undefined' && selectedServerId === server.id;
    const stagger = index % 2 ? 'stagger' : '';
    return `
      <button class="server-card iso-workstation ${stagger} ${selected ? 'selected' : ''}" type="button"
              data-server-id="${escapeHtml(server.id)}" data-status="${escapeHtml(server.status || 'waiting')}"
              aria-label="${escapeHtml(server.id)} ${escapeHtml(server.name)} 서버 상세 열기">
        <span class="iso-shadow" aria-hidden="true"></span>
        <span class="iso-desk" aria-hidden="true">
          <i class="desk-top"></i>
          <i class="desk-front"></i>
          <i class="desk-side"></i>
          <i class="desk-mat"></i>
          <i class="desk-keyboard"></i>
          <i class="desk-paper paper-one"></i>
          <i class="desk-paper paper-two"></i>
        </span>
        <span class="iso-chair" aria-hidden="true"></span>
        <span class="employee-scene iso-employee-scene">
          ${spriteMarkup(server)}
          <span class="work-pulse"><i></i><i></i><i></i></span>
        </span>
        <span class="iso-station-tag">
          <strong>${escapeHtml(server.id)}</strong>
          <small>${escapeHtml(server.name)}</small>
          <em>${escapeHtml(stateLabel(server.status))}</em>
        </span>
        <span class="iso-search-text">${escapeHtml(`${server.role || ''} ${server.project || ''} ${server.job || ''} ${server.purpose || ''}`)}</span>
        <span class="iso-progress" aria-hidden="true"><i style="width:${Number(server.progress) || 0}%"></i></span>
      </button>`;
  }

  function sectorMarkup(department, className) {
    if (department.restricted) {
      return `
        <section class="department iso-sector ${className} iso-equipment-sector" data-sector="${escapeHtml(department.id)}">
          <header class="iso-sector-sign"><span>${escapeHtml(department.manager || '')}</span><strong>${escapeHtml(department.name)}</strong><small>출입 제한</small></header>
          <div class="iso-rack-room">
            <div class="iso-rack"><i></i><i></i><i></i></div>
            <strong>glion1 · glion2</strong>
            <small>GPU 장비 구역</small>
          </div>
        </section>`;
    }

    if (department.empty) {
      return `
        <section class="department iso-sector ${className} iso-future-sector" data-sector="${escapeHtml(department.id)}">
          <header class="iso-sector-sign"><span>${escapeHtml(department.manager || '')}</span><strong>${escapeHtml(department.name)}</strong><small>확장 예정</small></header>
          <div class="iso-empty-office">
            <span class="empty-desk"></span><span class="empty-desk"></span><span class="empty-desk"></span>
            <strong>UNIST 확장 공간</strong>
            <small>추후 배치 예정</small>
          </div>
        </section>`;
    }

    return `
      <section class="department iso-sector ${className}" data-sector="${escapeHtml(department.id)}">
        <header class="iso-sector-sign">
          <span>${escapeHtml(department.manager || '')}</span>
          <strong>${escapeHtml(department.name)}</strong>
          <small>${(department.servers || []).length}석</small>
        </header>
        <div class="iso-desk-grid">${(department.servers || []).map(stationMarkup).join('')}</div>
      </section>`;
  }

  function toolsRoomMarkup() {
    return `
      <section class="iso-sector iso-tools-room" data-sector="research-tools">
        <header class="iso-sector-sign"><span>RESEARCH TOOLS</span><strong>분석지원실</strong><small>2명 근무</small></header>
        <div class="iso-tools-grid">
          <a class="iso-tool-seat logan" href="research-tools.html#parserPanel" aria-label="로건 작업실 열기">
            <span class="iso-shadow" aria-hidden="true"></span>
            <span class="iso-desk tool-desk" aria-hidden="true">
              <i class="desk-top"></i><i class="desk-front"></i><i class="desk-side"></i>
              <i class="desk-mat"></i><i class="desk-keyboard"></i><i class="desk-paper paper-one"></i>
            </span>
            <span class="iso-chair" aria-hidden="true"></span>
            <span class="tool-worker tool-character tool-character-logan" role="img" aria-label="로건"></span>
            <span class="tool-seat-copy"><strong>로건</strong><small>Gaussian Output Parser</small><em>로그 분석 중</em></span>
          </a>
          <a class="iso-tool-seat sera" href="research-tools.html#siPanel" aria-label="세라 작업실 열기">
            <span class="iso-shadow" aria-hidden="true"></span>
            <span class="iso-desk tool-desk" aria-hidden="true">
              <i class="desk-top"></i><i class="desk-front"></i><i class="desk-side"></i>
              <i class="desk-mat"></i><i class="desk-keyboard"></i><i class="desk-paper paper-two"></i>
            </span>
            <span class="iso-chair" aria-hidden="true"></span>
            <span class="tool-worker tool-character tool-character-sarah" role="img" aria-label="세라"></span>
            <span class="tool-seat-copy"><strong>세라</strong><small>SI Generator</small><em>SI 정리 중</em></span>
          </a>
        </div>
      </section>`;
  }

  function executiveMarkup(serverCount) {
    return `
      <section class="iso-executive-zone" aria-label="이영섭 대표 관제석">
        <div class="iso-ceo-platform" aria-hidden="true"></div>
        <div class="iso-ceo-copy">
          <span>OWNER · CENTRAL COMMAND</span>
          <strong>이영섭 대표</strong>
          <small>계산 배치 · 진행 감시 · 결과 검수</small>
        </div>
        <div class="iso-ceo-character"><img src="assets/characters/ceo-youngseop.png" alt="상단 중앙 관제석의 이영섭 대표" /></div>
        <div class="iso-ceo-status"><strong>${serverCount}</strong><small>전체 좌석</small></div>
      </section>`;
  }

  function officePropsMarkup() {
    return `
      <div class="iso-office-props" aria-hidden="true">
        <span class="wall-window window-one"></span>
        <span class="wall-window window-two"></span>
        <span class="wall-window window-three"></span>
        <span class="wall-board">YS EMPIRE<br>CONTROL FLOOR</span>
        <span class="wall-clock"></span>
        <span class="prop-plant plant-a"></span>
        <span class="prop-plant plant-b"></span>
        <span class="prop-cabinet cabinet-a"></span>
        <span class="prop-water"></span>
        <span class="prop-meeting-table"><i></i><i></i><i></i><i></i></span>
      </div>`;
  }

  function orderedDepartments() {
    const byId = new Map((departments || []).map(dept => [dept.id, dept]));
    const ordered = sectorOrder.map(id => byId.get(id)).filter(Boolean);
    const remaining = (departments || []).filter(dept => !sectorOrder.includes(dept.id));
    return [...ordered, ...remaining];
  }

  function buildSectors() {
    const list = orderedDepartments();
    return list.map((department, index) => sectorMarkup(department, `sector-slot-${index + 1}`)).join('');
  }

  function officeSignature() {
    return (departments || []).flatMap(dept => dept.servers || []).map(server => server.id).join('|');
  }

  function bindStations(grid) {
    grid.querySelectorAll('.iso-workstation').forEach(el => {
      el.addEventListener('click', () => {
        if (typeof selectServer === 'function') selectServer(el.dataset.serverId);
      });
    });
  }

  function updateStations(grid) {
    (departments || []).forEach(dept => {
      (dept.servers || []).forEach(server => {
        const node = grid.querySelector(`.iso-workstation[data-server-id="${CSS.escape(server.id)}"]`);
        if (!node) return;
        node.dataset.status = server.status || 'waiting';
        node.classList.toggle('selected', typeof selectedServerId !== 'undefined' && selectedServerId === server.id);
        const tag = node.querySelector('.iso-station-tag em');
        if (tag) tag.textContent = stateLabel(server.status);
        const prog = node.querySelector('.iso-progress i');
        if (prog) prog.style.width = `${Number(server.progress) || 0}%`;
        const search = node.querySelector('.iso-search-text');
        if (search) search.textContent = `${server.role || ''} ${server.project || ''} ${server.job || ''} ${server.purpose || ''}`;
      });
    });
  }

  function renderIsometricDepartments() {
    const grid = document.getElementById('departmentGrid');
    if (!grid || typeof departments === 'undefined') return;
    bodyReady();
    const signature = officeSignature();
    const existing = grid.querySelector('.isometric-office-world');
    if (existing && existing.dataset.signature === signature) {
      updateStations(grid);
      return;
    }

    const serverCount = typeof allServers === 'function' ? allServers().length : (departments || []).flatMap(d => d.servers || []).length;
    grid.className = 'department-grid isometric-department-grid';
    grid.innerHTML = `
      <div class="isometric-office-world" data-signature="${escapeHtml(signature)}">
        <div class="iso-back-wall"><span class="wall-logo">YS EMPIRE</span></div>
        <div class="iso-side-wall"></div>
        <div class="iso-floor-plane"></div>
        ${officePropsMarkup()}
        ${executiveMarkup(serverCount)}
        <div class="iso-office-layout">
          ${buildSectors()}
          ${toolsRoomMarkup()}
        </div>
        <div class="iso-floor-legend"><span><i class="dot running"></i>계산중</span><span><i class="dot waiting"></i>대기</span><span><i class="dot warning"></i>확인필요</span><span><i class="dot done"></i>완료</span></div>
      </div>`;

    bindStations(grid);
    if (typeof updateCounters === 'function') updateCounters();
    if (typeof populateServerSelect === 'function') populateServerSelect();
  }

  const originalRenderDepartments = typeof renderDepartments === 'function' ? renderDepartments : null;
  if (originalRenderDepartments) {
    renderDepartments = function patchedRenderDepartments() {
      originalRenderDepartments();
      renderIsometricDepartments();
    };
  } else {
    document.addEventListener('DOMContentLoaded', renderIsometricDepartments, { once: true });
  }

  const originalSelectServer = typeof selectServer === 'function' ? selectServer : null;
  if (originalSelectServer) {
    selectServer = function patchedSelectServer(id) {
      originalSelectServer(id);
      const grid = document.getElementById('departmentGrid');
      if (grid) updateStations(grid);
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderIsometricDepartments, { once: true });
  } else {
    renderIsometricDepartments();
  }
})();
