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

    const aiDepartment = grid.querySelector(':scope > [data-department-id="ai"]')
      || researchDepartment.querySelector('[data-department-id="ai"]');

    if (aiDepartment) {
      aiDepartment.classList.add('research-ai-subsection');

      const aiTitle = aiDepartment.querySelector(':scope > .partition-title strong');
      if (aiTitle && aiTitle.textContent !== 'AI 자원') aiTitle.textContent = 'AI 자원';

      if (aiDepartment.parentElement !== researchDepartment) {
        researchDepartment.appendChild(aiDepartment);
      }
    }

    const combinedCount = researchDepartment.querySelectorAll('.office-character').length;
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
