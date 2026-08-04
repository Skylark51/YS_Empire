(() => {
  'use strict';

  let observer = null;
  let framePending = false;

  function applyOfficeOrder() {
    const grid = document.querySelector('.department-partition-grid');
    if (!grid) return;

    const primaryDepartment = grid.querySelector(':scope > [data-department-id="jbnu-owned"]');
    const researchDepartment = grid.querySelector(':scope > .research-partition') || grid.querySelector('.research-partition');
    if (!primaryDepartment || !researchDepartment) return;

    if (primaryDepartment.nextElementSibling !== researchDepartment) {
      primaryDepartment.after(researchDepartment);
    }

    const researchGrid = researchDepartment.querySelector(':scope > .research-grid');
    const aiDepartment = grid.querySelector(':scope > [data-department-id="ai"]');

    if (researchGrid && aiDepartment) {
      const aiCharacters = [...aiDepartment.querySelectorAll('.office-character')];
      aiCharacters.forEach(character => {
        character.classList.add('research-ai-character');
        researchGrid.appendChild(character);
      });
      aiDepartment.remove();
    }

    const combinedCount = researchGrid?.querySelectorAll('.office-character').length || 0;
    const researchCount = researchDepartment.querySelector(':scope > .partition-title span');
    const countLabel = `${combinedCount}명`;
    if (researchCount && researchCount.textContent !== countLabel) researchCount.textContent = countLabel;
  }

  function scheduleOfficeOrder() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      applyOfficeOrder();
    });
  }

  function installOfficeOrder() {
    const root = document.getElementById('departmentGrid');
    if (!root) return;

    observer?.disconnect();
    observer = new MutationObserver(scheduleOfficeOrder);
    observer.observe(root, { childList: true, subtree: true });
    scheduleOfficeOrder();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installOfficeOrder, { once: true });
  } else {
    installOfficeOrder();
  }
})();
