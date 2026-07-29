'use strict';

const state = {
  cases: [],
  algorithm: null,
  scoring: { points_per_question: 10, passing_percent: 80, result_bands: [] },
  currentCase: null,
  phase: 'intro',
  questionIndex: 0,
  score: 0,
  answers: [],
};

const els = {
  screens: [...document.querySelectorAll('.screen')],
  caseList: document.getElementById('caseList'),
  algorithmView: document.getElementById('algorithmView'),
  simulationContent: document.getElementById('simulationContent'),
  score: document.getElementById('score'),
  scoreTotal: document.getElementById('scoreTotal'),
  progressBar: document.getElementById('progressBar'),
  progressLabel: document.getElementById('progressLabel'),
  stageLabel: document.getElementById('stageLabel'),
  simulationTitle: document.getElementById('simulationTitle'),
  caseEyebrow: document.getElementById('caseEyebrow'),
  exitCaseBtn: document.getElementById('exitCaseBtn'),
  appMessage: document.getElementById('appMessage'),
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No se pudo cargar ${path} (${response.status})`);
  return response.json();
}

async function init() {
  bindNavigation();
  renderLoadingCases();

  try {
    const [cases, algorithm, scoring] = await Promise.all([
      loadJson('cases.json'),
      loadJson('algorithm.json'),
      loadJson('scoring.json'),
    ]);
    state.cases = cases;
    state.algorithm = algorithm;
    state.scoring = scoring;
    renderCaseList();
    renderAlgorithm();
  } catch (error) {
    console.error(error);
    els.caseList.innerHTML = errorPanel('No fue posible cargar los casos.', 'Recarga la página. Si el problema continúa, verifica que los archivos JSON estén en la raíz del proyecto.');
    showMessage('Error al cargar los datos del simulador.');
  }
}

function bindNavigation() {
  document.querySelectorAll('[data-go]').forEach((button) => {
    button.addEventListener('click', () => showScreen(button.dataset.go));
  });

  els.exitCaseBtn.addEventListener('click', () => {
    showScreen('cases');
    resetCaseState();
  });
}

function showScreen(id) {
  els.screens.forEach((screen) => screen.classList.toggle('active', screen.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderLoadingCases() {
  els.caseList.innerHTML = '<div class="loading-card"><span class="loader"></span><p>Cargando casos clínicos…</p></div>';
}

function renderCaseList() {
  if (!Array.isArray(state.cases) || state.cases.length === 0) {
    els.caseList.innerHTML = errorPanel('No hay casos disponibles.', 'Agrega casos a cases.json para mostrarlos aquí.');
    return;
  }

  els.caseList.innerHTML = state.cases.map((item) => `
    <button class="case-card ${item.available ? 'available' : 'locked'}" data-case-id="${escapeHtml(item.id)}" ${item.available ? '' : 'disabled'}>
      <div>
        <div class="case-card-meta">
          <span class="case-number">Caso ${escapeHtml(item.number)}</span>
          <span class="level">${escapeHtml(item.level || 'Sin nivel')}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.subtitle || '')}</p>
      </div>
      <span class="status">${item.available ? 'Iniciar →' : 'Próximamente'}</span>
    </button>
  `).join('');

  els.caseList.querySelectorAll('[data-case-id]').forEach((button) => {
    button.addEventListener('click', () => startCase(button.dataset.caseId));
  });
}

function renderAlgorithm() {
  if (!state.algorithm?.sequence) return;
  els.algorithmView.innerHTML = `
    <p class="eyebrow">Ruta oficial del simulador</p>
    <h3>${escapeHtml(state.algorithm.title)}</h3>
    <div class="algorithm-flow">
      ${state.algorithm.sequence.map((item, index) => `
        <span class="algorithm-step"><b>${index + 1}</b>${escapeHtml(item)}</span>
        ${index < state.algorithm.sequence.length - 1 ? '<i aria-hidden="true">→</i>' : ''}
      `).join('')}
    </div>
    <p class="algorithm-note">${escapeHtml(state.algorithm.source_note || '')}</p>
  `;
}

async function startCase(caseId) {
  const metadata = state.cases.find((item) => item.id === caseId);
  if (!metadata?.available) return;

  showScreen('simulation');
  els.simulationContent.innerHTML = '<div class="loading-card"><span class="loader"></span><p>Preparando simulación…</p></div>';

  try {
    const caseData = await loadJson(`${caseId}.json`);
    validateCase(caseData);
    state.currentCase = caseData;
    state.phase = 'intro';
    state.questionIndex = 0;
    state.score = 0;
    state.answers = [];
    updateHeader();
    renderCurrentPhase();
  } catch (error) {
    console.error(error);
    els.simulationContent.innerHTML = errorPanel('No se pudo abrir este caso.', 'Verifica que el archivo JSON exista y tenga la estructura correcta.');
  }
}

function validateCase(caseData) {
  const required = ['id', 'number', 'title', 'clinical', 'teg', 'questions', 'evolution', 'diagnosis', 'debrief'];
  const missing = required.filter((key) => caseData[key] === undefined);
  if (missing.length) throw new Error(`Campos faltantes: ${missing.join(', ')}`);
  if (!Array.isArray(caseData.questions) || !caseData.questions.length) throw new Error('El caso no contiene preguntas.');
}

function resetCaseState() {
  state.currentCase = null;
  state.phase = 'intro';
  state.questionIndex = 0;
  state.score = 0;
  state.answers = [];
}

function updateHeader() {
  const current = state.currentCase;
  const maxScore = current.questions.length * state.scoring.points_per_question;
  els.caseEyebrow.textContent = `Caso ${current.number} · ${current.level || 'Nivel no especificado'}`;
  els.simulationTitle.textContent = current.title;
  els.score.textContent = state.score;
  els.scoreTotal.textContent = `de ${maxScore} puntos`;
  updateProgress();
}

function updateProgress() {
  const totalQuestions = state.currentCase?.questions.length || 1;
  let completedUnits = 0;
  let totalUnits = totalQuestions + 3; // intro, preguntas, evolución, debrief
  let stage = 'Presentación clínica';

  if (state.phase === 'questions') {
    completedUnits = 1 + state.questionIndex;
    stage = `Interpretación · pregunta ${state.questionIndex + 1} de ${totalQuestions}`;
  } else if (state.phase === 'evolution') {
    completedUnits = 1 + totalQuestions;
    stage = 'Evolución clínica';
  } else if (state.phase === 'debrief') {
    completedUnits = totalUnits;
    stage = 'Debriefing';
  }

  const percent = Math.round((completedUnits / totalUnits) * 100);
  els.progressBar.style.width = `${percent}%`;
  els.progressLabel.textContent = `${percent}%`;
  els.stageLabel.textContent = stage;
}

function renderCurrentPhase() {
  updateHeader();
  if (state.phase === 'intro') renderIntro();
  else if (state.phase === 'questions') renderQuestion();
  else if (state.phase === 'evolution') renderEvolution();
  else renderDebrief();
}

function renderIntro() {
  const current = state.currentCase;
  els.simulationContent.innerHTML = `
    <div class="sim-grid">
      <article class="clinical-card">
        <p class="eyebrow">${escapeHtml(current.clinical.eyebrow)}</p>
        <h3>${escapeHtml(current.clinical.title)}</h3>
        <p class="lead">${escapeHtml(current.clinical.description)}</p>
        <h4>Monitor</h4>
        ${dataGrid(current.clinical.monitor, 'monitor-grid')}
        <h4>Hemorragia</h4>
        ${hemorrhageGrid(current.clinical.hemorrhage)}
        ${current.clinical.labs ? `<h4>Laboratorio disponible</h4>${dataGrid(current.clinical.labs, 'compact-grid')}` : ''}
      </article>
      <article class="question-card trace-card">
        <div class="trace-heading">
          <div><p class="eyebrow">Trazado inicial</p><h3>Observe antes de revelar valores</h3></div>
          <span class="trace-tag">TEG</span>
        </div>
        ${tegSvg(current.teg.pattern)}
        <p class="trace-instruction">Identifique visualmente el patrón. Los valores numéricos aparecerán al iniciar la interpretación.</p>
        <button class="next" id="beginQuestionsBtn">Revelar valores e interpretar</button>
      </article>
    </div>
  `;

  document.getElementById('beginQuestionsBtn').addEventListener('click', () => {
    state.phase = 'questions';
    renderCurrentPhase();
  });
}

function renderQuestion() {
  const current = state.currentCase;
  const question = current.questions[state.questionIndex];
  const previous = state.answers[state.questionIndex];

  els.simulationContent.innerHTML = `
    <div class="sim-grid">
      <article class="clinical-card sticky-card">
        <p class="eyebrow">Datos TEG</p>
        ${tegSvg(current.teg.pattern)}
        ${tegValues(current.teg)}
        <details class="clinical-context">
          <summary>Ver contexto clínico</summary>
          <p>${escapeHtml(current.clinical.description)}</p>
          ${hemorrhageGrid(current.clinical.hemorrhage)}
        </details>
      </article>
      <article class="question-card">
        <div class="question-count">Pregunta ${state.questionIndex + 1} de ${current.questions.length}</div>
        <h3>${escapeHtml(question.title)}</h3>
        <div class="answers">
          ${question.answers.map((answer, index) => `
            <button class="answer ${previous ? answerClass(previous, question.correct, index) : ''}" data-answer-index="${index}" ${previous ? 'disabled' : ''}>
              <span class="answer-letter">${String.fromCharCode(65 + index)}</span>
              <span>${escapeHtml(answer)}</span>
            </button>
          `).join('')}
        </div>
        <div id="feedbackArea">${previous ? feedbackMarkup(previous.correct, question.feedback) : ''}</div>
      </article>
    </div>
  `;

  if (previous) {
    appendContinueButton();
  } else {
    els.simulationContent.querySelectorAll('[data-answer-index]').forEach((button) => {
      button.addEventListener('click', () => submitAnswer(Number(button.dataset.answerIndex)));
    });
  }
}

function submitAnswer(selectedIndex) {
  const question = state.currentCase.questions[state.questionIndex];
  const correct = selectedIndex === question.correct;
  if (correct) state.score += state.scoring.points_per_question;
  state.answers[state.questionIndex] = { selectedIndex, correct };
  renderCurrentPhase();
}

function answerClass(previous, correctIndex, index) {
  if (index === correctIndex) return 'correct';
  if (index === previous.selectedIndex && !previous.correct) return 'wrong';
  return 'dimmed';
}

function feedbackMarkup(correct, text) {
  return `<div class="feedback ${correct ? 'good' : 'bad'}"><strong>${correct ? 'Correcto.' : 'Revisa la interpretación.'}</strong> ${escapeHtml(text)}</div>`;
}

function appendContinueButton() {
  const feedbackArea = document.getElementById('feedbackArea');
  const isLast = state.questionIndex === state.currentCase.questions.length - 1;
  const button = document.createElement('button');
  button.className = 'next';
  button.textContent = isLast ? 'Ver evolución clínica' : 'Continuar';
  button.addEventListener('click', () => {
    if (isLast) state.phase = 'evolution';
    else state.questionIndex += 1;
    renderCurrentPhase();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  feedbackArea.appendChild(button);
}

function renderEvolution() {
  const current = state.currentCase;
  const evolution = current.evolution;
  els.simulationContent.innerHTML = `
    <article class="evolution-card">
      <div class="evolution-header">
        <div><p class="eyebrow">Evolución · ${escapeHtml(evolution.after)}</p><h3>Respuesta clínica</h3></div>
        <span class="source-control ${isControlled(evolution.hemorrhage) ? 'controlled' : ''}">${escapeHtml(evolution.hemorrhage.Fuente || 'Fuente no especificada')}</span>
      </div>
      <p class="lead">${escapeHtml(evolution.description)}</p>
      <div class="comparison-grid">
        <section>
          <h4>Situación inicial</h4>
          ${dataGrid(current.clinical.monitor, 'monitor-grid')}
          ${hemorrhageGrid(current.clinical.hemorrhage)}
        </section>
        <div class="comparison-arrow" aria-hidden="true">→</div>
        <section>
          <h4>Después de la intervención</h4>
          ${dataGrid(evolution.monitor, 'monitor-grid')}
          ${hemorrhageGrid(evolution.hemorrhage)}
        </section>
      </div>
      <div class="cumulative-rule"><strong>Regla del simulador:</strong> la pérdida sanguínea acumulada nunca disminuye; el sangrado activo sí puede reducirse o cesar.</div>
      <button class="next" id="showDebriefBtn">Ver resultado y debriefing</button>
    </article>
  `;
  document.getElementById('showDebriefBtn').addEventListener('click', () => {
    state.phase = 'debrief';
    renderCurrentPhase();
  });
}

function renderDebrief() {
  const current = state.currentCase;
  const maximum = current.questions.length * state.scoring.points_per_question;
  const percent = maximum ? Math.round((state.score / maximum) * 100) : 0;
  const band = getResultBand(percent);

  els.simulationContent.innerHTML = `
    <article class="result-card">
      <p class="eyebrow">Caso completado</p>
      <h3>${escapeHtml(current.diagnosis)}</h3>
      <div class="result-score">${state.score}<small>/${maximum}</small></div>
      <div class="result-band">${escapeHtml(band)}</div>
      <p class="result-summary">Obtuviste ${percent}% de las respuestas correctas.</p>
      <div class="debrief-box">
        <h4>Puntos clave</h4>
        <ul>${current.debrief.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
      <div class="answer-review">
        ${current.questions.map((question, index) => {
          const answer = state.answers[index];
          return `<div><span class="review-icon ${answer?.correct ? 'ok' : 'miss'}">${answer?.correct ? '✓' : '!'}</span><p><strong>${escapeHtml(question.id || `P${index + 1}`)}</strong> ${escapeHtml(question.title)}</p></div>`;
        }).join('')}
      </div>
      <div class="result-actions">
        <button class="primary" id="restartBtn">Repetir caso</button>
        <button class="secondary" id="returnBtn">Volver a casos</button>
      </div>
    </article>
  `;

  document.getElementById('restartBtn').addEventListener('click', () => startCase(current.id));
  document.getElementById('returnBtn').addEventListener('click', () => {
    showScreen('cases');
    resetCaseState();
  });
}

function getResultBand(percent) {
  const bands = [...(state.scoring.result_bands || [])].sort((a, b) => b.min - a.min);
  return bands.find((band) => percent >= band.min)?.label || (percent >= state.scoring.passing_percent ? 'Competente' : 'Requiere refuerzo');
}

function dataGrid(data = {}, className = '') {
  return `<div class="data-grid ${className}">${Object.entries(data).map(([label, value]) => `
    <div class="data-item"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>
  `).join('')}</div>`;
}

function hemorrhageGrid(data = {}) {
  const normalized = [
    ['Pérdida acumulada', data['Pérdida acumulada'] ?? data['Perdida acumulada'] ?? 'No disponible'],
    ['Sangrado activo', data['Sangrado activo'] ?? 'No disponible'],
    ['Fuente', data.Fuente ?? 'No disponible'],
  ];
  return `<div class="hemorrhage-grid">${normalized.map(([label, value]) => `
    <div class="hemorrhage-item ${label === 'Pérdida acumulada' ? 'cumulative' : ''}"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>
  `).join('')}</div>`;
}

function tegValues(teg) {
  const preferredOrder = ['LY30', 'EPL', 'IC', 'R', 'K', 'MA', 'Alpha'];
  return `<div class="teg-values">${preferredOrder.filter((key) => teg[key] !== undefined).map((key) => `
    <div><small>${key === 'Alpha' ? 'Ángulo α' : escapeHtml(key)}</small><strong>${escapeHtml(teg[key])}</strong></div>
  `).join('')}</div>`;
}

function tegSvg(pattern = 'normal') {
  const presets = {
    normal: { delay: 95, amp: 77, labelA: 'Inicio conservado', labelB: 'Fuerza conservada' },
    factor: { delay: 220, amp: 68, labelA: 'R prolongado', labelB: 'MA conservada' },
    fibrinogen: { delay: 110, amp: 48, labelA: 'Formación lenta', labelB: 'Coágulo débil' },
    platelet: { delay: 100, amp: 42, labelA: 'Inicio conservado', labelB: 'MA disminuida' },
    lysis: { delay: 95, amp: 76, labelA: 'Formación inicial', labelB: 'Lisis acelerada' },
  };
  const p = presets[pattern] || presets.normal;
  const center = 140;
  const start = 45;
  const open = start + p.delay;
  const x2 = 420;
  const end = 675;
  const upper = center - p.amp;
  const lower = center + p.amp;
  const lysisEndAmp = pattern === 'lysis' ? 26 : p.amp * 0.92;
  const endUpper = center - lysisEndAmp;
  const endLower = center + lysisEndAmp;

  return `<svg class="teg-chart" viewBox="0 0 720 280" role="img" aria-label="Trazado TEG del caso">
    <defs><linearGradient id="traceGlow" x1="0" x2="1"><stop offset="0" stop-color="#f0c982"/><stop offset="1" stop-color="#d9ad67"/></linearGradient></defs>
    <line x1="35" y1="${center}" x2="690" y2="${center}" class="chart-axis"/>
    <line x1="${open}" y1="35" x2="${open}" y2="245" class="chart-guide"/>
    <path d="M${start} ${center} C${open - 55} ${center}, ${open - 18} ${center}, ${open} ${center - 5} C${open + 55} ${center - 18}, ${x2 - 65} ${upper + 10}, ${x2} ${upper} C535 ${upper - 6}, 610 ${endUpper - 4}, ${end} ${endUpper}" class="trace-line"/>
    <path d="M${start} ${center} C${open - 55} ${center}, ${open - 18} ${center}, ${open} ${center + 5} C${open + 55} ${center + 18}, ${x2 - 65} ${lower - 10}, ${x2} ${lower} C535 ${lower + 6}, 610 ${endLower + 4}, ${end} ${endLower}" class="trace-line"/>
    <text x="52" y="38" class="chart-label">${escapeHtml(p.labelA)}</text>
    <text x="500" y="38" class="chart-label">${escapeHtml(p.labelB)}</text>
  </svg>`;
}

function isControlled(hemorrhage = {}) {
  return String(hemorrhage.Fuente || '').toLowerCase().includes('controlada');
}

function errorPanel(title, message) {
  return `<div class="error-card"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
}

function showMessage(message) {
  els.appMessage.textContent = message;
  els.appMessage.classList.add('visible');
  setTimeout(() => els.appMessage.classList.remove('visible'), 4000);
}

document.addEventListener('DOMContentLoaded', init);
