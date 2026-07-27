(() => {
  'use strict';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  const statusText = { waiting: '대기', running: '계산중', warning: '확인필요', done: '완료' };
  const departmentOrder = ['jbnu-owned', 'jbnu-hpc', 'jbnu-borrowed', 'ai', 'ewha', 'gpu-restricted', 'unist'];
  const speechPools = {
    running: ['계산 진행 중입니다.', '출력 파일을 확인하고 있습니다.', '수렴 상태를 점검 중입니다.', '조금만 더 계산하겠습니다.'],
    waiting: ['다음 계산을 기다리고 있습니다.', '입력 파일을 준비해 주세요.', '현재 대기 중입니다.', '새 업무를 확인하겠습니다.'],
    warning: ['검수가 필요합니다.', '계산 상태를 확인해 주세요.', '출력에 이상 징후가 있습니다.', '직접 확인이 필요합니다.'],
    done: ['계산이 완료됐습니다.', '결과 검토를 기다립니다.', '작업을 마쳤습니다.', '다음 업무를 받을 수 있습니다.']
  };
  const ownerSpeech = ['전체 계산 현황을 확인한다.', '우선순위를 다시 정리하자.', '완료된 결과부터 검수한다.', '서버 배치를 조정하자.'];
  const toolSpeech = {
    logan: ['Output을 분석 중입니다.', '에너지와 구조를 정리합니다.', '핵심 계산값을 추출합니다.', '오류 문맥을 확인합니다.'],
    sera: ['SI 초안을 정리합니다.', '표와 좌표를 정돈합니다.', '계산 조건을 확인합니다.', '문서 형식을 맞추고 있습니다.']
  };

  let activeFilter = 'all';
  let speechIntervalId = null;
  let speechHideTimeoutId = null;

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

  function speechPoolAttribute(messages) {
    return escapeHtml(messages.join('||'));
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
    document.querySelector('.topbar')?.classList.add('layout-hidden');
  }

  function renderSidebar() {
    const nav = document.getElementById('serverOrgNav');
    if (!nav) return;

    nav.innerHTML = orderedDepartments().map(department => {
      const servers = (department.servers || []).filter(server => matchesFilter(server, department));
      return `
        <section class="sidebar-department">
          <div class="sidebar-department-heading">
            <span><strong>${escapeHtml(department.name)}</strong><small>${escapeHtml(department.manager || '')}</small></span>
            <em>${(department.servers || []).length}</em>
          </div>
          ${department.restricted ? '<div class="sidebar-special">glion1 · glion2 · GPU 사용 제외</div>' : ''}
          ${department.empty ? '<div class="sidebar-special">UNIST · 2026.09 입주 예정</div>' : ''}
          <div class="sidebar-server-list">
            ${servers.map(server => `
              <button type="button" class="sidebar-server ${selectedServerId === server.id ? 'selected' : ''}" data-server-id="${escapeHtml(server.id)}">
                <i class="dot ${escapeHtml(server.status)}"></i>
                <span><strong>${escapeHtml(server.id)} · ${escapeHtml(server.name)}</strong><small>${escapeHtml(server.job || '할당된 계산 없음')}</small></span>
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
    const pool = speechPools[server.status] || speechPools.waiting;
    return `
      <button type="button" class="office-character talking-character ${selectedServerId === server.id ? 'selected' : ''}"
              data-server-id="${escapeHtml(server.id)}" data-speech-pool="${speechPoolAttribute(pool)}"
              aria-label="${escapeHtml(server.id)} ${escapeHtml(server.name)} 서버 선택">
        <span class="speech-bubble" aria-hidden="true"></span>
        <span class="character-body">${spriteMarkup(server)}</span>
        <span class="character-name"><strong>${escapeHtml(server.name)}</strong><small>${escapeHtml(server.id)}</small></span>
      </button>`;
  }

  function departmentPartitionMarkup(department) {
    const servers = (department.servers || []).filter(server => matchesFilter(server, department));
    if (department.restricted || department.empty || !servers.length) return '';
    return `
      <section class="department-partition" data-department-id="${escapeHtml(department.id)}">
        <header class="partition-title"><strong>${escapeHtml(department.name)}</strong><span>${servers.length}명</span></header>
        <div class="partition-character-grid">${servers.map(characterMarkup).join('')}</div>
      </section>`;
  }

  function renderCenter() {
    const grid = document.getElementById('departmentGrid');
    if (!grid) return;

    grid.className = 'department-grid characters-only-grid';
    grid.innerHTML = `
      <div class="character-office-world" aria-label="영섭랜드 픽셀 캐릭터 오피스">
        <section class="owner-partition">
          <div class="owner-character talking-character" data-speech-pool="${speechPoolAttribute(ownerSpeech)}">
            <span class="speech-bubble" aria-hidden="true"></span>
            <img src="assets/characters/ceo-youngseop.png" alt="이영섭 대표" />
            <span class="character-name"><strong>이영섭</strong><small>대표</small></span>
          </div>
        </section>
        <div class="department-partition-grid">
          ${orderedDepartments().map(departmentPartitionMarkup).join('')}
          <section class="department-partition research-partition">
            <header class="partition-title"><strong>분석지원실</strong><span>2명</span></header>
            <div class="partition-character-grid research-grid">
              <a class="office-character tool-office-character talking-character" href="research-tools.html#parserPanel" data-speech-pool="${speechPoolAttribute(toolSpeech.logan)}" aria-label="로건 Gaussian Output Parser">
                <span class="speech-bubble" aria-hidden="true"></span><span class="tool-character tool-character-logan"></span><span class="character-name"><strong>로건</strong><small>Output Parser</small></span>
              </a>
              <a class="office-character tool-office-character talking-character" href="research-tools.html#siPanel" data-speech-pool="${speechPoolAttribute(toolSpeech.sera)}" aria-label="세라 SI Generator">
                <span class="speech-bubble" aria-hidden="true"></span><span class="tool-character tool-character-sarah"></span><span class="character-name"><strong>세라</strong><small>SI Generator</small></span>
              </a>
            </div>
          </section>
        </div>
      </div>`;

    grid.querySelectorAll('.office-character[data-server-id]').forEach(character => {
      character.addEventListener('click', () => selectServer(character.dataset.serverId));
    });
    startSpeechCycle();
  }

  function showSpeechBubbles() {
    const characters = [...document.querySelectorAll('.talking-character')];
    characters.forEach(character => character.classList.remove('speaking'));
    if (!characters.length) return;

    const shuffled = characters.sort(() => Math.random() - 0.5);
    const count = Math.min(Math.max(1, Math.ceil(characters.length / 7)), 4);
    shuffled.slice(0, count).forEach(character => {
      const pool = (character.dataset.speechPool || '').split('||').filter(Boolean);
      const bubble = character.querySelector('.speech-bubble');
      if (!bubble || !pool.length) return;
      bubble.textContent = pool[Math.floor(Math.random() * pool.length)];
      character.classList.add('speaking');
    });

    window.clearTimeout(speechHideTimeoutId);
    speechHideTimeoutId = window.setTimeout(() => {
      document.querySelectorAll('.talking-character.speaking').forEach(character => character.classList.remove('speaking'));
    }, 2400);
  }

  function startSpeechCycle() {
    window.clearInterval(speechIntervalId);
    window.clearTimeout(speechHideTimeoutId);
    window.setTimeout(showSpeechBubbles, 700);
    speechIntervalId = window.setInterval(showSpeechBubbles, 5000);
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
      search.addEventListener('input', () => { renderSidebar(); renderCenter(); });
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
    const checks = [
      document.querySelector('.topbar')?.classList.contains('layout-hidden'),
      document.querySelector('.workspace')?.children[0]?.id === 'serverOrgSidebar',
      document.querySelector('.department-partition-grid') !== null,
      document.querySelectorAll('.department-partition').length > 1,
      document.querySelectorAll('.character-desk').length === 0,
      document.querySelectorAll('.owner-desk').length === 0,
      document.querySelectorAll('.office-back-wall').length === 0,
      document.querySelectorAll('.office-props').length === 0,
      document.querySelectorAll('.office-character .character-name').length > 0,
      document.querySelectorAll('.talking-character .speech-bubble').length > 0
    ];
    if (checks.some(check => !check)) console.warn('YS Empire layout verification failed', checks);
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
