(() => {
  'use strict';

  const METHOD_SCORE = [
    [/def2[-_ ]?qz/i, 60], [/quadruple/i, 60], [/def2[-_ ]?tzvpp/i, 55],
    [/def2[-_ ]?tzvp/i, 50], [/triple/i, 48], [/6-311/i, 45],
    [/def2[-_ ]?svp/i, 30], [/6-31/i, 28], [/lanl2dz/i, 22]
  ];

  function atomIdsFromInput() {
    const input = document.getElementById('spinManualIds');
    return (input?.value || '').split(/[ ,;]+/).map(Number).filter(Number.isFinite);
  }

  spinSelection = function patchedSpinSelection(records) {
    const manual = atomIdsFromInput();
    if (manual.length) return [...new Set(manual)];
    const score = new Map();
    records.forEach(record => (record.spin || []).forEach(atom => {
      score.set(atom.index, (score.get(atom.index) || 0) + Math.abs(atom.spin || 0));
    }));
    return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([index]) => index);
  };

  function normalizedStem(name) {
    return String(name || '')
      .replace(/\.(out|log|txt)$/i, '')
      .replace(/(?:[-_ ](?:opt(?:[-_ ]?freq)?|freq|sp|single[-_ ]?point|bb|big[-_ ]?basis|def2[-_ ]?(?:svp|tzvp|tzvpp|qzvp|qzvpp)|b3lyp|pbe0|m06l|m06-2x|cam[-_ ]?b3lyp))+$/ig, '')
      .replace(/[-_ ]+$/g, '') || String(name || '').replace(/\.[^.]+$/, '');
  }

  function pairDistanceFingerprint(record) {
    const coords = record.coords || [];
    if (!coords.length) return null;
    const values = [];
    const limit = Math.min(coords.length, 70);
    for (let i = 0; i < limit; i += 1) {
      for (let j = i + 1; j < limit; j += 1) {
        const a = coords[i], b = coords[j];
        values.push(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    }
    values.sort((a, b) => a - b);
    const sample = values.length > 180 ? values.filter((_, i) => i % Math.ceil(values.length / 180) === 0).slice(0, 180) : values;
    return {
      symbols: coords.map(atom => atom.symbol).join(','),
      distances: sample,
      size: coords.length
    };
  }

  function fingerprintDistance(a, b) {
    if (!a || !b || a.size !== b.size || a.symbols !== b.symbols || a.distances.length !== b.distances.length) return Infinity;
    if (!a.distances.length) return 0;
    let sum = 0;
    for (let i = 0; i < a.distances.length; i += 1) {
      const d = a.distances[i] - b.distances[i];
      sum += d * d;
    }
    return Math.sqrt(sum / a.distances.length);
  }

  function routeScore(record) {
    const routeText = `${record.route || ''} ${record.name || ''}`;
    let score = 0;
    METHOD_SCORE.forEach(([pattern, value]) => { if (pattern.test(routeText)) score = Math.max(score, value); });
    if (!/\b(opt|freq|irc|scan)\b/i.test(routeText)) score += 8;
    if (record.electronic != null) score += 3;
    if (record.status === 'normal') score += 2;
    return score;
  }

  function geometryScore(record) {
    const routeText = record.route || '';
    let score = (record.coords || []).length ? 10 : 0;
    if (/\bopt\b/i.test(routeText)) score += 8;
    if (/\bfreq\b/i.test(routeText) || record.gibbs != null || record.zpe != null) score += 12;
    if (record.status === 'normal') score += 2;
    return score;
  }

  function mergeCluster(cluster, index) {
    const geometryRecord = [...cluster].sort((a, b) => geometryScore(b) - geometryScore(a))[0];
    const energyRecord = [...cluster].sort((a, b) => routeScore(b) - routeScore(a))[0];
    const correctionG = geometryRecord.gibbs != null && geometryRecord.electronic != null ? geometryRecord.gibbs - geometryRecord.electronic : null;
    const correctionH = geometryRecord.enthalpy != null && geometryRecord.electronic != null ? geometryRecord.enthalpy - geometryRecord.electronic : null;
    const highElectronic = energyRecord.electronic ?? geometryRecord.electronic;
    const baseName = normalizedStem(geometryRecord.name || energyRecord.name) || `Structure_${index + 1}`;
    return {
      ...geometryRecord,
      name: `${geometryRecord.name}${energyRecord !== geometryRecord ? ` + ${energyRecord.name}` : ''}`,
      path: `Geometry: ${geometryRecord.path || geometryRecord.name}${energyRecord !== geometryRecord ? ` | Energy: ${energyRecord.path || energyRecord.name}` : ''}`,
      structure: baseName,
      electronic: highElectronic,
      highElectronic,
      lowElectronic: geometryRecord.electronic,
      gibbs: highElectronic != null && correctionG != null ? highElectronic + correctionG : geometryRecord.gibbs,
      enthalpy: highElectronic != null && correctionH != null ? highElectronic + correctionH : geometryRecord.enthalpy,
      compositeGibbs: highElectronic != null && correctionG != null ? highElectronic + correctionG : null,
      compositeEnthalpy: highElectronic != null && correctionH != null ? highElectronic + correctionH : null,
      geometrySource: geometryRecord.name,
      energySource: energyRecord.name,
      matchedFiles: cluster.map(record => record.name)
    };
  }

  function groupByGeometry(records) {
    const clusters = [];
    records.forEach(record => {
      record.__fingerprint = pairDistanceFingerprint(record);
      let best = null;
      let bestDistance = Infinity;
      clusters.forEach(cluster => {
        const distance = fingerprintDistance(record.__fingerprint, cluster[0].__fingerprint);
        if (distance < bestDistance) { best = cluster; bestDistance = distance; }
      });
      if (best && bestDistance <= 0.035) best.push(record);
      else clusters.push([record]);
    });
    return clusters;
  }

  parseSiFiles = async function patchedParseSiFiles() {
    setStatus('파일 분석 중');
    const parsed = [];
    let i = 0;
    for (const file of siState.files) {
      parsed.push(parse(await file.text(), file.name, file.webkitRelativePath));
      i += 1;
      progress(i / Math.max(siState.files.length, 1) * 28, 'Gaussian 파일 분석');
    }
    progress(31, '구조 fingerprint 비교');
    const clusters = groupByGeometry(parsed);
    siState.records = clusters.map(mergeCluster);
    renderStructureEditor();
    const paired = clusters.filter(cluster => cluster.length > 1).length;
    setStatus(`${siState.records.length}개 구조 준비 · ${paired}개 구조 자동 매칭`);
  };

  energy = function patchedEnergy(record, basis) {
    if (basis === 'electronic') return record.highElectronic ?? record.electronic;
    if (basis === 'electronic-zpe') {
      const electronic = record.highElectronic ?? record.electronic;
      return electronic != null && record.zpe != null ? electronic + record.zpe : null;
    }
    if (basis === 'enthalpy') return record.compositeEnthalpy ?? record.enthalpy;
    if (basis === 'gibbs') return record.compositeGibbs ?? record.gibbs;
    return record.compositeGibbs ?? record.gibbs ?? record.compositeEnthalpy ?? record.enthalpy ?? record.highElectronic ?? record.electronic;
  };

  function rootFolder(files) {
    const paths = [...files].map(file => file.webkitRelativePath).filter(Boolean);
    if (!paths.length) return '';
    const roots = [...new Set(paths.map(path => path.split('/')[0]).filter(Boolean))];
    return roots.length === 1 ? roots[0] : `${roots.length}개 폴더`;
  }

  function installSeraPage() {
    const spinAuto = document.getElementById('spinAuto');
    if (spinAuto) spinAuto.checked = false;
    const spinInput = document.getElementById('spinManualIds');
    if (spinInput) spinInput.disabled = false;

    const folderInput = document.getElementById('siFolder');
    const folderLabel = document.getElementById('baseFolderLabel');
    folderInput?.addEventListener('change', () => {
      const root = rootFolder(folderInput.files);
      folderLabel.textContent = root ? `Base folder: ${root} · ${folderInput.files.length}개 파일 검색` : 'Base folder가 선택되지 않았습니다.';
    });

    document.querySelectorAll('[data-scroll-target]').forEach(button => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.scrollTarget);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('sera-focus');
        window.setTimeout(() => target.classList.remove('sera-focus'), 1300);
      });
    });

    const editor = document.getElementById('structureEditor');
    const observer = new MutationObserver(() => {
      editor.querySelectorAll('[data-name]').forEach(input => {
        if (input.dataset.seraSyncInstalled) return;
        input.dataset.seraSyncInstalled = 'true';
        input.addEventListener('change', () => {
          const index = Number(input.dataset.name);
          const record = siState.records[index];
          if (record) record.structure = input.value.trim() || record.structure;
        });
      });
    });
    if (editor) observer.observe(editor, { childList: true, subtree: true });
  }

  window.addEventListener('DOMContentLoaded', installSeraPage);
})();
