(() => {
  'use strict';

  const ENDPOINT_KEY = 'ys-agent-endpoint';
  const POLL_KEY = 'ys-agent-poll';
  const PERSISTED_TOKEN_KEY = 'ys-agent-token-persisted';
  const SESSION_TOKEN_KEY = 'ys-agent-token';
  const DEFAULT_ENDPOINT = 'http://127.0.0.1:8765';
  const DEFAULT_POLL = '10000';

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashToken = hash.get('ys_token');
  const hashEndpoint = hash.get('ys_endpoint');
  const hashPoll = hash.get('ys_poll');
  const shouldForget = hash.get('ys_forget') === '1';

  function cleanAddressBar() {
    if (!window.location.hash) return;
    history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  }

  function forgetConnection() {
    localStorage.removeItem(PERSISTED_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    cleanAddressBar();
  }

  function rememberConnection(token, endpoint, poll) {
    const cleanToken = String(token || '').trim();
    if (!cleanToken) return false;

    localStorage.setItem(ENDPOINT_KEY, String(endpoint || DEFAULT_ENDPOINT).trim().replace(/\/+$/, ''));
    localStorage.setItem(POLL_KEY, String(poll || DEFAULT_POLL));
    localStorage.setItem(PERSISTED_TOKEN_KEY, cleanToken);
    sessionStorage.setItem(SESSION_TOKEN_KEY, cleanToken);
    return true;
  }

  function currentEndpoint() {
    return String(localStorage.getItem(ENDPOINT_KEY) || DEFAULT_ENDPOINT).trim().replace(/\/+$/, '');
  }

  if (shouldForget) {
    forgetConnection();
  } else if (hashToken) {
    rememberConnection(hashToken, hashEndpoint, hashPoll);
    cleanAddressBar();
  } else {
    const persistedToken = localStorage.getItem(PERSISTED_TOKEN_KEY);
    if (persistedToken && !sessionStorage.getItem(SESSION_TOKEN_KEY)) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, persistedToken);
    }
    if (!localStorage.getItem(ENDPOINT_KEY)) localStorage.setItem(ENDPOINT_KEY, DEFAULT_ENDPOINT);
    if (!localStorage.getItem(POLL_KEY)) localStorage.setItem(POLL_KEY, DEFAULT_POLL);
  }

  async function diagnoseConnection(token) {
    const endpoint = currentEndpoint();
    let health;
    try {
      health = await fetch(`${endpoint}/api/health`, { cache: 'no-store' });
    } catch (error) {
      throw new Error('로컬 Lion Agent가 실행되지 않았습니다. connect_ys_empire.bat을 먼저 실행하세요.');
    }
    if (!health.ok) throw new Error(`Lion Agent 상태 확인 실패 (HTTP ${health.status})`);

    const response = await fetch(`${endpoint}/api/status`, {
      cache: 'no-store',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
    });
    if (response.status === 401) {
      throw new Error('입력값이 Lion SSH 비밀번호이거나 잘못된 토큰입니다. server-agent/config.json의 api_token을 입력하세요.');
    }
    if (!response.ok) throw new Error(`Lion 상태 요청 실패 (HTTP ${response.status})`);
    return response.json();
  }

  function installConnectionButton() {
    if (document.getElementById('ysQuickConnectBtn')) return;

    const button = document.createElement('button');
    button.id = 'ysQuickConnectBtn';
    button.type = 'button';
    button.textContent = sessionStorage.getItem(SESSION_TOKEN_KEY) ? 'Lion 연결 확인 중' : 'Lion 실시간 연결';
    button.title = '로컬 Lion Agent 연결 및 오류 확인';
    button.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:9999',
      'border:1px solid #c9d3df', 'border-radius:999px', 'padding:10px 14px',
      'background:#ffffff', 'color:#263548', 'font:700 12px/1.2 Arial,sans-serif',
      'box-shadow:0 8px 24px rgba(31,45,61,.16)', 'cursor:pointer'
    ].join(';');

    const setBusy = busy => {
      button.disabled = busy;
      button.style.opacity = busy ? '0.65' : '1';
      button.style.cursor = busy ? 'wait' : 'pointer';
    };

    button.addEventListener('click', async () => {
      const current = localStorage.getItem(PERSISTED_TOKEN_KEY) || '';
      const token = window.prompt(
        'Lion Agent 접근 토큰(api_token)을 입력하세요.\nLion 서버 로그인 비밀번호가 아닙니다.\n\n서버 비밀번호는 connect_ys_empire.bat 실행 창에서 입력합니다.',
        current
      );
      if (token === null) return;
      if (!String(token).trim()) {
        window.alert('api_token이 비어 있습니다.');
        return;
      }

      setBusy(true);
      button.textContent = '연결 검사 중';
      try {
        const snapshot = await diagnoseConnection(String(token).trim());
        rememberConnection(token, currentEndpoint(), localStorage.getItem(POLL_KEY));
        button.textContent = `연결 성공 · ${snapshot.nodes?.length || 0}대`;
        window.setTimeout(() => window.location.reload(), 500);
      } catch (error) {
        forgetConnection();
        button.textContent = 'Lion 연결 실패';
        window.alert(error.message || String(error));
        setBusy(false);
      }
    });

    document.body.appendChild(button);

    document.addEventListener('ys:connection-state', event => {
      const connected = Boolean(event.detail?.connected);
      button.hidden = connected;
      if (!connected) {
        setBusy(false);
        button.textContent = 'Lion 다시 연결';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installConnectionButton, { once: true });
  } else {
    installConnectionButton();
  }

  globalThis.YSAgentConnection = Object.freeze({
    forget: () => {
      forgetConnection();
      window.location.reload();
    },
    diagnose: token => diagnoseConnection(token)
  });
})();