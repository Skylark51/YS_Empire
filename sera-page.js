(() => {
  'use strict';

  const originalRenderFiles = renderFiles;
  let previewTimer;

  const pathOf = item => String(item?.webkitRelativePath || item?.path || item?.name || '').replace(/\\/g, '/');
  const dirOf = item => pathOf(item).includes('/') ? pathOf(item).slice(0, pathOf(item).lastIndexOf('/')) : '';
  const cleanName = name => String(name || '').replace(/\.(out|log|txt)$/i, '').replace(/[-_]freq(?:[-_]bb)?$/i, '').replace(/[-_]opt$/i, '') || 'Structure';

  function suffixInfo(item) {
    const name = String(item?.name || '');
    let match = name.match(/^(.*?)([-_])freq[-_]bb\.(out|log|txt)$/i);
    if (match) return { role: 'bb', stem: match[1], sep: match[2], ext: match[3], expected: `${match[1]}${match[2]}freq.${match[3]}` };
    match = name.match(/^(.*?)([-_])freq\.(out|log|txt)$/i);
    if (match) return { role: 'freq', stem: match[1], sep: match[2], ext: match[3], expected: `${match[1]}${match[2]}freq${match[2]}bb.${match[3]}` };
    return null;
  }

  function grouped(items) {
    const map = new Map();
    const singles = [];
    [...items].forEach(item => {
      const info = suffixInfo(item);
      if (!info) return singles.push(item);
      const key = `${dirOf(item).toLowerCase()}\u0000${info.stem.toLowerCase()}`;
      if (!map.has(key)) map.set(key, { key, stem: info.stem, dir: dirOf(item), freq: [], bb: [] });
      map.get(key)[info.role].push(item);
    });
    return { groups: [...map.values()], singles };
  }

  spinDensity = function strictBbSpinParser(text) {
    const starts = [...String(text || '').matchAll(/Mulliken charges and spin densities(?: with hydrogens summed into heavy atoms)?:/gi)].map(match => match.index);
    if (!starts.length) return [];
    const rows = [];
    for (const line of String(text).slice(starts.at(-1)).split(/\r?\n/)) {
      const match = line.match(/^\s*(\d+)\s+([A-Za-z]{1,3})\s+[-+]?\d*\.?\d+(?:[DEde][-+]?\d+)?\s+([-+]?\d*\.?\d+(?:[DEde][-+]?\d+)?)/);
      if (match) rows.push({ index: Number(match[1]), symbol: match[2], spin: Number(match[3].replace(/[Dd]/, 'E')) });
      else if (rows.length && /^\s*(?:Sum of Mulliken|Electronic spatial extent|Natural Population|APT charges)/i.test(line)) break;
    }
    return rows.filter(atom => Number.isFinite(atom.spin));
  };

  spinSelection = function strictBbSpinSelection(records) {
    const manual = (document.getElementById('spinManualIds')?.value || '').split(/[ ,;]+/).map(Number).filter(Number.isFinite);
    if (manual.length) return [...new Set(manual)];
    const totals = new Map();
    records.forEach(record => (record.spin || []).forEach(atom => totals.set(atom.index, (totals.get(atom.index) || 0) + Math.abs(atom.spin || 0))));
    return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([index]) => index);
  };

  function pairWarnings() {
    if (siState.records.length) return siState.records.flatMap(record => record.pairingWarnings || []);
    const warnings = [];
    grouped(siState.files).groups.forEach(group => {
      if (group.freq.length && !group.bb.length) {
        const file = group.freq[0];
        const expected = suffixInfo(file).expected;
        warnings.push(file.webkitRelativePath
          ? `${cleanName(group.stem)}: 선택한 폴더에 ${expected}가 없습니다.`
          : `${cleanName(group.stem)}: 개별 파일 선택은 같은 폴더의 ${expected}를 읽을 권한이 없습니다. Base folder를 선택하면 자동 확인합니다.`);
      }
    });
    return warnings;
  }

  function showWarnings() {
    const host = document.getElementById('pairingWarnings');
    if (!host) return;
    const warnings = pairWarnings();
    host.innerHTML = warnings.length
      ? `<div class="pair-alert"><strong>BB 파일 확인 필요</strong><ul>${warnings.map(text => `<li>${esc(text)}</li>`).join('')}</ul></div>`
      : siState.files.length ? '<div class="pair-ok">-freq.out + -freq-bb.out을 구조 1개로 병합합니다.</div>' : '';
  }

  renderFiles = function pairedFileList(files, id) {
    if (id !== 'siFileList') return originalRenderFiles(files, id);
    const host = document.getElementById(id);
    if (!host) return;
    const { groups, singles } = grouped(files);
    host.innerHTML = [
      ...groups.map(group => {
        const freq = group.freq[0], bb = group.bb[0], name = cleanName(group.stem);
        if (freq && bb) return `<div class="file-row pair-row ok"><strong>${esc(name)}</strong><span>${esc(freq.name)} + ${esc(bb.name)} · Word 1행</span></div>`;
        const file = freq || bb, info = suffixInfo(file);
        return `<div class="file-row pair-row warn"><strong>${esc(name)}</strong><span>${esc(file.name)} · ${esc(info.expected)} 없음</span></div>`;
      }),
      ...singles.map(file => `<div class="file-row pair-row"><strong>${esc(file.webkitRelativePath || file.name)}</strong><span>접미사 규칙 외 파일</span></div>`)
    ].join('');
    showWarnings();
  };

  function mergePair(group, index) {
    const freq = group.freq[0] || null;
    const bb = group.bb[0] || null;
    const base = freq || bb;
    const structure = cleanName(group.stem) || `Structure_${index + 1}`;
    const low = freq?.electronic ?? null;
    const high = bb?.electronic ?? low;
    const gCorr = freq?.gibbs != null && low != null ? freq.gibbs - low : null;
    const hCorr = freq?.enthalpy != null && low != null ? freq.enthalpy - low : null;
    const warnings = [];
    if (!bb) warnings.push(`${structure}: ${suffixInfo(freq).expected}가 없어 Mulliken spin density를 포함하지 않습니다.`);
    else if (!(bb.spin || []).length) warnings.push(`${structure}: ${bb.name}에서 Mulliken spin-density 표를 찾지 못했습니다.`);
    if (!freq) warnings.push(`${structure}: ${suffixInfo(bb).expected}가 없어 frequency 좌표와 thermal correction을 확인할 수 없습니다.`);
    if (group.freq.length > 1 || group.bb.length > 1) warnings.push(`${structure}: 같은 접미사 파일이 중복되어 첫 파일을 사용했습니다.`);
    return {
      ...base,
      name: [freq?.name, bb?.name].filter(Boolean).join(' + '),
      path: [freq ? `Geometry/Frequency: ${freq.path || freq.name}` : '', bb ? `BB energy/Mulliken: ${bb.path || bb.name}` : ''].filter(Boolean).join(' | '),
      structure,
      coords: freq?.coords?.length ? freq.coords : (bb?.coords || []),
      spin: bb?.spin || [],
      electronic: high,
      highElectronic: high,
      lowElectronic: low,
      zpe: freq?.zpe ?? null,
      gibbs: high != null && gCorr != null ? high + gCorr : (freq?.gibbs ?? bb?.gibbs ?? null),
      enthalpy: high != null && hCorr != null ? high + hCorr : (freq?.enthalpy ?? bb?.enthalpy ?? null),
      compositeGibbs: high != null && gCorr != null ? high + gCorr : null,
      compositeEnthalpy: high != null && hCorr != null ? high + hCorr : null,
      geometrySource: freq?.name || bb?.name,
      energySource: bb?.name || freq?.name,
      spinSource: bb?.name || null,
      bbMissing: !bb,
      freqMissing: !freq,
      pairingWarnings: warnings
    };
  }

  parseSiFiles = async function fixedSuffixParser() {
    setStatus('파일 분석 중');
    const parsed = [];
    for (let index = 0; index < siState.files.length; index += 1) {
      const file = siState.files[index];
      parsed.push(parse(await file.text(), file.name, file.webkitRelativePath));
      progress((index + 1) / Math.max(siState.files.length, 1) * 28, 'Gaussian 파일 분석');
    }
    const { groups, singles } = grouped(parsed);
    const merged = groups.map(mergePair);
    const standalone = singles.map(record => {
      const isBb = /[-_]bb\.(out|log|txt)$/i.test(record.name);
      return {
        ...record,
        structure: cleanName(record.name),
        spin: isBb ? (record.spin || []) : [],
        spinSource: isBb ? record.name : null,
        pairingWarnings: !isBb && (record.spin || []).length ? [`${cleanName(record.name)}: BB 출력이 아니므로 이 파일의 Mulliken spin을 무시했습니다.`] : []
      };
    });
    siState.records = [...merged, ...standalone];
    renderStructureEditor();
    showWarnings();
    renderPreview();
    const paired = merged.filter(record => !record.bbMissing && !record.freqMissing).length;
    const missing = merged.filter(record => record.bbMissing).length;
    setStatus(`${siState.records.length}개 구조 · ${paired}개 병합${missing ? ` · BB 누락 ${missing}개` : ''}`);
  };

  energy = function pairedEnergy(record, basis) {
    if (basis === 'electronic') return record.highElectronic ?? record.electronic;
    if (basis === 'electronic-zpe') {
      const electronic = record.highElectronic ?? record.electronic;
      return electronic != null && record.zpe != null ? electronic + record.zpe : null;
    }
    if (basis === 'enthalpy') return record.compositeEnthalpy ?? record.enthalpy;
    if (basis === 'gibbs') return record.compositeGibbs ?? record.gibbs;
    return record.compositeGibbs ?? record.gibbs ?? record.compositeEnthalpy ?? record.enthalpy ?? record.highElectronic ?? record.electronic;
  };

  function previewRows(records) {
    const basis = document.getElementById('energyBasis').value;
    const ref = referenceHartree(records, basis);
    return records.map(record => {
      const absolute = energy(record, basis);
      return { record, absolute, relative: absolute != null && ref != null ? (absolute - ref) * HARTREE : null };
    });
  }

  function renderPreview() {
    const host = document.getElementById('wordPreview');
    const status = document.getElementById('wordPreviewStatus');
    if (!host) return;
    const records = siState.records.length ? usedRecords() : [];
    if (!records.length) {
      host.innerHTML = '<p>파일 분석 후 생성될 Word 표가 여기에 표시됩니다.</p>';
      host.className = 'word-preview empty';
      if (status) status.textContent = siState.files.length ? '파일 분석 필요' : '파일 대기';
      return;
    }
    const spins = spinSelection(records);
    const warnings = records.flatMap(record => record.pairingWarnings || []);
    const energyHtml = previewRows(records).map(({ record, absolute, relative }) => `<tr><td>${markupHtml(record.structure)}</td><td>${absolute == null ? '—' : absolute.toFixed(9)}</td><td>${relative == null ? '—' : relative.toFixed(2)}</td></tr>`).join('');
    const spinHtml = spins.length ? `<table><thead><tr><th>Structure</th>${spins.map(id => `<th>Atom ${id}</th>`).join('')}</tr></thead><tbody>${records.map(record => `<tr${record.bbMissing ? ' class="warn-row"' : ''}><td>${markupHtml(record.structure)}</td>${spins.map(id => `<td>${record.bbMissing ? 'BB 없음' : ((record.spin || []).find(atom => atom.index === id)?.spin?.toFixed(3) ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>-freq-bb 출력의 Mulliken spin이 없습니다.</p>';
    const first = records[0], coords = (first.coords || []).slice(0, 6).map(atom => `${atom.symbol} ${atom.x.toFixed(5)} ${atom.y.toFixed(5)} ${atom.z.toFixed(5)}`).join('\n');
    host.className = 'word-preview';
    host.innerHTML = `<article class="word-sheet"><h2>${markupHtml(document.getElementById('siTitle').value || 'Computational Details')}</h2>${warnings.length ? `<div class="preview-warning"><strong>경고</strong><ul>${warnings.map(text => `<li>${esc(text)}</li>`).join('')}</ul></div>` : ''}<h3>Energy Tables</h3><table><thead><tr><th>Structure</th><th>Absolute (Hartree)</th><th>Relative (kcal mol⁻¹)</th></tr></thead><tbody>${energyHtml}</tbody></table><h3>Mulliken Spin Density</h3>${spinHtml}<h3>Cartesian Coordinates</h3><strong>${markupHtml(first.structure)}</strong><pre>${esc(coords || 'Coordinates not found')}${(first.coords || []).length > 6 ? '\n…' : ''}</pre><footer>축약 미리보기이며 실제 Word에는 전체 선택 구조가 포함됩니다.</footer></article>`;
    if (status) status.textContent = `${records.length}개 구조 · BB spin ${records.filter(record => record.spinSource).length}개`;
  }

  function ensureUi() {
    const fileList = document.getElementById('siFileList');
    if (fileList && !document.getElementById('pairingWarnings')) fileList.insertAdjacentHTML('afterend', '<div id="pairingWarnings" aria-live="polite"></div>');
    const outputs = document.getElementById('siOutputs');
    if (outputs && !document.getElementById('wordPreviewSection')) outputs.insertAdjacentHTML('beforebegin', '<section id="wordPreviewSection" class="form-card preview-card"><div class="preview-head"><div><h3>8. Word 문서 미리보기</h3><p class="tool-note">다운로드 전에 에너지·Mulliken spin·좌표를 간단히 확인합니다.</p></div><div><span id="wordPreviewStatus">파일 대기</span><button id="refreshWordPreview" type="button">미리보기 갱신</button></div></div><div id="wordPreview" class="word-preview empty"><p>파일 분석 후 생성될 Word 표가 여기에 표시됩니다.</p></div></section>');
    if (!document.getElementById('seraV14Styles')) document.head.insertAdjacentHTML('beforeend', `<style id="seraV14Styles">
      .pair-row{align-items:flex-start;gap:8px}.pair-row strong{min-width:150px}.pair-row.ok{border-left:4px solid #059669}.pair-row.warn{border-left:4px solid #dc2626;background:#fff7ed}.pair-alert,.pair-ok{margin-top:10px;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.5}.pair-alert{border:1px solid #fecaca;background:#fef2f2;color:#991b1b}.pair-alert ul{margin:5px 0 0;padding-left:18px}.pair-ok{border:1px solid #a7f3d0;background:#ecfdf5;color:#065f46}.preview-card{margin-top:16px}.preview-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.preview-head>div:last-child{display:flex;align-items:center;gap:8px}.preview-head span{font-size:12px;color:var(--sera-muted)}.preview-head button{padding:8px 10px;border:1px solid var(--sera-line);border-radius:8px;background:#fff;cursor:pointer}.word-preview{margin-top:12px;padding:16px;overflow:auto;border:1px solid var(--sera-line);border-radius:9px;background:#e5e7eb}.word-preview.empty{min-height:150px;display:grid;place-items:center;color:var(--sera-muted)}.word-sheet{min-width:650px;max-width:880px;margin:auto;padding:36px 42px;background:#fff;color:#111827;font-family:'Times New Roman',serif;box-shadow:0 8px 24px #0002}.word-sheet h2{border-bottom:2px solid #111827;padding-bottom:12px}.word-sheet h3{margin:22px 0 8px;font-size:15px}.word-sheet table{width:100%;border-collapse:collapse;font-size:11px}.word-sheet th,.word-sheet td{border:1px solid #6b7280;padding:6px;text-align:center}.word-sheet th{background:#f3f4f6}.word-sheet .warn-row td{background:#fff7ed;color:#9a3412}.word-sheet pre{padding:9px;border:1px solid #d1d5db;background:#fafafa;font:10px/1.45 Consolas,monospace}.preview-warning{padding:9px 11px;border:1px solid #fca5a5;background:#fef2f2;color:#991b1b;font:11px/1.45 Arial,sans-serif}.preview-warning ul{margin:4px 0 0;padding-left:17px}.word-sheet footer{margin-top:20px;padding-top:8px;border-top:1px solid #d1d5db;color:#6b7280;font:10px Arial,sans-serif}@media(max-width:650px){.preview-head{flex-direction:column}.word-preview{padding:8px}}
    </style>`);
  }

  function install() {
    ensureUi();
    const profile = document.querySelector('.sera-profile>p');
    if (profile) profile.textContent = '-freq.out의 좌표·frequency 보정값과 같은 폴더의 -freq-bb.out 전자에너지·Mulliken spin을 구조 하나로 병합합니다.';
    const hint = document.querySelector('#siDrop small');
    if (hint) hint.textContent = 'Base folder를 선택하면 같은 접두사의 -freq.out과 -freq-bb.out을 자동 연결합니다.';
    const spinNote = document.querySelector('#spinSection .tool-note');
    if (spinNote) spinNote.textContent = 'Mulliken spin density는 반드시 -freq-bb.out에서만 읽습니다. 비워 두면 |spin| 상위 6개 원자를 선택합니다.';
    const version = document.querySelector('.sera-heading .tool-note');
    if (version) version.textContent = 'SI GENERATOR v1.4 FIXED SUFFIX WORKFLOW';

    document.getElementById('refreshWordPreview')?.addEventListener('click', async () => {
      if (siState.files.length && !siState.records.length) await parseSiFiles();
      else renderPreview();
    });
    document.getElementById('siFolder')?.addEventListener('change', () => setTimeout(() => { renderFiles(siState.files, 'siFileList'); showWarnings(); renderPreview(); }, 0));
    document.getElementById('siFiles')?.addEventListener('change', () => setTimeout(() => { renderFiles(siState.files, 'siFileList'); showWarnings(); renderPreview(); }, 0));
    document.getElementById('clearSi')?.addEventListener('click', () => setTimeout(() => { showWarnings(); renderPreview(); }, 0));
    document.getElementById('siPanel')?.addEventListener('input', event => {
      if (event.target.type === 'file') return;
      clearTimeout(previewTimer);
      previewTimer = setTimeout(renderPreview, 100);
    });
    document.getElementById('siPanel')?.addEventListener('change', event => {
      if (event.target.type !== 'file') renderPreview();
    });
    new MutationObserver(() => renderPreview()).observe(document.getElementById('structureEditor'), { childList: true, subtree: true });
    showWarnings();
    renderPreview();
  }

  window.addEventListener('DOMContentLoaded', install);
})();
