(function(){
  function safeNumber(v, fallback=0){
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function safeArray(v){ return Array.isArray(v) ? v : []; }
  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }
  function normalizeEmail(email){ return String(email || '').trim().toLowerCase(); }
  function makeUserId(email){ return normalizeEmail(email).replace(/[.@]/g,'_'); }
  function makeDisplayName(email, fallback='Peserta'){
    const normalized = normalizeEmail(email);
    if(!normalized) return fallback;
    return normalized.split('@')[0] || fallback;
  }
  function formatLocalTime(input){
    try{
      const d = input ? new Date(input) : new Date();
      if (Number.isNaN(d.getTime())) return new Date().toLocaleString('id-ID');
      return d.toLocaleString('id-ID');
    }catch(_){ return new Date().toLocaleString('id-ID'); }
  }
  function normalizeAnswer(ans){
    if (Array.isArray(ans)) return ans.join(', ');
    if (ans === null || ans === undefined || ans === '') return '-';
    if (typeof ans === 'object') {
      try { return JSON.stringify(ans); } catch (_) { return String(ans); }
    }
    return String(ans);
  }
  function normalizeType(examType, fallbackFile=''){
    const upper = String(examType || '').toUpperCase();
    if (upper) return upper;
    const file = String(fallbackFile || '').toLowerCase();
    if (file.includes('skd')) return 'SKD';
    if (file.includes('bindo') || file.includes('bahasa_indonesia')) return 'BINDO';
    if (file.includes('pu') || file.includes('pengetahuan_umum')) return 'PU';
    if (file.includes('wk')) return 'WK';
    if (file.includes('mtk') || file.includes('matematika')) return 'MATEMATIKA';
    if (file.includes('kepri')) return 'KEPRI';
    if (file.includes('cerdas') || file === 'to.html' || file === 'to2.html') return 'CERDAS';
    if (file.includes('cermat') || file.includes('kecermatan')) return 'CERMAT';
    if (file.includes('soal')) return 'TRYOUT_FULL';
    return 'UJIAN';
  }
  function typeLabel(type){
    const upper = normalizeType(type);
    return ({
      TRYOUT_FULL:'Try Out Full',
      WK:'Wawasan Kebangsaan',
      MTK:'Matematika',
      MATEMATIKA:'Matematika',
      BINDO:'Bahasa Indonesia',
      PU:'Pengetahuan Umum',
      SKD:'SKD Kedinasan/CPNS',
      KEPRI:'Kepribadian',
      CERDAS:'Kecerdasan',
      CERMAT:'Kecermatan',
      UJIAN:'Ujian'
    })[upper] || upper;
  }
  function buildReviewItemsFromQuestions(questions, answers, opts={}){
    return safeArray(questions).map((q, idx) => {
      const userAnswer = Array.isArray(answers) ? answers[idx] : (answers?.[idx] ?? answers?.[q.number] ?? null);
      const correctAnswer = q.answer ?? q.key ?? null;
      const status = userAnswer == null || userAnswer === '' || (Array.isArray(userAnswer) && !userAnswer.length)
        ? 'kosong'
        : (opts.evaluate ? (opts.evaluate(userAnswer, correctAnswer, q) ? 'benar' : 'salah') : ((correctAnswer == null) ? 'terjawab' : (String(normalizeAnswer(userAnswer)) === String(normalizeAnswer(correctAnswer)) ? 'benar' : 'salah')));
      const pointsEarned = typeof opts.getPoints === 'function' ? safeNumber(opts.getPoints(q, userAnswer, idx), null) : null;
      const maxPoints = typeof opts.getMaxPoints === 'function' ? safeNumber(opts.getMaxPoints(q, idx), null) : null;
      return {
        section: opts.section || null,
        sectionLabel: opts.sectionLabel || null,
        number: safeNumber(q.number, idx + 1),
        type: q.type || 'single',
        text: q.text || '',
        options: q.options || {},
        images: safeArray(q.images),
        optionImages: q.optionImages || null,
        user_answer: userAnswer,
        user_answer_text: normalizeAnswer(userAnswer),
        correct_answer: correctAnswer,
        correct_answer_text: normalizeAnswer(correctAnswer),
        status,
        is_correct: status === 'benar',
        points_earned: pointsEarned,
        max_points: maxPoints,
        explanation: q.explanation || '',
        explanationImages: safeArray(q.explanationImages)
      };
    });
  }
  function createExamResultPayload(config={}){
    const nowIso = config.submittedAtISO || new Date().toISOString();
    const email = normalizeEmail(config.email || config.nama || '');
    const userId = config.userId || makeUserId(email || config.nama || 'guest');
    const examFile = config.examFile || config.file || '';
    const examType = normalizeType(config.examType, examFile);
    const reviewItems = safeArray(config.reviewItems);
    const analytics = config.analytics || {};
    const rawPointsInput = config.rawPoints ?? config.raw ?? null;
    const maxPointsInput = config.maxPoints ?? config.max ?? null;
    const normalizedInput = config.normalizedScore ?? config.percentageScore ?? config.nilaiPersen ?? config.score50 ?? config.normalized50 ?? config.score;
    let score = safeNumber(config.score ?? config.finalScore ?? config.skor ?? config.score50 ?? config.normalized50, 0);
    let normalizedScore = safeNumber(normalizedInput, 0);
    if (examType === 'SKD' && rawPointsInput !== null && rawPointsInput !== undefined) {
      score = safeNumber(rawPointsInput, score);
      const maxForPercent = safeNumber(maxPointsInput, 0);
      normalizedScore = maxForPercent ? Math.round((score / maxForPercent) * 100) : normalizedScore;
    }
    const payload = {
      resultVersion: 2,
      resultKind: 'exam_result',
      timestamp: safeNumber(config.timestamp, Date.now()),
      submittedAt: safeNumber(config.submittedAt, Date.now()),
      submittedAtISO: nowIso,
      waktu: config.waktu || formatLocalTime(nowIso),
      email,
      nama: config.nama || makeDisplayName(email, 'Peserta'),
      userId,
      session: config.session || null,
      userStatus: config.userStatus || null,
      examType,
      examLabel: typeLabel(examType),
      examName: config.examName || typeLabel(examType),
      examFile,
      packageCode: config.packageCode || null,
      examCategory: config.examCategory || null,
      score,
      finalScore: score,
      skor: score,
      normalizedScore,
      percentageScore: normalizedScore,
      nilaiPersen: normalizedScore,
      status: config.status || null,
      predikat: config.predikat || null,
      summary: {
        totalQuestions: safeNumber(config.totalQuestions, reviewItems.length),
        answered: safeNumber(config.answered, reviewItems.filter(item => item.status !== 'kosong').length),
        correct: safeNumber(config.correct, reviewItems.filter(item => item.status === 'benar').length),
        wrong: safeNumber(config.wrong, reviewItems.filter(item => item.status === 'salah').length),
        empty: safeNumber(config.empty, reviewItems.filter(item => item.status === 'kosong').length),
        rawPoints: rawPointsInput,
        maxPoints: maxPointsInput,
        weightedScore: config.weightedScore ?? config.score50 ?? config.normalized50 ?? null,
        normalizedScore,
        percentageScore: normalizedScore,
        nilaiPersen: normalizedScore,
        durationSeconds: config.durationSeconds ?? null,
        remainingSeconds: config.remainingSeconds ?? null
      },
      sections: config.sections || null,
      review_items: reviewItems,
      analytics,
      answers: config.answers || null,
      source: config.source || 'web',
      sourceFile: examFile
    };

    if (analytics.pola_benar) payload.pola_benar = analytics.pola_benar;
    if (analytics.pola_salah) payload.pola_salah = analytics.pola_salah;
    if (analytics.simbol) payload.simbol = analytics.simbol;
    if (analytics.detail_benar) payload.detail_benar = analytics.detail_benar;
    if (analytics.detail_salah) payload.detail_salah = analytics.detail_salah;
    if (analytics.kunci_kolom) payload.kunci_kolom = analytics.kunci_kolom;
    if (analytics.kecepatan != null) payload.kecepatan = analytics.kecepatan;
    if (analytics.ketelitian != null) payload.ketelitian = analytics.ketelitian;
    if (analytics.adaptasi != null) payload.adaptasi = analytics.adaptasi;
    if (analytics.ketahanan != null) payload.ketahanan = analytics.ketahanan;

    return payload;
  }

  function normalizeRecord(item, id=''){
    const record = item || {};
    const examType = normalizeType(record.examType || record.tipe, record.examFile || record.file);
    const submittedAtISO = record.submittedAtISO || record.waktu || null;
    const reviewItems = safeArray(record.review_items);
    const summary = record.summary || {};
    const rawPointsCandidate = summary.rawPoints ?? record.rawPoints ?? record.skor_raw ?? null;
    const maxPointsCandidate = summary.maxPoints ?? record.maxPoints ?? null;
    const storedScore = safeNumber(record.score ?? record.finalScore ?? record.skor ?? record.score50 ?? record.normalized50, 0);
    let score = storedScore;
    let normalizedScore = safeNumber(record.normalizedScore ?? record.percentageScore ?? record.nilaiPersen ?? summary.normalizedScore ?? summary.percentageScore ?? summary.nilaiPersen ?? record.score50 ?? record.normalized50, storedScore);
    if (examType === 'SKD' && rawPointsCandidate !== null && rawPointsCandidate !== undefined) {
      score = safeNumber(rawPointsCandidate, storedScore);
      const maxForPercent = safeNumber(maxPointsCandidate, 0);
      normalizedScore = maxForPercent ? Math.round((score / maxForPercent) * 100) : normalizedScore;
    }
    const email = normalizeEmail(record.email || record.nama || '');
    const analytics = record.analytics || {
      pola_benar: record.pola_benar || record.detail_benar || [],
      pola_salah: record.pola_salah || record.detail_salah || [],
      simbol: record.simbol || record.kunci_kolom || [],
      detail_benar: record.detail_benar || [],
      detail_salah: record.detail_salah || [],
      kunci_kolom: record.kunci_kolom || [],
      kecepatan: record.kecepatan,
      ketelitian: record.ketelitian,
      adaptasi: record.adaptasi,
      ketahanan: record.ketahanan
    };
    return {
      id,
      resultId: record.resultId || record._id || String(id || '').split('/').pop() || null,
      raw: record,
      email,
      nama: record.nama || makeDisplayName(email, 'Peserta'),
      userId: record.userId || makeUserId(email || record.nama || ''),
      session: record.session || null,
      userStatus: record.userStatus || null,
      examType,
      examLabel: record.examLabel || typeLabel(examType),
      examName: record.examName || record.tipe || typeLabel(examType),
      examFile: record.examFile || record.file || '',
      packageCode: record.packageCode || null,
      score,
      normalizedScore,
      percentageScore: normalizedScore,
      nilaiPersen: normalizedScore,
      submittedAtISO,
      waktu: record.waktu || formatLocalTime(submittedAtISO),
      status: record.status || record.predikat || null,
      summary: {
        totalQuestions: safeNumber(summary.totalQuestions ?? record.totalQuestions ?? record.total_soal, reviewItems.length || 0),
        answered: safeNumber(summary.answered ?? record.answered, reviewItems.filter(x => x.status !== 'kosong').length),
        correct: safeNumber(summary.correct ?? record.benar, reviewItems.filter(x => x.status === 'benar').length),
        wrong: safeNumber(summary.wrong ?? record.salah, reviewItems.filter(x => x.status === 'salah').length),
        empty: safeNumber(summary.empty ?? record.kosong, reviewItems.filter(x => x.status === 'kosong').length),
        rawPoints: rawPointsCandidate,
        maxPoints: maxPointsCandidate,
        weightedScore: summary.weightedScore ?? record.score50 ?? record.normalized50 ?? null,
        normalizedScore,
        percentageScore: normalizedScore,
        nilaiPersen: normalizedScore
      },
      reviewItems,
      analytics,
      sections: record.sections || null
    };
  }


  function looksLikeResultRecord(record){
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    const keys = Object.keys(record);
    if (!keys.length) return false;
    return [
      'resultKind','resultVersion','examType','examFile','review_items','score','skor','finalScore','waktu','timestamp','pola_benar','pola_salah','kunci_kolom','simbol','kecepatan','ketelitian','status','tipe','materi'
    ].some(key => key in record);
  }

  function flattenResultRecords(node, prefix=''){
    const out = [];
    const walk = (value, path='') => {
      if (!value || typeof value !== 'object') return;
      if (looksLikeResultRecord(value)) {
        out.push(normalizeRecord(value, path || String(out.length + 1)));
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item, idx) => walk(item, path ? `${path}/${idx}` : String(idx)));
        return;
      }
      Object.entries(value).forEach(([key, child]) => walk(child, path ? `${path}/${key}` : key));
    };
    walk(node, prefix);
    return out;
  }

  function getSymbolColumns(record){
    const analytics = record?.analytics || {};
    const source = analytics.kunci_kolom || analytics.simbol || record?.raw?.kunci_kolom || record?.raw?.simbol || [];
    if (!Array.isArray(source)) return [];
    return source.map((col, idx) => {
      const values = Array.isArray(col) ? col : [col];
      return {
        index: idx + 1,
        values: values.filter(v => v !== null && v !== undefined && String(v).trim() !== '').map(v => String(v))
      };
    }).filter(col => col.values.length);
  }

  function symbolPreview(record, limitCols=3, limitItems=5){
    const cols = getSymbolColumns(record);
    if (!cols.length) return '-';
    return cols.slice(0, limitCols).map(col => `K${col.index}: ${col.values.slice(0, limitItems).join(' ')}`).join(' • ');
  }
  function buildTrendSeries(records){
    return safeArray(records)
      .map((item, idx) => {
        const n = item.id ? normalizeRecord(item.raw || item, item.id) : normalizeRecord(item.raw || item, item.id || idx);
        return n;
      })
      .sort((a,b) => new Date(a.submittedAtISO || a.waktu).getTime() - new Date(b.submittedAtISO || b.waktu).getTime());
  }

  window.resultUtils = {
    safeNumber,
    safeArray,
    escapeHtml,
    normalizeEmail,
    makeUserId,
    makeDisplayName,
    normalizeAnswer,
    formatLocalTime,
    normalizeType,
    typeLabel,
    buildReviewItemsFromQuestions,
    createExamResultPayload,
    normalizeRecord,
    flattenResultRecords,
    getSymbolColumns,
    symbolPreview,
    buildTrendSeries
  };
})();
