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

  function installFallbackButton() {
    if (document.getElementById('ysQuickConnectBtn')) return;

    const button = document.createElement('button');
    button.id = 'ysQuickConnectBtn';
    button.type = 'button';
    button.textContent = 'Lion 실시간 연결';
    button.title = '로컬 Lion Agent 토큰으로 연결';
    button.style.cssText = [
      'position:fixed', 'right:16px', 'bottom:16px', 'z-index:9999',
      'border:1px solid #c9d3df', 'border-radius:999px', 'padding:10px 14px',
      'background:#ffffff', 'color:#263548', 'font:700 12px/1.2 Arial,sans-serif',
      'box-shadow:0 8px 24px rgba(31,45,61,.16)', 'cursor:pointer'
    ].join(';');

    button.addEventListener('click', () => {
      const current = localStorage.getItem(PERSISTED_TOKEN_KEY) || '';
      const token = window.prompt(
        'Lion Agent 접근 암호(api_token)를 입력하세요.\nSSH 비밀번호나 개인키는 입력하지 않습니다.',
        current
      );
      if (token === null) return;
      if (!rememberConnection(token, localStorage.getItem(ENDPOINT_KEY), localStorage.getItem(POLL_KEY))) {
        window.alert('접근 암호가 비어 있습니다.');
        return;
      }
      window.location.reload();
    });

    document.body.appendChild(button);

    document.addEventListener('ys:connection-state', event => {
      button.hidden = Boolean(event.detail?.connected);
      if (!event.detail?.connected) button.textContent = 'Lion 다시 연결';
    });
  }

  if (!sessionStorage.getItem(SESSION_TOKEN_KEY)) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installFallbackButton, { once: true });
    } else {
      installFallbackButton();
    }
  }

  globalThis.YSAgentConnection = Object.freeze({
    forget: () => {
      forgetConnection();
      window.location.reload();
    }
  });
})();
