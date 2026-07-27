(() => {
  'use strict';

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = params.get('ys_token');

  if (token) {
    const endpoint = params.get('ys_endpoint') || 'http://127.0.0.1:8765';
    const poll = params.get('ys_poll') || '10000';

    localStorage.setItem('ys-agent-endpoint', endpoint);
    localStorage.setItem('ys-agent-poll', poll);
    sessionStorage.setItem('ys-agent-token', token);
    sessionStorage.setItem('ys-auto-connect-pending', '1');

    history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
    window.location.reload();
    return;
  }

  if (sessionStorage.getItem('ys-auto-connect-pending') === '1') {
    sessionStorage.removeItem('ys-auto-connect-pending');
    window.setTimeout(() => {
      const dot = document.getElementById('connectionDot');
      if (!dot?.classList.contains('online')) {
        document.getElementById('connectionBtn')?.click();
      }
    }, 8000);
  }
})();
