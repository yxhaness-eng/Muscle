"use strict";

/* ================= MUSCLE / 012 — MVP ================= */

var STORE_KEY = "muscle012_v1";
var TARGET_WEIGHT = 70;

/* ---------------- Хранилище ---------------- */

function defaultState() {
  return {
    workouts: [],      // {id, ts, exercises:[{name, sets:[{reps, weight}]}]}
    foods: [],         // {id, date, name, kcal, p, f, c}
    weights: [],       // {id, date, weight}
    habits: [],        // {id, name}
    checks: {}         // {habitId: {"YYYY-MM-DD": true}}
  };
}

function loadState() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    var parsed = JSON.parse(raw);
    var base = defaultState();
    for (var k in base) if (parsed[k] === undefined) parsed[k] = base[k];
    return parsed;
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

var state = loadState();

/* ---------------- Утилиты ---------------- */

function $(id) { return document.getElementById(id); }

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayKey() {
  var d = new Date();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + day;
}

function fmtDate(key) {
  var parts = key.split("-");
  return parts[2] + "." + parts[1] + "." + parts[0];
}

function fmtTs(ts) {
  var d = new Date(ts);
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return day + "." + m + "." + d.getFullYear();
}

function num(v) {
  var n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

var toastTimer = null;
function toast(msg) {
  var el = $("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2200);
}

function deleteIcon() {
  return '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m3 0l-1 13a2 2 0 01-2 2H9a2 2 0 01-2-2L6 7"/></svg>';
}

function checkIcon() {
  return '<svg viewBox="0 0 24 24"><path d="M5 13l4 4 10-10"/></svg>';
}

function emptyHtml(text) {
  return '<div class="list-empty">' + esc(text) + '</div>';
}

/* ================= Навигация ================= */

var navButtons = document.querySelectorAll(".nav-btn");
navButtons.forEach(function (btn) {
  btn.addEventListener("click", function () {
    navButtons.forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    document.querySelectorAll(".section").forEach(function (s) { s.classList.remove("active"); });
    $("section-" + btn.dataset.section).classList.add("active");
    window.scrollTo({ top: 0 });
    if (btn.dataset.section === "progress") drawChart();
  });
});

/* ================= ОБЗОР ================= */

function workoutsThisWeek() {
  var weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  return state.workouts.filter(function (w) { return w.ts >= weekAgo; }).length;
}

function todayTotals() {
  var t = { kcal: 0, p: 0, f: 0, c: 0 };
  state.foods.forEach(function (f) {
    if (f.date === todayKey()) {
      t.kcal += f.kcal; t.p += f.p; t.f += f.f; t.c += f.c;
    }
  });
  return t;
}

function habitsToday() {
  var key = todayKey();
  var done = 0;
  state.habits.forEach(function (h) {
    if (state.checks[h.id] && state.checks[h.id][key]) done++;
  });
  return { done: done, total: state.habits.length };
}

function renderOverview() {
  $("overview-date").textContent = fmtDate(todayKey());

  var last = state.weights[state.weights.length - 1];
  $("ov-weight").innerHTML = last
    ? esc(last.weight) + ' <span class="unit">кг</span>'
    : "—";

  var fill = $("ov-goal-fill");
  var text = $("ov-goal-text");
  if (state.weights.length >= 1) {
    var start = state.weights[0].weight;
    var cur = last.weight;
    var pct = TARGET_WEIGHT === start ? 100 : ((cur - start) / (TARGET_WEIGHT - start)) * 100;
    pct = Math.max(0, Math.min(100, pct));
    fill.style.width = pct.toFixed(0) + "%";
    text.textContent = "от " + start + " кг до " + TARGET_WEIGHT + " кг · " + pct.toFixed(0) + "%";
  } else {
    fill.style.width = "0%";
    text.textContent = "Добавьте вес в разделе «Прогресс»";
  }

  var t = todayTotals();
  $("ov-kcal").textContent = Math.round(t.kcal);
  $("ov-protein").textContent = Math.round(t.p);
  $("ov-workouts").textContent = workoutsThisWeek();

  var hb = habitsToday();
  $("ov-habits").textContent = hb.done + "/" + hb.total;
  $("ov-habits-fill").style.width = hb.total ? ((hb.done / hb.total) * 100) + "%" : "0%";
}

/* ================= ТРЕНИРОВКИ ================= */

var draft = { exercises: [], currentId: null };

function renderDraft() {
  var list = $("wo-exercise-list");
  if (!draft.exercises.length) {
    list.innerHTML = emptyHtml("Добавьте первое упражнение");
  } else {
    list.innerHTML = draft.exercises.map(function (ex) {
      var setsHtml = ex.sets.map(function (s, i) {
        return '<tr><td>Подход ' + (i + 1) + '</td><td>' + esc(s.reps) + ' × ' + esc(s.weight) + ' кг</td></tr>';
      }).join("");
      var setsBlock = draft.currentId === ex.id && ex.sets.length
        ? '<table class="sets-table">' + setsHtml + '</table>'
        : "";
      return '<div class="exercise-block' + (draft.currentId === ex.id ? " sets-open" : "") + '">' +
        '<div class="exercise-block-head">' +
        '<span class="exercise-block-name" data-exid="' + ex.id + '">' + esc(ex.name) + '</span>' +
        '<button class="icon-btn wo-ex-del" data-exid="' + ex.id + '" title="Удалить">' + deleteIcon() + '</button>' +
        '</div>' + setsBlock + '</div>';
    }).join("");
  }

  list.querySelectorAll(".exercise-block-name").forEach(function (el) {
    el.addEventListener("click", function () {
      draft.currentId = el.dataset.exid;
      renderDraft();
      $("wo-reps").focus();
    });
  });
  list.querySelectorAll(".wo-ex-del").forEach(function (el) {
    el.addEventListener("click", function () {
      var id = el.dataset.exid;
      draft.exercises = draft.exercises.filter(function (e) { return e.id !== id; });
      if (draft.currentId === id) draft.currentId = null;
      renderDraft();
    });
  });

  var area = $("wo-sets-area");
  var cur = draft.exercises.find(function (e) { return e.id === draft.currentId; });
  if (cur) {
    area.classList.remove("hidden");
    $("wo-current-exercise").innerHTML = "Подходы: <b>" + esc(cur.name) + "</b>";
    var rows = cur.sets.map(function (s, i) {
      return '<div class="list-item"><div class="list-item-main">' +
        '<div class="list-item-title">Подход ' + (i + 1) + '</div>' +
        '<div class="list-item-sub">' + esc(s.reps) + ' повторений × ' + esc(s.weight) + ' кг</div>' +
        '</div><button class="icon-btn wo-set-del" data-idx="' + i + '">' + deleteIcon() + '</button></div>';
    }).join("");
    $("wo-sets-list").innerHTML = rows;
    $("wo-sets-list").querySelectorAll(".wo-set-del").forEach(function (el) {
      el.addEventListener("click", function () {
        cur.sets.splice(num(el.dataset.idx), 1);
        renderDraft();
      });
    });
  } else {
    area.classList.add("hidden");
  }
}

$("wo-add-exercise").addEventListener("click", function () {
  var name = $("wo-exercise-name").value.trim();
  if (!name) { toast("Введите название упражнения"); return; }
  var ex = { id: uid(), name: name, sets: [] };
  draft.exercises.push(ex);
  draft.currentId = ex.id;
  $("wo-exercise-name").value = "";
  renderDraft();
  $("wo-reps").focus();
});

$("wo-exercise-name").addEventListener("keydown", function (e) {
  if (e.key === "Enter") $("wo-add-exercise").click();
});

$("wo-add-set").addEventListener("click", function () {
  var cur = draft.exercises.find(function (e) { return e.id === draft.currentId; });
  if (!cur) { toast("Сначала выберите или добавьте упражнение"); return; }
  var reps = num($("wo-reps").value);
  var weight = num($("wo-weight").value);
  if (reps <= 0) { toast("Укажите количество повторов"); return; }
  cur.sets.push({ reps: reps, weight: weight });
  $("wo-reps").value = "";
  $("wo-weight").value = "";
  renderDraft();
  $("wo-reps").focus();
});

$("wo-reps").addEventListener("keydown", function (e) {
  if (e.key === "Enter") $("wo-add-set").click();
});

$("wo-save").addEventListener("click", function () {
  if (!draft.exercises.length) { toast("Тренировка пуста"); return; }
  var hasSets = draft.exercises.some(function (e) { return e.sets.length > 0; });
  if (!hasSets) { toast("Добавьте хотя бы один подход"); return; }
  state.workouts.unshift({
    id: uid(),
    ts: Date.now(),
    exercises: draft.exercises.map(function (e) {
      return { name: e.name, sets: e.sets.slice() };
    })
  });
  saveState();
  draft = { exercises: [], currentId: null };
  renderDraft();
  renderWorkoutHistory();
  renderOverview();
  toast("Тренировка сохранена");
});

$("wo-clear").addEventListener("click", function () {
  draft = { exercises: [], currentId: null };
  renderDraft();
});

function renderWorkoutHistory() {
  var box = $("wo-history");
  if (!state.workouts.length) {
    box.innerHTML = emptyHtml("История пока пуста");
    return;
  }
  box.innerHTML = state.workouts.map(function (w) {
    var totalSets = w.exercises.reduce(function (n, e) { return n + e.sets.length; }, 0);
    var sub = w.exercises.map(function (e) { return esc(e.name); }).join(" · ");
    return '<div class="list-item"><div class="list-item-main">' +
      '<div class="list-item-title">' + fmtTs(w.ts) + ' — ' + w.exercises.length + ' упражн., ' + totalSets + ' подходов</div>' +
      '<div class="list-item-sub">' + sub + '</div>' +
      '</div><button class="icon-btn wo-hist-del" data-id="' + w.id + '">' + deleteIcon() + '</button></div>';
  }).join("");
  box.querySelectorAll(".wo-hist-del").forEach(function (el) {
    el.addEventListener("click", function () {
      state.workouts = state.workouts.filter(function (w) { return w.id !== el.dataset.id; });
      saveState();
      renderWorkoutHistory();
      renderOverview();
    });
  });
}

/* ================= ПИТАНИЕ ================= */

function renderNutrition() {
  var t = todayTotals();
  $("nu-kcal").textContent = Math.round(t.kcal);
  $("nu-protein").textContent = Math.round(t.p);
  $("nu-fat").textContent = Math.round(t.f);
  $("nu-carbs").textContent = Math.round(t.c);

  var box = $("nu-list");
  var today = state.foods.filter(function (f) { return f.date === todayKey(); });
  if (!today.length) {
    box.innerHTML = emptyHtml("Сегодня ничего не записано");
    return;
  }
  box.innerHTML = today.map(function (f) {
    return '<div class="list-item"><div class="list-item-main">' +
      '<div class="list-item-title">' + esc(f.name) + '</div>' +
      '<div class="list-item-sub">Б ' + f.p + ' · Ж ' + f.f + ' · У ' + f.c + '</div>' +
      '</div><div style="display:flex;align-items:center;gap:8px">' +
      '<span class="list-item-title">' + Math.round(f.kcal) + ' ккал</span>' +
      '<button class="icon-btn nu-del" data-id="' + f.id + '">' + deleteIcon() + '</button></div></div>';
  }).join("");
  box.querySelectorAll(".nu-del").forEach(function (el) {
    el.addEventListener("click", function () {
      state.foods = state.foods.filter(function (f) { return f.id !== el.dataset.id; });
      saveState();
      renderNutrition();
      renderOverview();
    });
  });
}

function addFood() {
  var name = $("nu-name").value.trim();
  var kcal = num($("nu-in-kcal").value);
  if (!name) { toast("Введите название продукта"); return; }
  if (kcal <= 0) { toast("Укажите калорийность"); return; }
  state.foods.unshift({
    id: uid(),
    date: todayKey(),
    name: name,
    kcal: kcal,
    p: num($("nu-in-protein").value),
    f: num($("nu-in-fat").value),
    c: num($("nu-in-carbs").value)
  });
  saveState();
  $("nu-name").value = "";
  $("nu-in-kcal").value = "";
  $("nu-in-protein").value = "";
  $("nu-in-fat").value = "";
  $("nu-in-carbs").value = "";
  renderNutrition();
  renderOverview();
  toast("Продукт добавлен");
}

$("nu-add").addEventListener("click", addFood);
$("nu-name").addEventListener("keydown", function (e) { if (e.key === "Enter") addFood(); });

/* ================= ПРОГРЕСС ================= */

function renderProgress() {
  var box = $("pr-history");
  if (!state.weights.length) {
    box.innerHTML = emptyHtml("Записей пока нет");
    return;
  }
  box.innerHTML = state.weights.slice().reverse().map(function (w) {
    return '<div class="list-item"><div class="list-item-main">' +
      '<div class="list-item-title">' + w.weight + ' кг</div>' +
      '<div class="list-item-sub">' + fmtDate(w.date) + '</div>' +
      '</div><button class="icon-btn pr-del" data-id="' + w.id + '">' + deleteIcon() + '</button></div>';
  }).join("");
  box.querySelectorAll(".pr-del").forEach(function (el) {
    el.addEventListener("click", function () {
      state.weights = state.weights.filter(function (w) { return w.id !== el.dataset.id; });
      saveState();
      renderProgress();
      renderOverview();
      drawChart();
    });
  });
}

function addWeight() {
  var w = num($("pr-weight").value);
  if (w <= 0) { toast("Введите вес"); return; }
  state.weights.push({ id: uid(), date: todayKey(), weight: w });
  $("pr-weight").value = "";
  saveState();
  renderProgress();
  renderOverview();
  drawChart();
  toast("Вес записан: " + w + " кг");
}

$("pr-add").addEventListener("click", addWeight);
$("pr-weight").addEventListener("keydown", function (e) { if (e.key === "Enter") addWeight(); });

function drawChart() {
  var canvas = $("pr-chart");
  if (!canvas || !canvas.offsetParent) return;
  var dpr = window.devicePixelRatio || 1;
  var wCss = canvas.clientWidth;
  var hCss = canvas.clientHeight;
  if (!wCss || !hCss) return;
  canvas.width = wCss * dpr;
  canvas.height = hCss * dpr;
  var ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, wCss, hCss);

  var data = state.weights.slice(-30);
  if (data.length === 0) {
    ctx.fillStyle = "#5C6158";
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Нет данных — добавьте первое измерение", wCss / 2, hCss / 2);
    return;
  }

  var padL = 38, padR = 14, padT = 16, padB = 30;
  var iw = wCss - padL - padR;
  var ih = hCss - padT - padB;
  var weights = data.map(function (d) { return d.weight; });
  var min = Math.min.apply(null, weights);
  var max = Math.max.apply(null, weights);
  if (min === max) { min -= 1; max += 1; }
  var range = max - min;
  min -= range * 0.12; max += range * 0.12; range = max - min;

  function x(i) {
    return data.length === 1 ? padL + iw / 2 : padL + (i / (data.length - 1)) * iw;
  }
  function y(v) { return padT + ih - ((v - min) / range) * ih; }

  ctx.strokeStyle = "#262925";
  ctx.fillStyle = "#5C6158";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.lineWidth = 1;
  for (var g = 0; g <= 4; g++) {
    var gv = min + (range / 4) * g;
    var gy = y(gv);
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(wCss - padR, gy);
    ctx.stroke();
    ctx.fillText(gv.toFixed(1), padL - 8, gy + 3);
  }

  ctx.textAlign = "center";
  var step = Math.max(1, Math.ceil(data.length / 6));
  for (var l = 0; l < data.length; l += step) {
    ctx.fillText(data[l].date.slice(8) + "." + data[l].date.slice(5, 7), x(l), hCss - 10);
  }

  ctx.beginPath();
  data.forEach(function (d, i) {
    if (i === 0) ctx.moveTo(x(i), y(d.weight));
    else ctx.lineTo(x(i), y(d.weight));
  });
  ctx.strokeStyle = "#C8F169";
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();

  data.forEach(function (d, i) {
    ctx.beginPath();
    ctx.arc(x(i), y(d.weight), 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "#C8F169";
    ctx.fill();
  });

  ctx.fillStyle = "#8B9086";
  ctx.font = "12px Inter, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Цель: " + TARGET_WEIGHT + " кг", padL, padT - 4);

  if (data.length >= 1) {
    var lastW = data[data.length - 1].weight;
    var ly = Math.max(padT + 6, Math.min(hCss - padB - 6, y(TARGET_WEIGHT)));
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(200, 241, 105, 0.35)";
    ctx.beginPath();
    ctx.moveTo(padL, ly);
    ctx.lineTo(wCss - padR, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    void lastW;
  }
}

var chartRaf = null;
window.addEventListener("resize", function () {
  if (!$("section-progress").classList.contains("active")) return;
  cancelAnimationFrame(chartRaf);
  chartRaf = requestAnimationFrame(drawChart);
});

/* ================= ПРИВЫЧКИ ================= */

function renderHabits() {
  $("hb-date").textContent = fmtDate(todayKey());
  var key = todayKey();
  var box = $("hb-list");
  if (!state.habits.length) {
    box.innerHTML = emptyHtml("Привычек пока нет — добавьте первую");
  } else {
    box.innerHTML = state.habits.map(function (h) {
      var done = state.checks[h.id] && state.checks[h.id][key];
      return '<div class="list-item habit-row">' +
        '<button class="habit-check' + (done ? " checked" : "") + '" data-id="' + h.id + '" title="Отметить">' + checkIcon() + '</button>' +
        '<span class="habit-name' + (done ? " done" : "") + '">' + esc(h.name) + '</span>' +
        '<button class="icon-btn hb-del" data-id="' + h.id + '" style="margin-left:auto">' + deleteIcon() + '</button></div>';
    }).join("");
    box.querySelectorAll(".habit-check").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.dataset.id;
        if (!state.checks[id]) state.checks[id] = {};
        if (state.checks[id][key]) delete state.checks[id][key];
        else state.checks[id][key] = true;
        saveState();
        renderHabits();
        renderOverview();
      });
    });
    box.querySelectorAll(".hb-del").forEach(function (el) {
      el.addEventListener("click", function () {
        var id = el.dataset.id;
        state.habits = state.habits.filter(function (h) { return h.id !== id; });
        delete state.checks[id];
        saveState();
        renderHabits();
        renderOverview();
      });
    });
  }
  renderHabitWeek();
}

function renderHabitWeek() {
  var box = $("hb-week");
  if (!state.habits.length) {
    box.innerHTML = emptyHtml("Нет данных");
    return;
  }
  var days = [];
  for (var i = 6; i >= 0; i--) {
    var d = new Date();
    d.setDate(d.getDate() - i);
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    days.push({ key: d.getFullYear() + "-" + m + "-" + day, label: day + "." + m });
  }
  var head = days.map(function (d) { return "<th>" + d.label + "</th>"; }).join("");
  var rows = state.habits.map(function (h) {
    var cells = days.map(function (d) {
      var on = state.checks[h.id] && state.checks[h.id][d.key];
      return '<td><span class="hb-dot' + (on ? " on" : "") + '"></span></td>';
    }).join("");
    return '<tr><td style="text-align:left;color:var(--text);max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' +
      esc(h.name) + "</td>" + cells + "</tr>";
  }).join("");
  box.innerHTML = '<table class="hb-week-table"><tr><th style="text-align:left">Привычка</th>' + head + "</tr>" + rows + "</table>";
}

function addHabit() {
  var name = $("hb-name").value.trim();
  if (!name) { toast("Введите название привычки"); return; }
  state.habits.push({ id: uid(), name: name });
  $("hb-name").value = "";
  saveState();
  renderHabits();
  renderOverview();
  toast("Привычка добавлена");
}

$("hb-add").addEventListener("click", addHabit);
$("hb-name").addEventListener("keydown", function (e) { if (e.key === "Enter") addHabit(); });

/* ================= Инициализация ================= */

renderOverview();
renderDraft();
renderWorkoutHistory();
renderNutrition();
renderProgress();
renderHabits();
