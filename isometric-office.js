(() => {
  'use strict';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

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

  let speechIntervalId = null;
  let speechHideTimeoutId = null;

  function orderedDepartments() {
    const byId = new Map(departments.map(department => [department.id, department]));
    return [
      ...departmentOrder.map(id => byId.get(id)).filter(Boolean),
      ...departments.filter(department => !departmentOrder.includes(department.id))
    ];
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
    document.body.classList.add('characters-only-layout', 'no-server-org');

    const workspace = document.querySelector('.workspace');
    const center = document.querySelector('.org-map-panel');
    const right = document.querySelector('.side-panel');
    if (!workspace || !center || !right) return;

    document.getElementById('serverOrgSidebar')?.remove();

    let dock = document.getElementById('officeControlDock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'officeControlDock';
      dock.className = 'office-control-dock';
      dock.setAttribute('aria-label', '영섭랜드 빠른 조작');
      center.appendChild(dock);
    }

    const connection = document.querySelector('.connection-cluster');
    const status = document.querySelector('.status-strip');
    const addTask = document.getElementById('addTaskBtn');
    if (connection && !dock.contains(connection)) dock.appendChild(connection);
    if (status && !dock.contains(status)) dock.appendChild(status);
    if (addTask && !dock.contains(addTask)) dock.appendChild(addTask);

    const eventConsole = document.querySelector('.event-console');
    if (eventConsole && !right.contains(eventConsole)) right.appendChild(eventConsole);

    document.querySelector('.topbar')?.classList.add('layout-hidden');
    document.querySelector('.panel-heading')?.remove();
    document.querySelector('.command-toolbar')?.remove();
    document.querySelector('.executive-row')?.remove();
    document.querySelector('.office-tools-floor')?.remove();
    document.querySelector('.connector.trunk')?.remove();
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
    const servers = department.servers || [];
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
    renderCenter();
    if (typeof updateCounters === 'function') updateCounters();
    if (typeof populateServerSelect === 'function') populateServerSelect();
  }

  function verifyLayout() {
    const checks = [
      document.getElementById('serverOrgSidebar') === null,
      document.querySelector('.workspace')?.children[0]?.classList.contains('org-map-panel'),
      document.querySelector('.character-office-world') !== null,
      document.querySelector('.org-map-panel')?.getBoundingClientRect().top === 0,
      document.querySelector('.office-control-dock') !== null
    ];
    if (checks.some(check => !check)) console.warn('YS Empire layout verification failed', checks);
  }

  function install() {
    if (typeof departments === 'undefined' || typeof renderDepartments !== 'function') return;
    renderDepartments = renderEverything;
    const originalSelectServer = selectServer;
    selectServer = function patchedSelectServer(id) {
      originalSelectServer(id);
      renderCenter();
    };
    renderDepartments();
    requestAnimationFrame(verifyLayout);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
