(() => {
  const els = {
    bgCanvas: document.getElementById("bgCanvas"),
    mcqCount: document.getElementById("mcqCount"),
    timePerMcq: document.getElementById("timePerMcq"),
    negativeMarking: document.getElementById("negativeMarking"),
    answerKey: document.getElementById("answerKey"),
    examName: document.getElementById("examName"),
    startBtn: document.getElementById("startBtn"),
    omrGrid: document.getElementById("omrGrid"),
    prestartOverlay: document.getElementById("prestartOverlay"),
    countdownNum: document.getElementById("countdownNum"),
    totalTimer: document.getElementById("totalTimer"),
    questionTimer: document.getElementById("questionTimer"),
    progressText: document.getElementById("progressText"),
    progressBar: document.getElementById("progressBar"),
    statusTag: document.getElementById("statusTag"),
    modeLabel: document.getElementById("modeLabel"),
    endDialog: document.getElementById("endDialog"),
    continueBtn: document.getElementById("continueBtn"),
    giveUpBtn: document.getElementById("giveUpBtn"),
    resultsPanel: document.getElementById("resultsPanel"),
    validList: document.getElementById("validList"),
    overtimeList: document.getElementById("overtimeList"),
    accuracyStat: document.getElementById("accuracyStat"),
    avgTimeStat: document.getElementById("avgTimeStat"),
    varianceStat: document.getElementById("varianceStat"),
    streakStat: document.getElementById("streakStat"),
    overtimeStat: document.getElementById("overtimeStat"),
    scoreChip: document.getElementById("scoreChip"),
    moodChip: document.getElementById("moodChip"),
    resetBtn: document.getElementById("resetBtn"),
    saveSessionBtn: document.getElementById("saveSessionBtn"),
    historyBody: document.getElementById("historyBody"),
    clearHistoryBtn: document.getElementById("clearHistoryBtn"),
    exportCsvBtn: document.getElementById("exportCsvBtn"),
    exportJsonBtn: document.getElementById("exportJsonBtn"),
    openKeyBuilder: document.getElementById("openKeyBuilder"),
    answerOverlay: document.getElementById("answerOverlay"),
    answerGrid: document.getElementById("answerGrid"),
    applyKeyBuilder: document.getElementById("applyKeyBuilder"),
    clearKeyBuilder: document.getElementById("clearKeyBuilder"),
    closeKeyBuilder: document.getElementById("closeKeyBuilder"),
  };

  const state = {
    mcqCount: 0,
    timePerMcq: 0,
    negativeMarking: false,
    answerKey: [],
    examName: "",
    answers: [],
    totalDuration: 0,
    examStart: null,
    totalTimerId: null,
    prestartId: null,
    prestartSeconds: 10,
    lockedCount: 0,
    finished: false,
    currentQuestionStart: null,
    history: [],
    holdTimers: new Map(),
    holdRafs: new Map(),
  };

  const LOCAL_KEY = "omr-history";
  const HOLD_MS = 1000;
  const BACKEND_URL = window.BACKEND_URL || null; // optional hook
  let bgCtx = null;

  function formatTime(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  }

  function parseAnswerKey(str, count) {
    const letters = str.trim().toUpperCase().split("");
    if (!letters.length) return [];
    const filtered = letters.filter(l => ["A", "B", "C", "D"].includes(l));
    if (filtered.length !== count) {
      alert("Answer key length must match MCQ count and only include A/B/C/D.");
      return [];
    }
    return filtered;
  }

  function buildAnswerGrid(count) {
    els.answerGrid.innerHTML = "";
    const existing = els.answerKey.value.trim().toUpperCase();
    const existingLetters =
      existing.length === count && [...existing].every(c => "ABCD".includes(c))
        ? existing.split("")
        : [];

    for (let i = 0; i < count; i++) {
      const wrap = document.createElement("div");
      wrap.className = "answer-item";
      const label = document.createElement("span");
      label.textContent = `${i + 1}.`;
      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 1;
      input.dataset.index = i.toString();
      input.placeholder = "A-D";
      input.value = existingLetters[i] || "";
      input.addEventListener("input", ev => {
        ev.target.value = ev.target.value.replace(/[^ABCDabcd]/, "").toUpperCase();
        const val = ev.target.value;
        if (val && "ABCD".includes(val)) {
          const inputs = Array.from(els.answerGrid.querySelectorAll("input"));
          const next = Number(ev.target.dataset.index) + 1;
          if (inputs[next]) {
            inputs[next].focus();
            inputs[next].select();
          }
        }
      });
      input.addEventListener("keydown", handleAnswerNav);
      wrap.append(label, input);
      els.answerGrid.appendChild(wrap);
    }
  }

  function handleAnswerNav(ev) {
    const key = ev.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", "Tab"].includes(key)) return;
    const inputs = Array.from(els.answerGrid.querySelectorAll("input"));
    const idx = Number(ev.target.dataset.index);
    let next = idx;
    if (key === "ArrowRight" || key === "ArrowDown" || key === "Enter") next = idx + 1;
    if (key === "ArrowLeft" || key === "ArrowUp") next = idx - 1;
    if (next < 0 || next >= inputs.length) return;
    ev.preventDefault();
    inputs[next].focus();
    inputs[next].select();
  }

  function openAnswerSheet() {
    const mcq = parseInt(els.mcqCount.value, 10);
    if (!mcq || mcq <= 0) {
      alert("Set MCQ count first.");
      return;
    }
    buildAnswerGrid(mcq);
    els.answerOverlay.classList.remove("hidden");
    const first = els.answerGrid.querySelector("input");
    if (first) {
      setTimeout(() => {
        first.focus();
        first.select();
      }, 50);
    }
  }

  function closeAnswerSheet() {
    els.answerOverlay.classList.add("hidden");
  }

  function applyAnswerSheet() {
    const inputs = Array.from(els.answerGrid.querySelectorAll("input"));
    if (!inputs.length) return;
    const letters = inputs.map(inp => inp.value.trim().toUpperCase());
    const invalid = letters.find(l => !"ABCD".includes(l));
    if (invalid || letters.length !== parseInt(els.mcqCount.value, 10)) {
      alert("Please fill A/B/C/D for every question.");
      return;
    }
    els.answerKey.value = letters.join("");
    closeAnswerSheet();
    els.startBtn.focus();
  }

  // Background canvas animation: subtle neon blobs
  function initBackground() {
    if (!els.bgCanvas) return;
    bgCtx = els.bgCanvas.getContext("2d");
    const blobs = Array.from({ length: 8 }).map(() => ({
      x: Math.random(),
      y: Math.random(),
      r: 80 + Math.random() * 90,
      dx: (Math.random() - 0.5) * 0.0008,
      dy: (Math.random() - 0.5) * 0.0008,
      color: `hsla(${Math.floor(170 + Math.random() * 140)}, 90%, 65%, 0.08)`
    }));

    function resize() {
      els.bgCanvas.width = window.innerWidth;
      els.bgCanvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function tick() {
      if (!bgCtx) return;
      bgCtx.clearRect(0, 0, els.bgCanvas.width, els.bgCanvas.height);
      blobs.forEach(b => {
        b.x += b.dx;
        b.y += b.dy;
        if (b.x < 0 || b.x > 1) b.dx *= -1;
        if (b.y < 0 || b.y > 1) b.dy *= -1;
        const px = b.x * els.bgCanvas.width;
        const py = b.y * els.bgCanvas.height;
        const grad = bgCtx.createRadialGradient(px, py, 0, px, py, b.r);
        grad.addColorStop(0, b.color);
        grad.addColorStop(1, "transparent");
        bgCtx.fillStyle = grad;
        bgCtx.beginPath();
        bgCtx.arc(px, py, b.r, 0, Math.PI * 2);
        bgCtx.fill();
      });
      requestAnimationFrame(tick);
    }
    tick();
  }

  function clearAnswerSheetInputs() {
    els.answerGrid.querySelectorAll("input").forEach(inp => (inp.value = ""));
  }

  function handleGlobalKeys(ev) {
    const key = ev.key.toLowerCase();
    if ((ev.ctrlKey || ev.metaKey) && key === "k") {
      ev.preventDefault();
      if (els.startBtn.disabled) return;
      openAnswerSheet();
      return;
    }
    if (key === "escape") {
      if (!els.answerOverlay.classList.contains("hidden")) {
        ev.preventDefault();
        closeAnswerSheet();
      }
    }
  }

  function setStatus(text, mode = "subtle") {
    els.statusTag.textContent = text;
    els.modeLabel.textContent = text;
    els.modeLabel.className = `chip ${mode}`;
  }

  function clearTimers() {
    if (state.totalTimerId) clearInterval(state.totalTimerId);
    if (state.prestartId) clearInterval(state.prestartId);
    state.totalTimerId = null;
    state.prestartId = null;
  }

  function renderGrid() {
    els.omrGrid.innerHTML = "";
    els.omrGrid.classList.remove("empty-state");
    const tpl = document.getElementById("rowTemplate");

    for (let i = 0; i < state.mcqCount; i++) {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.index = i.toString();
      node.querySelector(".q-number").textContent = i + 1;
      node.querySelectorAll(".option").forEach(btn => {
        btn.addEventListener("pointerdown", e => startHold(e, i));
        btn.addEventListener("pointerup", cancelHold);
        btn.addEventListener("pointerleave", cancelHold);
        btn.addEventListener("touchend", cancelHold, { passive: true });
      });
      els.omrGrid.appendChild(node);
    }
  }

  function startHold(event, index) {
    if (!state.examStart || state.finished) return;
    const btn = event.currentTarget;
    const row = btn.closest(".omr-row");
    if (row.dataset.locked === "true") return;

    const key = `${index}-${btn.dataset.choice}`;
    cancelHold({ currentTarget: btn }); // clear any previous

    btn.classList.add("holding");
    btn.style.setProperty("--hold", "0");

    const holdStart = Date.now();
    state.currentQuestionStart = state.currentQuestionStart || Date.now();

    const timer = setTimeout(() => {
      lockAnswer(index, btn.dataset.choice);
      cancelHold({ currentTarget: btn });
    }, HOLD_MS);

    const step = () => {
      const progress = Math.min(1, (Date.now() - holdStart) / HOLD_MS);
      btn.style.setProperty("--hold", progress.toString());
      if (progress < 1) {
        const rafId = requestAnimationFrame(step);
        state.holdRafs.set(key, rafId);
      }
    };
    const rafId = requestAnimationFrame(step);
    state.holdRafs.set(key, rafId);

    state.holdTimers.set(key, timer);
  }

  function cancelHold(event) {
    const btn = event.currentTarget;
    if (!btn || !btn.dataset) return;
    const row = btn.closest(".omr-row");
    const index = row ? row.dataset.index : null;
    const key = index !== null ? `${index}-${btn.dataset.choice}` : null;
    if (key) {
      clearTimeout(state.holdTimers.get(key));
      cancelAnimationFrame(state.holdRafs.get(key));
      state.holdTimers.delete(key);
      state.holdRafs.delete(key);
    }
    btn.classList.remove("holding");
    btn.style.removeProperty("--hold");
  }

  function lockAnswer(index, choice) {
    const row = els.omrGrid.querySelector(`.omr-row[data-index="${index}"]`);
    if (!row || row.dataset.locked === "true" || state.finished) return;

    const elapsedQuestion = state.currentQuestionStart
      ? (Date.now() - state.currentQuestionStart) / 1000
      : 0;

    const correctChoice = state.answerKey[index];
    const correct = choice === correctChoice;
    const overtime = elapsedQuestion > state.timePerMcq;

    const score = correct
      ? 1
      : state.negativeMarking
      ? -0.25
      : 0;

    const answer = {
      number: index + 1,
      choice,
      correct,
      overtime,
      timeSpent: parseFloat(elapsedQuestion.toFixed(2)),
      score: correct && !overtime ? score : (overtime ? 0 : score)
    };

    state.answers[index] = answer;
    state.lockedCount += 1;

    row.dataset.locked = "true";
    row.querySelectorAll(".option").forEach(btn => {
      btn.classList.add("locked");
      if (btn.dataset.choice === choice) {
        btn.classList.add(correct ? "correct" : "wrong");
        if (overtime) btn.classList.add("overtime");
      }
      btn.replaceWith(btn.cloneNode(true)); // strip listeners
    });

    const lockState = row.querySelector(".lock-state");
    lockState.textContent = overtime ? "Locked (overtime)" : "Locked";
    lockState.classList.add(overtime ? "overtime" : "locked");

    updateProgress();
    state.currentQuestionStart = Date.now();

    if (state.lockedCount === state.mcqCount) {
      finishExam();
    }
  }

  function updateProgress() {
    els.progressText.textContent = `${state.lockedCount} / ${state.mcqCount}`;
    const percent = state.mcqCount ? (state.lockedCount / state.mcqCount) * 100 : 0;
    els.progressBar.style.width = `${percent}%`;
  }

  function beginCountdown() {
    els.prestartOverlay.classList.remove("hidden");
    els.countdownNum.textContent = state.prestartSeconds;
    setStatus("Armed", "warning");
    els.startBtn.disabled = true;

    let remaining = state.prestartSeconds;
    state.prestartId = setInterval(() => {
      remaining -= 1;
      els.countdownNum.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(state.prestartId);
        els.prestartOverlay.classList.add("hidden");
        startExam();
        setTimeout(() => {
          els.omrGrid.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 200);
      }
    }, 1000);
  }

  function startExam() {
    state.examStart = Date.now();
    state.currentQuestionStart = Date.now();
    state.totalTimerId = setInterval(updateTimers, 250);
    setStatus("Running");
    updateProgress();
  }

  function updateTimers() {
    const elapsed = (Date.now() - state.examStart) / 1000;
    const remaining = Math.max(0, state.totalDuration - elapsed);
    els.totalTimer.textContent = formatTime(remaining);

    const qElapsed = (Date.now() - state.currentQuestionStart) / 1000;
    els.questionTimer.textContent = formatTime(qElapsed);

    if (remaining <= 0) {
      finishExam(true);
    } else if (remaining <= 10) {
      els.totalTimer.classList.add("countdown");
    }
  }

  function computeStats() {
    const valid = state.answers.filter(a => a && !a.overtime);
    const overtime = state.answers.filter(a => a && a.overtime);
    const correctWithin = valid.filter(a => a.correct).length;
    const score = valid.reduce((sum, a) => sum + (a.correct ? 1 : state.negativeMarking ? -0.25 : 0), 0);

    const accuracy = valid.length ? (correctWithin / valid.length) * 100 : 0;
    const avgTime =
      valid.length ? valid.reduce((s, a) => s + a.timeSpent, 0) / valid.length : 0;

    const times = valid.map(a => a.timeSpent);
    const variance =
      times.length > 1
        ? times.reduce((s, t) => s + Math.pow(t - avgTime, 2), 0) / times.length
        : 0;

    let bestStreak = 0;
    let current = 0;
    for (let i = 0; i < state.answers.length; i++) {
      const ans = state.answers[i];
      if (ans && ans.correct && !ans.overtime) {
        current += 1;
        bestStreak = Math.max(bestStreak, current);
      } else if (ans) {
        current = 0;
      }
    }

    const overtimeRatio =
      state.answers.filter(Boolean).length
        ? (overtime.length / state.answers.filter(Boolean).length) * 100
        : 0;

    return {
      valid,
      overtime,
      score: parseFloat(score.toFixed(2)),
      accuracy: parseFloat(accuracy.toFixed(1)),
      avgTime: parseFloat(avgTime.toFixed(2)),
      variance: parseFloat(variance.toFixed(2)),
      bestStreak,
      overtimeRatio: parseFloat(overtimeRatio.toFixed(1))
    };
  }

  function renderResults() {
    const stats = computeStats();

    els.validList.innerHTML = stats.valid
      .map(
        a =>
          `<li>Q${a.number}: ${a.choice} - ${a.correct ? "Correct" : "Wrong"} - ${a.timeSpent}s</li>`
      )
      .join("");

    els.overtimeList.innerHTML = stats.overtime
      .map(a => `<li>Q${a.number}: ${a.choice} - ${a.correct ? "Correct" : "Wrong"} - ${a.timeSpent}s</li>`)
      .join("");

    els.accuracyStat.textContent = `${stats.accuracy}%`;
    els.avgTimeStat.textContent = `${stats.avgTime}s`;
    els.varianceStat.textContent = stats.variance.toString();
    els.streakStat.textContent = stats.bestStreak.toString();
    els.overtimeStat.textContent = `${stats.overtimeRatio}%`;
    els.scoreChip.textContent = `Score: ${stats.score}`;

    applyMood(stats);

    els.resultsPanel.hidden = false;
    els.exportCsvBtn.disabled = false;
    els.exportJsonBtn.disabled = false;
    state.lastStats = stats;

    return stats;
  }

  function applyMood(stats) {
    const panel = els.resultsPanel;
    const moods = ["mood-high", "mood-mid", "mood-low"];
    panel.classList.remove(...moods);
    const mood =
      stats.accuracy >= 80 ? "mood-high" : stats.accuracy >= 50 ? "mood-mid" : "mood-low";
    panel.classList.add(mood);

    const chipClass =
      mood === "mood-high" ? "chip success" : mood === "mood-mid" ? "chip warning" : "chip danger";
    els.scoreChip.className = chipClass;
    const moodText =
      mood === "mood-high"
        ? "Mood: 🔥 On point"
        : mood === "mood-mid"
        ? "Mood: ⚡ Keep pushing"
        : "Mood: 🌒 Review needed";
    els.moodChip.textContent = moodText;
    els.moodChip.className = `chip ${mood === "mood-high" ? "success" : mood === "mood-mid" ? "warning" : "danger"}`;

    const setStatMood = (el, status) => {
      const card = el.closest(".stat-card");
      if (!card) return;
      card.classList.remove("good", "warn", "bad");
      if (status) card.classList.add(status);
    };

    // Accuracy
    setStatMood(els.accuracyStat, stats.accuracy >= 80 ? "good" : stats.accuracy >= 50 ? "warn" : "bad");

    // Avg time vs allowed time
    const timeMood =
      stats.avgTime <= state.timePerMcq * 0.6
        ? "good"
        : stats.avgTime <= state.timePerMcq * 0.9
        ? "warn"
        : "bad";
    setStatMood(els.avgTimeStat, timeMood);

    // Variance (lower is better)
    setStatMood(els.varianceStat, stats.variance <= 5 ? "good" : stats.variance <= 15 ? "warn" : "bad");

    // Streak relative to total
    const streakRatio = state.mcqCount ? stats.bestStreak / state.mcqCount : 0;
    setStatMood(els.streakStat, streakRatio >= 0.6 ? "good" : streakRatio >= 0.3 ? "warn" : "bad");

    // Overtime ratio (lower is better)
    setStatMood(
      els.overtimeStat,
      stats.overtimeRatio < 20 ? "good" : stats.overtimeRatio < 40 ? "warn" : "bad"
    );
  }

  function finishExam(timeUp = false) {
    if (state.finished) return;
    state.finished = true;
    clearTimers();
    setStatus(timeUp ? "Overtime" : "Finished", timeUp ? "warning" : "success");
    if (timeUp) {
      els.endDialog.classList.remove("hidden");
    } else {
      renderResults();
    }
  }

  function resetExam() {
    clearTimers();
    state.answers = [];
    state.examStart = null;
    state.currentQuestionStart = null;
    state.lockedCount = 0;
    state.finished = false;
    els.totalTimer.textContent = "00:00";
    els.questionTimer.textContent = "00:00";
    els.progressBar.style.width = "0%";
    els.progressText.textContent = "0 / 0";
    els.resultsPanel.hidden = true;
    els.omrGrid.classList.add("empty-state");
    els.omrGrid.innerHTML = "<p>Configure and arm the exam to generate the OMR grid.</p>";
    els.startBtn.disabled = false;
    els.exportCsvBtn.disabled = true;
    els.exportJsonBtn.disabled = true;
    els.answerKey.type = "text";
    els.answerKey.disabled = false;
    if (els.answerKey.dataset.masked) {
      els.answerKey.value = "";
      delete els.answerKey.dataset.masked;
    }
    els.openKeyBuilder.disabled = false;
    closeAnswerSheet();
    setStatus("Idle", "subtle");
  }

  function handleStart() {
    const name = els.examName.value.trim();
    const mcq = parseInt(els.mcqCount.value, 10);
    const t = parseInt(els.timePerMcq.value, 10);
    const negative = els.negativeMarking.checked;
    const key = parseAnswerKey(els.answerKey.value, mcq);

    if (!name) {
      alert("Please enter an exam name.");
      return;
    }
    if (!mcq || mcq <= 0 || !t || t <= 0) {
      alert("MCQ count and time per MCQ must be positive.");
      return;
    }
    if (!key.length) return;

    state.examName = name;
    state.mcqCount = mcq;
    state.timePerMcq = t;
    state.negativeMarking = negative;
    state.answerKey = key;
    state.totalDuration = mcq * t;
    state.answers = Array(mcq).fill(null);
    state.lockedCount = 0;
    renderGrid();
    // hide and lock answer key once armed to prevent peeking mid-exam
    els.answerKey.type = "password";
    els.answerKey.disabled = true;
    els.answerKey.dataset.masked = "true";
    els.openKeyBuilder.disabled = true;
    closeAnswerSheet();
    beginCountdown();
  }

  function handleContinue() {
    els.endDialog.classList.add("hidden");
    renderResults();
    setStatus("Finished", "success");
  }

  function handleGiveUp() {
    els.endDialog.classList.add("hidden");
    resetExam();
  }

  function exportData(type) {
    const stats = computeStats();
    const payload = {
      meta: {
        examName: state.examName,
        mcqCount: state.mcqCount,
        timePerMcq: state.timePerMcq,
        negativeMarking: state.negativeMarking,
        generatedAt: new Date().toISOString(),
      },
      answers: state.answers.filter(Boolean),
      stats
    };

    if (type === "json") {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      downloadBlob(blob, "omr-results.json");
    } else {
      const csvRows = [
        ["Question", "Choice", "Correct", "Overtime", "TimeSpent(s)", "Score"].join(",")
      ];
      state.answers.filter(Boolean).forEach(a => {
        csvRows.push([a.number, a.choice, a.correct, a.overtime, a.timeSpent, a.score].join(","));
      });
      const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
      downloadBlob(blob, "omr-results.csv");
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadHistory() {
    if (BACKEND_URL) {
      const ok = await syncHistoryFromBackend();
      if (ok) return;
    }
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      state.history = raw ? JSON.parse(raw) : [];
    } catch (err) {
      state.history = [];
    }
    renderHistory();
  }

  function saveHistory(session) {
    state.history.unshift(session);
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state.history.slice(0, 50)));
    renderHistory();
    if (BACKEND_URL) sendToBackend(session);
  }

  function renderHistory() {
    els.historyBody.innerHTML = "";
    if (!state.history.length) {
      els.historyBody.innerHTML = `<div class="history-row"><span>No sessions yet.</span><span></span><span></span><span></span><span></span><span></span></div>`;
      return;
    }
    state.history.forEach(s => {
      const row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML = `<span>${s.date}</span><span>${s.examName || "-"}</span><span>${s.mcqCount}</span><span>${s.score}</span><span>${s.accuracy}%</span><span>${s.avgTime}s</span>`;
      els.historyBody.appendChild(row);
    });
  }

  async function sendToBackend(session) {
    try {
      await fetch(`${BACKEND_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session)
      });
    } catch (err) {
      // silent fallback
    }
  }

  async function syncHistoryFromBackend() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/sessions`);
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      state.history = data.map(row => ({
        examName: row.exam_name ?? row.examName,
        date: row.created_at || row.date,
        mcqCount: row.mcq_count ?? row.mcqCount,
        score: row.score,
        accuracy: row.accuracy,
        avgTime: row.avg_time ?? row.avgTime,
        variance: row.variance,
        streak: row.streak,
        overtimeRatio: row.overtime_ratio ?? row.overtimeRatio
      }));
      renderHistory();
      return true;
    } catch (err) {
      return false;
    }
  }

  function handleSaveSession() {
    if (!state.finished) return;
    const stats = state.lastStats || computeStats();
    const session = {
      examName: state.examName,
      date: new Date().toLocaleString(),
      mcqCount: state.mcqCount,
      score: stats.score,
      accuracy: stats.accuracy,
      avgTime: stats.avgTime,
      variance: stats.variance,
      streak: stats.bestStreak,
      overtimeRatio: stats.overtimeRatio
    };
    saveHistory(session);
  }

  function clearHistory() {
    state.history = [];
    localStorage.removeItem(LOCAL_KEY);
    renderHistory();
  }

  els.startBtn.addEventListener("click", handleStart);
  els.continueBtn.addEventListener("click", handleContinue);
  els.giveUpBtn.addEventListener("click", handleGiveUp);
  els.resetBtn.addEventListener("click", resetExam);
  els.saveSessionBtn.addEventListener("click", handleSaveSession);
  els.clearHistoryBtn.addEventListener("click", clearHistory);
  els.exportCsvBtn.addEventListener("click", () => exportData("csv"));
  els.exportJsonBtn.addEventListener("click", () => exportData("json"));
  els.openKeyBuilder.addEventListener("click", openAnswerSheet);
  els.closeKeyBuilder.addEventListener("click", closeAnswerSheet);
  els.applyKeyBuilder.addEventListener("click", applyAnswerSheet);
  els.clearKeyBuilder.addEventListener("click", clearAnswerSheetInputs);
  document.addEventListener("keydown", handleGlobalKeys);

  (async () => {
    await loadHistory();
    els.examName.focus();
    initBackground();
  })();
})(); 
