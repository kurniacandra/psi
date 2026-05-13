
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, push, set, remove, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey:"AIzaSyCT6bL4sZxLEFr_wyxAW7VPRxLukNQ02mw",
  authDomain:"simulasi-2b93b.firebaseapp.com",
  databaseURL:"https://simulasi-2b93b-default-rtdb.firebaseio.com",
  projectId:"simulasi-2b93b",
  appId:"1:562508858666:web:fa63f71ec175c675e64a53"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getDatabase(app);

const config = window.__SOAL_TEMPLATE_CONFIG || {};
const BANK = Array.isArray(window.__SOAL_TEMPLATE_QUESTIONS) ? window.__SOAL_TEMPLATE_QUESTIONS : [];
const DURATION_SECONDS = Number(config.durationMinutes || 60) * 60;
const STORAGE_KEY = config.storageKey || ('template_session_' + (config.examFile || config.examType || 'exam'));

const email = localStorage.getItem('pesertaEmail') || '';
const session = localStorage.getItem('currentSession') || null;
const savedStatus = localStorage.getItem('userStatus') || '';
const userId = window.resultUtils.makeUserId(email || 'guest');
const vipEmails = ["akmalfauzan@gmail.com","admin@gmail.com"];
const liveRef = ref(db, 'temp_progress/' + userId);
let currentUserData = null;
let questions = [];
let currentIndex = 0;
let answers = [];
let remainingSeconds = DURATION_SECONDS;
let finished = false;
let timerInt = null;
let createdAt = Date.now();
let lastLiveMonitorAt = 0;
let liveMonitorBusy = false;
const LIVE_MONITOR_INTERVAL_MS = Number(config.liveMonitorIntervalMs || 8000);

const $ = (id) => document.getElementById(id);
function escapeHtml(v){ return window.resultUtils.escapeHtml ? window.resultUtils.escapeHtml(v) : String(v ?? '').replace(/[&<>"']/g, s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function fmtTime(total){ const h=String(Math.floor(total/3600)).padStart(2,'0'); const m=String(Math.floor((total%3600)/60)).padStart(2,'0'); const s=String(total%60).padStart(2,'0'); return `${h}:${m}:${s}`; }
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function normalizeChoiceValue(v){ if(Array.isArray(v)) return [...v].map(x=>String(x).trim().toUpperCase()).sort(); if(v==null || v==='') return null; return String(v).trim().toUpperCase(); }
function isMulti(q){ return String(q.type||'single').toLowerCase() === 'multi'; }
function isAnswered(q, value){ if(isMulti(q)) return Array.isArray(value) && value.length>0; return value!=null && value!==''; }
function isPartial(q, value){ return isMulti(q) && Array.isArray(value) && value.length===1; }
function isCorrect(q, value){ const correct = q.answer ?? q.key ?? null; if(isMulti(q)){ const picked = normalizeChoiceValue(value) || []; const need = normalizeChoiceValue((correct||'').split('')) || []; return picked.length===need.length && picked.join('')===need.join(''); } return String(normalizeChoiceValue(value) || '') === String(normalizeChoiceValue(correct) || ''); }
function pointsEarned(q, value){ if(!isAnswered(q, value)) return 0; if(config.scoringMode === 'points') return Number((q.points||{})[value] || 0); return isCorrect(q, value) ? 1 : 0; }
function maxPoints(q){
  if(config.scoringMode !== 'points') return 1;
  const vals = Object.values(q.points || {}).map(Number).filter(Number.isFinite);
  return vals.length ? Math.max(...vals) : Number(config.defaultMaxPoints || 4);
}
function currentQuestion(){ return questions[currentIndex] || null; }

async function updateLiveMonitor(){
  if(!email) return;
  const q = currentQuestion() || {};
  const answersMap = {};
  questions.forEach((item, idx)=>{ const val = answers[idx]; if(isAnswered(item,val)) answersMap[item.number || idx+1] = Array.isArray(val) ? val.join('') : val; });
  const payload = {
    email,
    stage: config.sectionLabel || config.examName || 'Ujian',
    updatedAt: Date.now(),
    waktu: new Date().toISOString(),
    nomor: currentIndex + 1,
    total: questions.length,
    timeLeft: remainingSeconds,
    answered: answers.filter((v, idx)=>isAnswered(questions[idx], v)).length,
    currentQuestionBank: Number(q.number || 0),
    currentQuestionSession: Number(q.sessionNumber || currentIndex + 1),
    answers: answersMap,
    examType: config.examType,
    examFile: config.examFile
  };
  try{ await set(liveRef, payload); }catch(_e){}
}
async function clearLiveMonitor(){ try{ await remove(liveRef); }catch(_e){} }

function getPersistentState(){
  if(config.randomBank){
    return { createdAt, selectedIds: questions.map(q=>q.number), answers, currentIndex, remainingSeconds, finished };
  }
  return { createdAt, answers, currentIndex, remainingSeconds, finished };
}
function queueLiveMonitor(force=false){
  if(!email) return;
  const now = Date.now();
  if(!force && now - lastLiveMonitorAt < LIVE_MONITOR_INTERVAL_MS) return;
  if(liveMonitorBusy) return;
  lastLiveMonitorAt = now;
  liveMonitorBusy = true;
  updateLiveMonitor().finally(()=>{ liveMonitorBusy = false; });
}
function saveSession(forceLive=false){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistentState())); }catch(_e){}
  queueLiveMonitor(forceLive);
}
function loadSession(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(!data || data.finished) return false;
    createdAt = Number(data.createdAt) || Date.now();
    if(config.randomBank){
      if(!Array.isArray(data.selectedIds) || data.selectedIds.length !== Number(config.sessionSize||50)) return false;
      const byId = new Map(BANK.map(q=>[q.number, q]));
      questions = data.selectedIds.map((id, idx)=>({ ...(byId.get(id)||{}), sessionNumber: idx+1 })).filter(q=>q && q.number!=null);
      if(!questions.length) return false;
    } else {
      questions = BANK.map((q, idx)=>({ ...q, sessionNumber: idx + 1 }));
    }
    answers = Array.isArray(data.answers) ? data.answers : Array(questions.length).fill(null);
    currentIndex = Math.max(0, Math.min(Number(data.currentIndex)||0, questions.length-1));
    remainingSeconds = Number.isFinite(data.remainingSeconds) ? data.remainingSeconds : DURATION_SECONDS;
    finished = false;
    return true;
  }catch(_e){ return false; }
}
function buildNewSession(){
  createdAt = Date.now();
  if(config.randomBank){
    const size = Number(config.sessionSize || 50);
    questions = shuffle(BANK).slice(0, size).map((q, idx)=>({ ...q, sessionNumber: idx + 1 }));
  } else {
    questions = BANK.map((q, idx)=>({ ...q, sessionNumber: idx + 1 }));
  }
  answers = Array(questions.length).fill(null);
  currentIndex = 0;
  remainingSeconds = DURATION_SECONDS;
  finished = false;
  saveSession();
}

function renderIntro(){
  $('screen-loading').classList.add('hidden');
  $('screen-main').classList.remove('hidden');
  $('screen-section').classList.add('hidden');
  $('screen-result').classList.add('hidden');
  $('introBadge').textContent = `${(config.examName || 'UJIAN').toUpperCase()}${questions.length ? ' • ' + questions.length + ' SOAL' : ''}`;
  $('introTitle').textContent = config.introTitle || 'Template Soal';
  $('introText').textContent = config.introText || 'Format tes mengikuti template soal.html.';
  $('stagePill').textContent = config.sectionLabel || config.examName || 'Ujian';
  $('statTotal').textContent = String(config.randomBank ? (config.sessionSize || questions.length || BANK.length) : (questions.length || BANK.length));
  $('statTime').textContent = `${config.durationMinutes || 60} Menit`;
  const hasMulti = (questions.length ? questions : BANK).some(q => isMulti(q));
  $('statMode').textContent = config.scoringMode === 'points' ? (config.pointsLabel || 'Poin') : (hasMulti ? 'Single / Multi' : 'Single');
}

function renderNav(){
  const grid = $('numberGrid'); grid.innerHTML = '';
  questions.forEach((q, idx)=>{
    const btn = document.createElement('div');
    btn.className = 'num-btn';
    if(idx===currentIndex) btn.classList.add('active');
    if(isAnswered(q, answers[idx])) btn.classList.add('answered');
    else if(isPartial(q, answers[idx])) btn.classList.add('partial');
    btn.textContent = q.sessionNumber || (idx+1);
    btn.onclick = ()=>{ currentIndex = idx; saveSession(true); renderQuestion(); };
    grid.appendChild(btn);
  });
}
function renderQuestion(){
  const q = currentQuestion(); if(!q) return;
  $('sectionBadge').textContent = (config.sectionLabel || config.examName || 'UJIAN').toUpperCase();
  $('categoryBadge').textContent = q.categoryLabel || q.category || config.sectionLabel || config.examName || 'Materi';
  $('typeBadge').textContent = config.scoringMode === 'points' ? (config.pointsLabel || 'Poin') : (isMulti(q) ? 'Multi' : 'Single');
  $('sectionHelp').textContent = config.scoringMode === 'points'
    ? ('Klik jawaban untuk menyimpan. ' + (config.pointsHelp || 'Nilai dihitung berdasarkan poin tiap opsi.') + ' Review otomatis tersimpan di hasil.')
    : (isMulti(q) ? 'Soal multi harus memilih 2 opsi. Klik jawaban untuk menyimpan.' : 'Klik jawaban untuk menyimpan.');
  $('sectionQno').textContent = `Soal ${q.sessionNumber || currentIndex + 1} dari ${questions.length}` + (q.number != null ? ` • No bank ${q.number}` : '');
  $('sectionQtext').innerHTML = String(q.text || '').replace(/\n/g,'<br>');
  const imgHost = $('sectionQImages'); imgHost.innerHTML = '';
  (Array.isArray(q.images) ? q.images : []).forEach(src=>{ const img=document.createElement('img'); img.src=src; img.className='img-fluid-custom'; imgHost.appendChild(img); });
  const optHost = $('sectionOptions'); optHost.innerHTML = '';
  const currentVal = answers[currentIndex];
  Object.keys(q.options || {}).forEach(key=>{
    const box = document.createElement('div');
    box.className = 'option-box';
    const selected = isMulti(q) ? (Array.isArray(currentVal) && currentVal.includes(key)) : currentVal === key;
    if(selected) box.classList.add('selected');
    if(isPartial(q,currentVal) && selected) box.classList.add('partial');
    let inner = `<strong>${escapeHtml(key)}.</strong> ${escapeHtml(q.options[key] || '')}`;
    const optionImageList = q.optionImages && q.optionImages[key]
      ? (Array.isArray(q.optionImages[key]) ? q.optionImages[key] : [q.optionImages[key]])
      : [];
    if(optionImageList.length){
      inner += `<div style="margin-top:8px">${optionImageList.map(src=>`<img class="img-fluid-custom" style="max-width:220px" src="${escapeHtml(src)}">`).join('')}</div>`;
    }
    box.innerHTML = inner;
    box.onclick = ()=>selectOption(key);
    optHost.appendChild(box);
  });
  $('prevBtn').disabled = currentIndex===0;
  $('nextBtn').disabled = currentIndex===questions.length-1;
  renderNav();
}
function selectOption(key){
  if(finished) return;
  const q = currentQuestion();
  if(!q) return;
  if(isMulti(q)){
    let picked = Array.isArray(answers[currentIndex]) ? [...answers[currentIndex]] : [];
    if(picked.includes(key)) picked = picked.filter(v=>v!==key); else if(picked.length<2) picked.push(key); else picked = [picked[1], key];
    answers[currentIndex] = picked;
    saveSession(true);
    renderQuestion();
    if(picked.length===2){
      if(currentIndex < questions.length - 1){ currentIndex += 1; saveSession(true); renderQuestion(); }
    }
    return;
  }
  answers[currentIndex] = key;
  saveSession(true);
  if(currentIndex < questions.length - 1){ currentIndex += 1; saveSession(true); renderQuestion(); }
  else { renderQuestion(); }
}
function computeSummary(){
  const answered = answers.filter((v, idx)=>isAnswered(questions[idx], v)).length;
  const correct = config.scoringMode === 'correct' ? questions.filter((q, idx)=>isCorrect(q, answers[idx])).length : null;
  const rawPoints = questions.reduce((sum, q, idx)=>sum + pointsEarned(q, answers[idx]), 0);
  const maxPts = questions.reduce((sum, q)=>sum + maxPoints(q), 0);
  const wrong = config.scoringMode === 'correct' ? Math.max(0, answered - (correct || 0)) : Math.max(0, answered - questions.filter((q, idx)=>pointsEarned(q, answers[idx]) === maxPoints(q)).length);
  const empty = questions.length - answered;
  const score = maxPts ? Math.round((rawPoints / maxPts) * 100) : 0;
  const displayScore = String(config.examType || '').toUpperCase() === 'SKD' ? rawPoints : score;
  return { answered, correct: correct ?? questions.filter((q, idx)=>pointsEarned(q, answers[idx]) === maxPoints(q)).length, wrong, empty, rawPoints, maxPoints: maxPts, score, normalizedScore: score, percentageScore: score, displayScore };
}
function computeSectionSummary(){
  const map = new Map();
  questions.forEach((q, idx)=>{
    const code = String(q.category || q.section || config.examType || 'UJIAN').toUpperCase();
    const label = q.categoryLabel || q.sectionLabel || code;
    if(!map.has(code)) map.set(code, { code, label, totalQuestions:0, answered:0, correct:0, wrong:0, empty:0, rawPoints:0, maxPoints:0, score:0 });
    const row = map.get(code);
    const val = answers[idx];
    const answeredNow = isAnswered(q, val);
    const pts = pointsEarned(q, val);
    const max = maxPoints(q);
    row.totalQuestions += 1;
    row.maxPoints += max;
    row.rawPoints += pts;
    if(answeredNow) row.answered += 1; else row.empty += 1;
    if(answeredNow && pts === max) row.correct += 1;
    else if(answeredNow) row.wrong += 1;
  });
  return Array.from(map.values()).map(row=>({ ...row, score: row.maxPoints ? Math.round((row.rawPoints / row.maxPoints) * 100) : 0 }));
}
function buildReviewItems(){
  return window.resultUtils.buildReviewItemsFromQuestions(questions, answers, {
    section: String(config.examType || '').toLowerCase(),
    sectionLabel: config.sectionLabel || config.examName,
    evaluate: (userAns, correctAns, q) => isCorrect(q, userAns),
    getPoints: (q, userAns) => pointsEarned(q, userAns),
    getMaxPoints: (q) => maxPoints(q)
  }).map((item, idx)=>({
    ...item,
    section: questions[idx].category || questions[idx].section || item.section,
    sectionLabel: questions[idx].categoryLabel || questions[idx].category || item.sectionLabel,
    user_answer: Array.isArray(answers[idx]) ? answers[idx] : answers[idx] ?? null,
    user_answer_text: Array.isArray(answers[idx]) ? answers[idx].join('') : (answers[idx] || '-'),
    correct_answer: questions[idx].answer ?? questions[idx].key ?? null,
    correct_answer_text: questions[idx].answer ?? questions[idx].key ?? '-',
    session_number: questions[idx].sessionNumber || idx + 1
  }));
}
async function saveResult(payload){
  try{
    const pushedRef = push(ref(db, 'rekap_skor'));
    payload._id = pushedRef.key;
    payload.resultId = pushedRef.key;
    await set(pushedRef, payload);
    if(Array.isArray(config.extraPaths)){
      for(const path of config.extraPaths){
        try{ await set(ref(db, path + '/' + pushedRef.key), payload); }catch(e){ console.warn(e); }
      }
    }
  }catch(e){ console.warn(e); }
  try{ localStorage.setItem('hasilTerakhir', JSON.stringify(payload)); }catch(_e){}
}
function renderResult(summary, reviewItems){
  $('screen-section').classList.add('hidden');
  $('screen-result').classList.remove('hidden');
  const isSKD = String(config.examType || '').toUpperCase() === 'SKD';
  const stats = config.scoringMode === 'points'
    ? (isSKD ? [
        ['Poin SKD', summary.rawPoints],
        ['Maksimal', summary.maxPoints],
        ['Persentase', summary.score],
        ['Terjawab', summary.answered]
      ] : [
        ['Raw Poin', summary.rawPoints],
        ['Maksimal', summary.maxPoints],
        ['Nilai', summary.score],
        ['Terjawab', summary.answered]
      ])
    : [
        ['Benar', summary.correct],
        ['Salah', summary.wrong],
        ['Kosong', summary.empty],
        ['Nilai', summary.score]
      ];
  const statHtml = stats.map(([label, value])=>`<div class="stat-card"><h4>${escapeHtml(label)}</h4><div class="stat-value">${escapeHtml(value)}</div></div>`).join('');
  const sections = computeSectionSummary();
  const sectionHtml = sections.length > 1 ? `<div class="card" style="margin-top:18px"><h3 style="margin-top:0">Ringkasan Per Subtest</h3><div class="stats-grid">${sections.map(sec=>`<div class="stat-card"><h4>${escapeHtml(sec.code)}</h4><div class="stat-value">${escapeHtml(sec.rawPoints)} / ${escapeHtml(sec.maxPoints)}</div><div class="small-muted">${escapeHtml(sec.label)} • ${escapeHtml(sec.correct)} terbaik, ${escapeHtml(sec.wrong)} belum maksimal, ${escapeHtml(sec.empty)} kosong</div></div>`).join('')}</div></div>` : '';
  const reviewHtml = reviewItems.map((item, idx)=>{
    const statusClass = item.status === 'benar' ? 'pill-ok' : (item.status === 'salah' ? 'pill-no' : 'pill-empty');
    const statusText = item.status === 'benar' ? 'Benar' : (item.status === 'salah' ? 'Salah' : 'Kosong');
    const optionsHtml = Object.keys(item.options || {}).map(key=>{
      let cls = 'review-option';
      const userAns = Array.isArray(item.user_answer) ? item.user_answer : [item.user_answer];
      const correctAns = Array.isArray(item.correct_answer) ? item.correct_answer : String(item.correct_answer || '').split('');
      if(correctAns.includes(key)) cls += ' correct';
      if(userAns.includes(key) && !correctAns.includes(key)) cls += ' picked-wrong';
      const label = `${escapeHtml(key)}. ${escapeHtml(item.options[key] || '')}`;
      const optionImageList = item.optionImages && item.optionImages[key]
        ? (Array.isArray(item.optionImages[key]) ? item.optionImages[key] : [item.optionImages[key]])
        : [];
      const image = optionImageList.length ? `<div style="margin-top:8px">${optionImageList.map(src=>`<img class="img-fluid-custom" style="max-width:220px" src="${escapeHtml(src)}">`).join('')}</div>` : '';
      return `<div class="${cls}">${label}${image}</div>`;
    }).join('');
    const imagesHtml = Array.isArray(item.images) ? item.images.map(src=>`<img class="img-fluid-custom" src="${escapeHtml(src)}">`).join('') : '';
    return `<div class="review-item"><div class="review-head"><h3 style="margin:0">Soal ${escapeHtml(item.session_number || item.number || (idx+1))}</h3><span class="${statusClass}">${statusText}</span></div><div class="small-muted" style="margin:6px 0 12px">${escapeHtml(item.sectionLabel || config.sectionLabel || '')}</div><div style="font-weight:700;margin-bottom:12px;line-height:1.7">${String(item.text || '').replace(/\n/g,'<br>')}</div>${imagesHtml}${optionsHtml}<div class="small-muted" style="margin-top:10px">Jawaban Anda: <strong>${escapeHtml(item.user_answer_text || '-')}</strong> • Kunci: <strong>${escapeHtml(item.correct_answer_text || '-')}</strong>${config.scoringMode === 'points' ? ` • Poin: <strong>${escapeHtml(item.points_earned ?? 0)}/${escapeHtml(item.max_points ?? 4)}</strong>` : ''}</div>${item.explanation ? `<div class="small-muted" style="margin-top:8px">Penjelasan: ${escapeHtml(item.explanation)}</div>` : ''}${Array.isArray(item.explanationImages) && item.explanationImages.length ? `<div style="margin-top:8px">${item.explanationImages.map(src=>`<img class="img-fluid-custom" src="${escapeHtml(src)}">`).join('')}</div>` : ''}</div>`;
  }).join('');
  $('resultHost').innerHTML = `<div class="card"><div class="badge">HASIL ${escapeHtml((config.examName||'UJIAN').toUpperCase())}</div><h2 style="margin-top:0">Hasil ${escapeHtml(config.examName || 'Ujian')}</h2><div class="stats-grid" style="margin-top:18px">${statHtml}</div>${sectionHtml}<p class="small-muted" style="margin-top:16px">Riwayat dan review soal langsung tersimpan ke database pusat agar bisa dibuka dari admin dan halaman peserta.</p><div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px"><a href="main.html" class="btn btn-outline">Kembali ke Menu</a><button type="button" class="btn btn-primary" id="restartExamBtn">Ulangi Paket Ini</button></div><div class="review-list">${reviewHtml}</div></div>`;
  $('restartExamBtn').onclick = ()=>{ localStorage.removeItem(STORAGE_KEY); location.reload(); };
}
async function finishExam(auto=false){
  if(finished) return;
  const active = currentQuestion();
  if(active && isPartial(active, answers[currentIndex])){ alert('Soal ini harus pilih 2 jawaban dulu.'); return; }
  if(!auto && !confirm(config.finishConfirmText || `Yakin menyelesaikan ${config.examName || 'ujian'}?`)) return;
  finished = true;
  clearInterval(timerInt);
  try{ localStorage.removeItem(STORAGE_KEY); }catch(_e){}
  await clearLiveMonitor();
  const summary = computeSummary();
  const sections = computeSectionSummary();
  const reviewItems = buildReviewItems();
  const payload = window.resultUtils.createExamResultPayload({
    nama: currentUserData?.nama || currentUserData?.name || (email ? email.split('@')[0] : 'Peserta'),
    email,
    userId,
    session: session || createdAt,
    userStatus: localStorage.getItem('userStatus') || null,
    examType: config.examType,
    examName: config.examName,
    examFile: config.examFile,
    packageCode: config.packageCode,
    score: String(config.examType || '').toUpperCase() === 'SKD' ? summary.rawPoints : summary.score,
    normalizedScore: summary.score,
    percentageScore: summary.score,
    nilaiPersen: summary.score,
    totalQuestions: questions.length,
    answered: summary.answered,
    correct: summary.correct,
    wrong: summary.wrong,
    empty: summary.empty,
    rawPoints: summary.rawPoints,
    maxPoints: summary.maxPoints,
    reviewItems,
    waktu: new Date().toLocaleString('id-ID'),
    submittedAtISO: new Date().toISOString(),
    timestamp: Date.now(),
    answers: answers,
    sections,
    durationSeconds: (Number(config.durationMinutes||0)*60) - remainingSeconds,
    remainingSeconds,
    summary: { durationSeconds: (Number(config.durationMinutes||0)*60) - remainingSeconds, remainingSeconds }
  });
  await saveResult(payload);
  renderResult(summary, reviewItems);
}
function startTimer(){
  $('globalTimer').textContent = fmtTime(remainingSeconds);
  clearInterval(timerInt);
  timerInt = setInterval(()=>{
    if(finished) return;
    remainingSeconds -= 1;
    if(remainingSeconds <= 0){ remainingSeconds = 0; $('globalTimer').textContent = fmtTime(remainingSeconds); saveSession(); finishExam(true); return; }
    $('globalTimer').textContent = fmtTime(remainingSeconds);
    saveSession();
  }, 1000);
}
function setCurrentUserFromCache(){
  currentUserData = {
    email,
    status: localStorage.getItem('userStatus') || savedStatus || 'aktif',
    nama: localStorage.getItem('userName') || (email ? email.split('@')[0] : 'Peserta')
  };
}
async function refreshCurrentUserData(){
  if(!email) return null;
  try{
    const snap = await get(ref(db, 'users/' + userId));
    if(!snap.exists()) return null;
    const data = snap.val() || {};
    currentUserData = data;
    if(data.status) localStorage.setItem('userStatus', data.status);
    if(data.nama || data.name) localStorage.setItem('userName', data.nama || data.name);
    if(String(data.status || '').toLowerCase() === 'nonaktif'){
      localStorage.clear();
      alert('Akun Anda telah dinonaktifkan oleh admin.');
      location.replace('index.html');
    }
    return data;
  }catch(_e){
    return null;
  }
}
async function ensureAccess(){
  if(config.requireLogin && (!email || !session)){
    alert(config.loginMessage || 'Silakan login dulu.');
    location.replace('index.html');
    return false;
  }
  if(!config.requireVIP && !config.requireLogin) return true;

  setCurrentUserFromCache();

  if(!config.requireVIP){
    refreshCurrentUserData();
    return true;
  }

  if(!email){ alert(config.vipMessage || 'Paket ini hanya untuk akun VIP.'); location.replace('index.html'); return false; }
  let status = String(localStorage.getItem('userStatus') || savedStatus || '').toLowerCase();
  let isVIP = status === 'vip' || vipEmails.includes(email);

  if(isVIP){
    refreshCurrentUserData();
    return true;
  }

  const freshData = await refreshCurrentUserData();
  status = String(freshData?.status || localStorage.getItem('userStatus') || savedStatus || '').toLowerCase();
  isVIP = status === 'vip' || vipEmails.includes(email);
  if(!isVIP){ alert(config.vipMessage || 'Paket ini hanya untuk akun VIP.'); location.replace('main.html'); return false; }
  return true;
}
function attachEvents(){
  $('startMainBtn').onclick = ()=>{ $('screen-main').classList.add('hidden'); $('screen-section').classList.remove('hidden'); renderQuestion(); startTimer(); saveSession(true); };
  $('prevBtn').onclick = ()=>{ if(currentIndex>0){ currentIndex -= 1; saveSession(true); renderQuestion(); } };
  $('nextBtn').onclick = ()=>{ const q=currentQuestion(); if(q && isPartial(q, answers[currentIndex])){ alert('Soal ini harus pilih 2 jawaban dulu.'); return; } if(currentIndex<questions.length-1){ currentIndex += 1; saveSession(true); renderQuestion(); } };
  $('finishSectionBtn').onclick = ()=>finishExam(false);
  $('logoutBtn').onclick = ()=>{ if(confirm('Keluar dari sesi ini?')){ try{ localStorage.removeItem(STORAGE_KEY); }catch(_e){} location.href='index.html'; } };
}
async function init(){
  $('userLine').textContent = email ? `Peserta: ${email}` : 'Mode lokal / belum login';
  $('screen-loading').classList.remove('hidden');
  attachEvents();
  const ok = await ensureAccess(); if(!ok) return;
  if(!loadSession()) buildNewSession();
  renderIntro();
  if(localStorage.getItem(STORAGE_KEY)) $('userLine').textContent = email ? `Peserta: ${email} • sesi tersimpan` : 'Mode lokal • sesi tersimpan';
}
init();
