const $ = (id) => document.getElementById(id);
const parserState = { files: [] };
const siState = { files: [] };

function setupTabs() {
  document.querySelectorAll('.tool-tab').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tool-tab').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.tool-panel').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      $(button.dataset.target).classList.add('active');
    });
  });
}

function setupDrop(dropId, inputId, state, listId) {
  const drop = $(dropId);
  const input = $(inputId);
  const accept = (files) => {
    state.files = [...files].filter((file) => /\.(out|log|txt)$/i.test(file.name));
    renderFileList(state.files, listId);
  };
  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => accept(input.files));
  ['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (event) => {
    event.preventDefault();
    drop.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((name) => drop.addEventListener(name, (event) => {
    event.preventDefault();
    drop.classList.remove('drag');
  }));
  drop.addEventListener('drop', (event) => accept(event.dataTransfer.files));
}

function renderFileList(files, listId) {
  const host = $(listId);
  host.innerHTML = files.length ? files.map((file) => `<div class="file-row"><strong>${escapeHtml(file.name)}</strong><span> · ${formatBytes(file.size)}</span></div>`).join('') : '';
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function lastMatch(text, regex, group = 1) {
  const matches = [...text.matchAll(regex)];
  return matches.length ? matches[matches.length - 1][group].trim() : '';
}

function allMatches(text, regex, group = 1) {
  return [...text.matchAll(regex)].map((match) => match[group].trim());
}

function extractRoute(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*#/.test(line));
  if (start < 0) return '';
  const route = [];
  for (let i = start; i < Math.min(lines.length, start + 25); i += 1) {
    if (i > start && !lines[i].trim()) break;
    route.push(lines[i].trim());
  }
  return route.join(' ');
}

function extractChargeMultiplicity(text) {
  const match = text.match(/Charge\s*=\s*(-?\d+)\s+Multiplicity\s*=\s*(\d+)/i);
  return match ? { charge: match[1], multiplicity: match[2] } : { charge: '?', multiplicity: '?' };
}

function extractFinalOrientation(text) {
  const marker = /(?:Standard|Input) orientation:/g;
  const indexes = [...text.matchAll(marker)].map((match) => match.index);
  if (!indexes.length) return '';
  const segment = text.slice(indexes[indexes.length - 1]);
  const lines = segment.split(/\r?\n/);
  let dashCount = 0;
  const rows = [];
  for (const line of lines) {
    if (/^\s*-{5,}/.test(line)) {
      dashCount += 1;
      if (dashCount >= 3 && rows.length) break;
      continue;
    }
    if (dashCount === 2) {
      const match = line.match(/^\s*\d+\s+(\d+)\s+\d+\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)/);
      if (match) rows.push({ atomicNumber: Number(match[1]), x: match[2], y: match[3], z: match[4] });
    }
  }
  return rows.map((row) => `${elementSymbol(row.atomicNumber).padEnd(2)} ${row.x.padStart(14)} ${row.y.padStart(14)} ${row.z.padStart(14)}`).join('\n');
}

function elementSymbol(number) {
  const symbols = ['', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe'];
  return symbols[number] || `X${number}`;
}

function parseGaussian(text, name) {
  const route = extractRoute(text);
  const cm = extractChargeMultiplicity(text);
  const scfValues = allMatches(text, /SCF Done:\s+E\([^)]*\)\s*=\s*(-?\d+\.\d+)/g);
  const frequencies = allMatches(text, /Frequencies --\s+([^\n]+)/g).flatMap((line) => line.trim().split(/\s+/)).map(Number).filter(Number.isFinite);
  const imaginary = frequencies.filter((value) => value < 0);
  const normalCount = (text.match(/Normal termination of Gaussian/g) || []).length;
  const errorCount = (text.match(/Error termination/g) || []).length;
  const thermalG = lastMatch(text, /Sum of electronic and thermal Free Energies=\s*(-?\d+\.\d+)/g);
  const thermalH = lastMatch(text, /Sum of electronic and thermal Enthalpies=\s*(-?\d+\.\d+)/g);
  const zpe = lastMatch(text, /Zero-point correction=\s*([+-]?\d+\.\d+)/g);
  const jobCpu = lastMatch(text, /Job cpu time:\s*([^\n]+)/g);
  const elapsed = lastMatch(text, /Elapsed time:\s*([^\n]+)/g);
  const link0 = allMatches(text, /^\s*%(?:chk|oldchk|mem|cpu|nprocshared)=.*$/gmi, 0);
  return {
    name, route, charge: cm.charge, multiplicity: cm.multiplicity,
    status: errorCount ? 'error' : normalCount ? 'normal' : 'incomplete',
    normalCount, errorCount,
    scf: scfValues.at(-1) || '', scfCount: scfValues.length,
    freeEnergy: thermalG, enthalpy: thermalH, zpe,
    imaginary, minFrequency: frequencies.length ? Math.min(...frequencies) : null,
    jobCpu, elapsed, link0, coordinates: extractFinalOrientation(text)
  };
}

function makeSummary(parsed) {
  return [
    `FILE: ${parsed.name}`,
    `STATUS: ${parsed.status.toUpperCase()} (normal=${parsed.normalCount}, error=${parsed.errorCount})`,
    `ROUTE: ${parsed.route || 'not found'}`,
    `CHARGE/MULTIPLICITY: ${parsed.charge} ${parsed.multiplicity}`,
    `FINAL SCF ENERGY: ${parsed.scf || 'not found'} Hartree`,
    `THERMAL FREE ENERGY: ${parsed.freeEnergy || 'not found'} Hartree`,
    `THERMAL ENTHALPY: ${parsed.enthalpy || 'not found'} Hartree`,
    `ZERO-POINT CORRECTION: ${parsed.zpe || 'not found'} Hartree`,
    `IMAGINARY FREQUENCIES: ${parsed.imaginary.length ? parsed.imaginary.join(', ') : 'none/frequency data absent'}`,
    `SCF CYCLES FOUND: ${parsed.scfCount}`,
    `JOB CPU TIME: ${parsed.jobCpu || 'not found'}`,
    `ELAPSED TIME: ${parsed.elapsed || 'not found'}`,
    '', 'LINK0:', parsed.link0.join('\n') || 'not found',
    '', 'FINAL CARTESIAN COORDINATES:', parsed.coordinates || 'not found'
  ].join('\n');
}

function makeAnalysisText(text, parsed, chunkSize) {
  const important = [];
  const patterns = [
    /SCF Done:/, /Optimization completed/, /Stationary point found/, /Frequencies --/,
    /Zero-point correction=/, /thermal Free Energies=/, /thermal Enthalpies=/,
    /Normal termination/, /Error termination/, /Convergence failure/, /imaginary frequencies/i,
    /IRC-IRC-IRC/, /Summary of Optimized Potential Surface Scan/
  ];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (patterns.some((pattern) => pattern.test(line))) {
      const from = Math.max(0, index - 2);
      const to = Math.min(lines.length, index + 4);
      important.push(`--- lines ${from + 1}-${to} ---\n${lines.slice(from, to).join('\n')}`);
    }
  });
  const header = makeSummary(parsed);
  const deduped = [...new Set(important)].join('\n\n');
  const compact = `${header}\n\n===== IMPORTANT LOG CONTEXT =====\n${deduped || 'No standard markers found.'}`;
  const chunks = [];
  for (let index = 0; index < compact.length; index += chunkSize) chunks.push(compact.slice(index, index + chunkSize));
  return chunks;
}

function downloadText(name, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.className = 'download-link';
  anchor.textContent = name;
  anchor.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(url), 1000), { once: true });
  return anchor;
}

async function runParser() {
  const host = $('parserOutputs');
  host.innerHTML = '';
  if (!parserState.files.length) { host.textContent = '먼저 파일을 선택하세요.'; return; }
  const chunkSize = Number($('chunkSize').value);
  const manifest = [];
  for (const file of parserState.files) {
    const text = await file.text();
    const parsed = parseGaussian(text, file.name);
    const chunks = makeAnalysisText(text, parsed, chunkSize);
    const base = file.name.replace(/\.[^.]+$/, '');
    manifest.push({ file: file.name, status: parsed.status, charge: parsed.charge, multiplicity: parsed.multiplicity, scf: parsed.scf, freeEnergy: parsed.freeEnergy, imaginary: parsed.imaginary, chunks: chunks.length });
    const card = document.createElement('article');
    card.className = 'output-card';
    card.innerHTML = `<strong>${escapeHtml(file.name)}</strong><p>${escapeHtml(parsed.status)} · ${chunks.length}개 분석 청크 · 최종 SCF ${escapeHtml(parsed.scf || '-')}</p>`;
    card.appendChild(downloadText(`${base}__summary.txt`, makeSummary(parsed)));
    chunks.forEach((chunk, index) => card.appendChild(downloadText(`${base}__analysis_part_${String(index + 1).padStart(2, '0')}.txt`, `PART ${index + 1}/${chunks.length}\nSOURCE ${file.name}\n\n${chunk}`)));
    host.appendChild(card);
  }
  const manifestCard = document.createElement('article');
  manifestCard.className = 'output-card';
  manifestCard.innerHTML = '<strong>전체 manifest</strong><p>여러 파일의 상태와 핵심 에너지를 한 번에 전달할 수 있습니다.</p>';
  manifestCard.appendChild(downloadText('gaussian_analysis_manifest.json', JSON.stringify({ generatedAt: new Date().toISOString(), files: manifest }, null, 2)));
  host.prepend(manifestCard);
}

async function runSi() {
  const host = $('siOutputs');
  host.innerHTML = '';
  if (!siState.files.length) { host.textContent = '먼저 파일을 선택하세요.'; return; }
  const records = [];
  for (const file of siState.files) records.push(parseGaussian(await file.text(), file.name));
  const title = $('siTitle').value.trim() || 'Computational Details and Cartesian Coordinates';
  const table = ['File\tStatus\tCharge\tMultiplicity\tSCF Energy (Hartree)\tFree Energy (Hartree)\tImaginary Frequencies'];
  const sections = [`${title}\n${'='.repeat(title.length)}\n`, 'Summary Table', '-------------'];
  records.forEach((record) => table.push([record.name, record.status, record.charge, record.multiplicity, record.scf, record.freeEnergy, record.imaginary.join(', ') || 'none/not found'].join('\t')));
  sections.push(table.join('\n'));
  records.forEach((record, index) => {
    sections.push(`\n\n${index + 1}. ${record.name}\n${'-'.repeat(Math.min(80, record.name.length + 4))}\nRoute: ${record.route || 'not found'}\nCharge = ${record.charge}, Multiplicity = ${record.multiplicity}\nElectronic Energy = ${record.scf || 'not found'} Hartree\nElectronic and Thermal Free Energy = ${record.freeEnergy || 'not found'} Hartree\nImaginary Frequencies = ${record.imaginary.join(', ') || 'none/not found'}\n\nCartesian Coordinates (Angstrom)\n${record.coordinates || 'not found'}`);
  });
  const documentText = sections.join('\n');
  const card = document.createElement('article');
  card.className = 'output-card';
  card.innerHTML = `<strong>${escapeHtml(title)}</strong><p>${records.length}개 계산 파일을 SI 텍스트 초안으로 정리했습니다.</p>`;
  card.appendChild(downloadText('SI_Generator_output.txt', documentText));
  card.appendChild(downloadText('SI_energy_table.tsv', table.join('\n')));
  const preview = document.createElement('pre');
  preview.className = 'mono';
  preview.textContent = documentText.slice(0, 8000);
  card.appendChild(preview);
  host.appendChild(card);
}

setupTabs();
setupDrop('parserDrop', 'parserFiles', parserState, 'parserFileList');
setupDrop('siDrop', 'siFiles', siState, 'siFileList');
$('runParser').addEventListener('click', runParser);
$('runSi').addEventListener('click', runSi);
$('clearParser').addEventListener('click', () => { parserState.files = []; $('parserFileList').innerHTML = ''; $('parserOutputs').innerHTML = ''; $('parserFiles').value = ''; });
$('clearSi').addEventListener('click', () => { siState.files = []; $('siFileList').innerHTML = ''; $('siOutputs').innerHTML = ''; $('siFiles').value = ''; });