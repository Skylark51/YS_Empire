(() => {
  'use strict';
  window.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('saveProjectBtn');
    if (saveButton) {
      saveButton.onclick = () => {
        try {
          const settings = typeof collectSettings === 'function' ? collectSettings() : {};
          const structures = (window.siState?.records || []).map((record) => ({
            name: record.name,
            structure: record.structure,
            path: record.path
          }));
          const payload = JSON.stringify({ version: 2, settings, structures }, null, 2);
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