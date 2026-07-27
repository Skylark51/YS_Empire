(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  const sectorOrder = ['jbnu-owned', 'jbnu-hpc', 'jbnu-borrowed', 'ai', 'ewha', 'gpu-restricted', 'unist'];

  function stateLabel(status) {
    return ({ waiting: '대기', running: '계산중', warning: '확인필요', done: '완료' })[status] || '상태 미확인';
  }

  function spriteMarkup(server) {
    if (server.avatar) {
      return `<img src="assets/characters/${escapeHtml(server.avatar)}" alt="${escapeHtml(server.name)} ${escapeHtml(server.role)}" />`;
    }
    if (server.spriteGroup && typeof spriteStyle === 'function') {
      return `<span class="character-sprite sprite-${escapeHtml(server.spriteGroup)}" style="${spriteStyle(server)}" role="img" aria-label="${escapeHtml(server.name)} ${escapeHtml(server.role)}"></span>`;
    }
    return '<span class="iso-worker-fallback" aria-hidden="true">?</span>';
  }

  function stationMarkup(server, index) {
    const selected = typeof selectedServerId !== 'undefined' && selectedServerId === server.id;
    const row = Math.floor(index / 8);
    const offsetClass = row % 2 ? 'is-offset-row' : '';
    return `
      <button class="server-card iso-workstation ${offsetClass} ${selected ? 'selected' : ''}"
              type="button" data-server-id="${escapeHtml(server.id)}"
              data-status="${escapeHtml(server.status)}"
              aria-label="${escapeHtml(server.id)} ${escapeHtml(server.name)} 서버 상세 열기">
        <span class="iso-desk" aria-hidden="true">
          <i class="desk-top"></i><i class="desk-front"></i><i class="desk-side"></i>
          <i class="desk-monitor"><b></b></i><i class="desk-keyboard"></i><i class="desk-mug"></i>
        </span>
        <span class="employee-scene iso-employee-scene">
          <span class="monitor-glow"></span>
          ${spriteMarkup(server)}
          <span class="work-pulse"><i></i><i></i><i></i></span>
        </span>
        <span class="iso-chair" aria-hidden="true"></span>
        <span class="iso-station-tag">
          <strong>${escapeHtml(server.id)}</strong>
          <small>${escapeHtml(server.name)}</small>
          <em>${escapeHtml(stateLabel(server.status))}</em>
        </span>
        <span class="iso-search-text">${escapeHtml(`${server.role} ${server.project} ${server.job} ${server.purpose}`)}</span>
        <span class="iso-progress" aria-hidden="true"><i style="width:${Number(server.progress) || 0}%"></i></span>
      </button>`;
  }

  function normalSectorMarkup(department) {
    const servers = department.servers || [];
    return `
      <section class="department department-${escapeHtml(department.id)} iso-sector sector-${escapeHtml(department.id)}" data-sector="${escapeHtml(department.id)}">
        <header class="iso-sector-sign">
          <span>${escapeHtml(department.manager)}</span>
          <strong>${escapeHtml(department.name)}</strong>
          <small>${servers.length}석</small>
        </header>
        <div class="iso-desk-grid">${servers.map(stationMarkup).join('')}</div>
      </section>`;
  }

  function restrictedSectorMarkup(department) {
    return `
      <section class="department department-${escapeHtml(department.id)} iso-sector sector-${escapeHtml(department.id)} iso-equipment-sector" data-sector="${escapeHtml(department.id)}">
        <header class="iso-sector-sign"><span>${escapeHtml(department.manager)}</span><strong>${escapeHtml(department.name)}</strong><small>출입제한</small></header>
        <div class="iso-rack-room">
          <div class="iso-rack"><i></i><i></i><i></i><i></i></div>
          <strong>glion1 · glion2</strong><small>GPU 전용 장비 · 현재 사용 제외</small>
        </div>
      </section>`;
  }

  function emptySectorMarkup(department) {
    return `
      <section class="department department-${escapeHtml(department.id)} iso-sector sector-${escapeHtml(department.id)} iso-future-sector" data-sector="${escapeHtml(department.id)}">
        <header class="iso-sector-sign"><span>${escapeHtml(department.manager)}</span><strong>${escapeHtml(department.name)}</strong><small>2026.09</small></header>
        <div class="iso-empty-office">
          <span class="empty-desk"></span><span class="empty-desk"></span><span class="empty-desk"></span>
          <strong>UNIST 입주 예정</strong><small>직원과 서버가 들어올 확장 공간</small>
        </div>
      </section>`;
  }

  function sectorMarkup(department) {
    if (department.restricted) return restrictedSectorMarkup(department);
    if (department.empty) return emptySectorMarkup(department);
    return normalSectorMarkup(department);
  }

  function toolsSectorMarkup() {
    return `
      <section class="iso-sector sector-research-tools" data-sector="research-tools">
        <header class="iso-sector-sign"><span>RESEARCH TOOLS</span><strong>분석지원실</strong><small>2명 근무</small></header>
        <div class="iso-tool-workers">
          <a class="iso-tool-worker logan" href="research-tools.html#parserPanel">
            <span class="tool-character tool-character-logan" role="img" aria-label="Gaussian Output Parser 로건"></span>
            <span><strong>로건</strong><small>Output Parser</small><em>로그 분석 중</em></span>
          </a>
          <a class="iso-tool-worker sera" href="research-tools.html#siPanel">
            <span class="tool-character tool-character-sarah" role="img" aria-label="SI Generator 세라"></span>
            <span><strong>세라</strong><small>SI Generator</small><em>SI 정리 중</em></span>
          </a>
        </div>
      </section>`;
  }

  function officePropsMarkup() {
    return `
      <div class="iso-office-props" aria-hidden="true">
        <span class="prop-plant plant-a"></span><span class="prop-plant plant-b"></span>
        <span class="prop-cabinet cabinet-a"></span><span class="prop-cabinet cabinet-b"></span>
        <span class="prop-water"></span><span class="prop-printer"></span>
        <span class="prop-meeting-table"><i></i><i></i><i></i><i></i></span>
      </div>`;
  }

  function executiveMarkup(serverCount) {
    return `
      <section class="iso-executive-zone" aria-label="이영섭 대표 관제석">
        <div class="iso-ceo-desk" aria-hidden="true"><i class="ceo-monitor one"></i><i class="ceo-monitor two"></i><i class="ceo-console"></i></div>
        <div class="iso-ceo-character"><img src="assets/characters/ceo-youngseop.png" alt="사무실 전체 계산을 감독하는 이영섭 대표" /></div>
        <div class="iso-ceo-copy"><span>OWNER · COMMAND DESK</span><strong>이영섭 대표</strong><small>계산 배치 · 진행 감시 · 결과 검수</small></div>
        <div class="iso-ceo-counter"><strong>${serverCount}</strong><small>전체 좌석</small></div>
      </section>`;
  }

  function orderedDepartments() {
    const byId = new Map(departments.map(department => [department.id, department]));
    return sectorOrder.map(id => byId.get(id)).filter(Boolean);
  }

  function officeSignature() {
    return departments.flatMap(department => department.servers || []).map(server => server.id).join('|');
  }

  function bindStations(grid) {
    grid.querySelectorAll('.iso-workstation').forEach(station => {
      station.addEventListener('click', () => selectServer(station.dataset.serverId));
    });
  }

  function updateStations(grid) {
    departments.forEach(department => {
      (department.servers || []).forEach(server => {
        const station = grid.querySelector(`.iso-workstation[data-server-id="${CSS.escape(server.id)}"]`);
        if (!station) return;
        station.dataset.status = server.status;
        station.classList.toggle('selected', typeof selectedServerId !== 'undefined' && selectedServerId === server.id);
        const tag = station.querySelector('.iso-station-tag em');
        if (tag) tag.textContent = stateLabel(server.status);
        const progress = station.querySelector('.iso-progress i');
        if (progress) progress.style.width = `${Number(server.progress) || 0}%`;
        const search = station.querySelector('.iso-search-text');
        if (search) search.textContent = `${server.role} ${server.project} ${server.job} ${server.purpose}`;
      });
    });
  }

  function renderIsometricDepartments() {
    const grid = document.getElementById('departmentGrid');
    if (!grid) return;
    const signature = officeSignature();
    const existing = grid.querySelector('.isometric-office-world');
    if (existing && existing.dataset.signature === signature) {
      updateStations(grid);
      if (typeof updateCounters === 'function') updateCounters();
      if (typeof populateServerSelect === 'function') populateServerSelect();
      return;
    }

    const serverCount = typeof allServers === 'function' ? allServers().length : departments.flatMap(department => department.servers || []).length;
    grid.className = 'department-grid isometric-department-grid';
    grid.innerHTML = `
      <div class="isometric-office-world" data-signature="${escapeHtml(signature)}">
        <div class="iso-back-wall" aria-hidden="true">
          <span class="wall-logo">YS LAB</span>
          <span class="wall-window window-one"></span><span class="wall-window window-two"></span><span class="wall-window window-three"></span>
          <span class="wall-clock"></span><span class="wall-board">GAUSSIAN<br>COMPUTE FLOOR</span>
        </div>
        <div class="iso-side-wall" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="iso-floor-plane" aria-hidden="true"></div>
        ${officePropsMarkup()}
        ${executiveMarkup(serverCount)}
        <div class="iso-office-layout">
          ${orderedDepartments().map(sectorMarkup).join('')}
          ${toolsSectorMarkup()}
        </div>
        <div class="iso-floor-legend"><span><i class="dot running"></i>계산중</span><span><i class="dot waiting"></i>대기</span><span><i class="dot warning"></i>확인필요</span><span><i class="dot done"></i>완료</span></div>
      </div>`;
    bindStations(grid);
    updateStations(grid);
    if (typeof updateCounters === 'function') updateCounters();
    if (typeof populateServerSelect === 'function') populateServerSelect();
  }

  function configurePage() {
    document.body.classList.add('isometric-office-mode');
    const heading = $('.org-map-panel .panel-heading h2');
    const description = $('.org-map-panel .panel-heading p');
    const empty = document.getElementById('emptyDetail');
    if (heading) heading.textContent = '영섭랜드 픽셀 오피스';
    if (description) description.textContent = '사무실 안 직원과 책상을 클릭하면 담당 Lion 노드와 현재 Gaussian 계산을 확인할 수 있습니다.';
    if (empty) empty.textContent = '픽셀 오피스에서 직원을 클릭하면 서버와 계산 상세 정보가 표시됩니다.';
    $('.executive-row')?.setAttribute('aria-hidden', 'true');
    $('.office-tools-floor')?.setAttribute('aria-hidden', 'true');
  }

  function install() {
    if (typeof departments === 'undefined' || typeof renderDepartments !== 'function') return;
    configurePage();
    renderDepartments = renderIsometricDepartments;
    renderDepartments();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
