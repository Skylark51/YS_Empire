(() => {
  'use strict';

  const isDedicatedSeraPage = document.body?.classList.contains('sera-page');
  if (!isDedicatedSeraPage && location.hash === '#siPanel') {
    location.replace('sera.html');
    return;
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (!document.body.classList.contains('sera-page')) {
      const seraTab = document.querySelector('.tool-tab[data-target="siPanel"]');
      if (seraTab) {
        seraTab.addEventListener('click', event => {
          event.preventDefault();
          event.stopImmediatePropagation();
          location.href = 'sera.html';
        }, true);
      }
    }

    const saveButton = document.getElementById('saveProjectBtn');
    if (saveButton) {
      saveButton.onclick = () => {
        try {
          const settings = typeof collectSettings === 'function' ? collectSettings() : {};
          const records = typeof siState !== 'undefined' ? siState.records : [];
          const structures = records.map(record => ({
            name: record.name,
            structure: record.structure,
            path: record.path,
            geometrySource: record.geometrySource || null,
            energySource: record.energySource || null
          }));
          const payload = JSON.stringify({ version: 3, settings, structures }, null, 2);
          const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = 'Sera_SI_Project.json';
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          const host = document.getElementById('siOutputs');
          if (host) host.textContent = `설정 저장 오류: ${error.message}`;
        }
      };
    }
  });
})();
