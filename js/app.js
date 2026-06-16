import {
  COURSE_MAP, WEATHER_OPTIONS, TRACK_TYPES, DISTANCES, WEATHER_MOISTURE,
  analyzeHorse, calcBoxTickets, generateSampleHorses, emptyHorse, babaLabel,
} from "./engine.js";

const BET_TYPES = ["三連単", "三連複", "馬連", "馬単", "ワイド"];

const state = {
  horses: generateSampleHorses(5),
  results: [],
};

let evChart = null;
let scoreChart = null;

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);

function fillSelect(el, options, selected) {
  el.innerHTML = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt;
    if (opt === selected) o.selected = true;
    el.appendChild(o);
  }
}

function getEnv() {
  return {
    temp: Number($("temp").value),
    humidity: Number($("humidity").value),
    track_cond: Number($("track_cond").value),
    weather: $("weather").value,
    track_type: $("track_type").value,
    distance: Number($("distance").value),
  };
}

// ---------- Sidebar ----------
function initSidebar() {
  fillSelect($("location"), Object.keys(COURSE_MAP), "東京");
  fillSelect($("weather"), WEATHER_OPTIONS, "晴");
  fillSelect($("track_type"), TRACK_TYPES, "芝");
  fillSelect($("distance"), DISTANCES.map(String), "2000");
  fillSelect($("bet-type"), BET_TYPES, "三連単");

  $("location").addEventListener("change", updateCourseInfo);
  $("weather").addEventListener("change", () => {
    const m = WEATHER_MOISTURE[$("weather").value] ?? 0.04;
    $("track_cond").value = m;
    $("cond-val").textContent = Number(m).toFixed(2);
    updateBaba();
  });
  $("temp").addEventListener("input", () => { $("temp-val").textContent = $("temp").value; });
  $("humidity").addEventListener("input", () => { $("humidity-val").textContent = $("humidity").value; });
  $("track_cond").addEventListener("input", () => {
    $("cond-val").textContent = Number($("track_cond").value).toFixed(2);
    updateBaba();
  });
  $("track_type").addEventListener("change", updateBaba);

  updateCourseInfo();
  updateBaba();

  $("analyze-btn").addEventListener("click", runAnalysis);
}

function updateCourseInfo() {
  const c = COURSE_MAP[$("location").value];
  $("course-info").textContent =
    `📐 コーナーR: ${c.corner_r} / 直線: ${c.straight}m / 坂: ${c.slope ? "あり" : "なし"}`;
}

function updateBaba() {
  $("baba-label").textContent = babaLabel(Number($("track_cond").value));
}

// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      $("tab-" + tab.dataset.tab).classList.add("active");
      if (tab.dataset.tab === "box") renderBoxCheckboxes();
    });
  });
}

// ---------- Horse input ----------
function initHorseControls() {
  $("num-horses").addEventListener("change", () => {
    let n = Math.max(1, Math.min(18, Number($("num-horses").value)));
    const cur = state.horses.length;
    if (n > cur) {
      for (let i = cur; i < n; i++) state.horses.push(emptyHorse(i + 1));
    } else if (n < cur) {
      state.horses = state.horses.slice(0, n);
    }
    renderHorses();
  });
  $("sample-btn").addEventListener("click", () => {
    const n = Math.max(1, Math.min(18, Number($("num-horses").value)));
    state.horses = generateSampleHorses(n);
    renderHorses();
  });
}

function slider(label, value, min, max, step, onInput, help) {
  const wrap = document.createElement("div");
  wrap.className = "slider-field";
  const span = document.createElement("span");
  span.textContent = `${label}: ${value}` + (help ? ` ⓘ` : "");
  if (help) span.title = help;
  const input = document.createElement("input");
  input.type = "range";
  input.min = min; input.max = max; input.step = step; input.value = value;
  input.addEventListener("input", () => {
    span.textContent = `${label}: ${input.value}` + (help ? ` ⓘ` : "");
    onInput(Number(input.value));
  });
  wrap.appendChild(span);
  wrap.appendChild(input);
  return wrap;
}

function renderHorses() {
  const list = $("horse-list");
  list.innerHTML = "";
  state.horses.forEach((horse, i) => {
    const card = document.createElement("div");
    card.className = "horse-card";

    const summary = document.createElement("div");
    summary.className = "horse-summary";
    const updateSummary = () => {
      summary.querySelector(".summary-text").textContent =
        `馬番 ${horse.umaban}: ${horse.name || "(未入力)"} — オッズ ${horse.odds}`;
    };
    summary.innerHTML = `<span class="summary-text"></span><span>▼</span>`;
    summary.addEventListener("click", () => card.classList.toggle("open"));
    card.appendChild(summary);

    const body = document.createElement("div");
    body.className = "horse-body";

    // Column 1: basic
    const col1 = document.createElement("div");
    col1.className = "horse-col";
    col1.innerHTML = "<h5>基本情報</h5>";
    col1.appendChild(makeNumberField("馬番", horse.umaban, 1, 18, 1, (v) => { horse.umaban = v; updateSummary(); }));
    col1.appendChild(makeTextField("馬名", horse.name, (v) => { horse.name = v; updateSummary(); }));
    col1.appendChild(makeNumberField("オッズ", horse.odds, 1, 999.9, 0.1, (v) => { horse.odds = v; updateSummary(); }));
    body.appendChild(col1);

    // Column 2: paddock
    const col2 = document.createElement("div");
    col2.className = "horse-col";
    col2.innerHTML = "<h5>パドック指標</h5>";
    col2.appendChild(slider("後足ストライド", horse.paddock.stride_angle_y, 0, 1, 0.01, (v) => horse.paddock.stride_angle_y = v, "大きいほど推進力あり"));
    col2.appendChild(slider("弾み(ぴょこぴょこ)", horse.paddock.bounce_factor, 0, 1, 0.01, (v) => horse.paddock.bounce_factor = v, "寒い日に高いと好評価"));
    col2.appendChild(slider("毛艶", horse.paddock.coat_shine, 0, 1, 0.01, (v) => horse.paddock.coat_shine = v, "高いほど体調良好"));
    body.appendChild(col2);

    // Column 3: condition
    const col3 = document.createElement("div");
    col3.className = "horse-col";
    col3.innerHTML = "<h5>状態指標</h5>";
    col3.appendChild(slider("発汗レベル", horse.paddock.sweat_level, 0, 1, 0.01, (v) => horse.paddock.sweat_level = v, "0.7超で過度な発汗(マイナス)"));
    col3.appendChild(slider("耳の動き(集中度)", horse.paddock.ear_movement, 0, 1, 0.01, (v) => horse.paddock.ear_movement = v, "高いほど集中"));
    const cb = document.createElement("label");
    cb.className = "checkbox-line";
    const cbInput = document.createElement("input");
    cbInput.type = "checkbox";
    cbInput.checked = horse.paddock.after_poop_relax;
    cbInput.addEventListener("change", () => horse.paddock.after_poop_relax = cbInput.checked);
    cb.appendChild(cbInput);
    cb.appendChild(document.createTextNode("ボロ後リラックス検知"));
    col3.appendChild(cb);
    body.appendChild(col3);

    card.appendChild(body);
    list.appendChild(card);
    updateSummary();
  });
}

function makeNumberField(label, value, min, max, step, onInput) {
  const wrap = document.createElement("div");
  wrap.className = "slider-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.min = min; input.max = max; input.step = step; input.value = value;
  input.style.width = "100%";
  input.addEventListener("input", () => onInput(Number(input.value)));
  wrap.appendChild(span);
  wrap.appendChild(input);
  return wrap;
}

function makeTextField(label, value, onInput) {
  const wrap = document.createElement("div");
  wrap.className = "slider-field";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.style.width = "100%";
  input.addEventListener("input", () => onInput(input.value));
  wrap.appendChild(span);
  wrap.appendChild(input);
  return wrap;
}

// ---------- Analysis ----------
function runAnalysis() {
  const env = getEnv();
  const location = $("location").value;
  state.results = state.horses.map((h) => analyzeHorse(h, env, location));
  renderResults(env, location);

  // switch to results tab
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelector('.tab[data-tab="results"]').classList.add("active");
  $("tab-results").classList.add("active");
}

function ratingClass(ev) {
  if (ev >= 3.0) return "banner-hot";
  if (ev >= 2.0) return "banner-cool";
  return "banner-cool";
}

function renderResults(env, location) {
  $("results-empty").style.display = "none";
  $("results-content").style.display = "block";

  const sorted = [...state.results].sort((a, b) => b.expected_value - a.expected_value);
  const atsui = sorted.filter((r) => r.expected_value >= 2.0);
  const top = sorted[0];
  const avg = state.results.reduce((s, r) => s + r.expected_value, 0) / state.results.length;

  const now = new Date();
  const ts = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,"0")}/${String(now.getDate()).padStart(2,"0")} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  $("results-meta").textContent =
    `${ts} | ${COURSE_MAP[location].label} ${env.distance}m ${env.track_type} (${env.weather} / ${env.temp}℃)`;

  $("m-count").textContent = `${state.results.length}頭`;
  $("m-atsui").textContent = `${atsui.length}頭`;
  $("m-top").textContent = top.expected_value.toFixed(2);
  $("m-top-uma").textContent = `馬番${top.umaban}`;
  $("m-avg").textContent = avg.toFixed(2);

  // Kachisuji banners
  const kl = $("kachisuji-list");
  kl.innerHTML = "";
  if (atsui.length === 0) {
    kl.innerHTML = '<p class="meta">期待値2.0以上の勝ち筋候補はありません。</p>';
  } else {
    for (const r of atsui) {
      const div = document.createElement("div");
      div.className = "kachisuji-banner " + (r.expected_value >= 3.0 ? "banner-hot" : "banner-cool");
      const icon = r.expected_value >= 3.0 ? "🔥" : "⭐";
      div.textContent = `${icon} 馬番${r.umaban} ${r.name} — 期待値 ${r.expected_value.toFixed(2)} (${r.rating})`;
      kl.appendChild(div);
    }
  }

  // Table
  const tbody = $("results-table").querySelector("tbody");
  tbody.innerHTML = "";
  for (const r of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.umaban}</td>
      <td>${r.name}</td>
      <td>${r.odds}</td>
      <td>${r.base_score}</td>
      <td>${r.physics_bonus}</td>
      <td>${r.condition_bonus}</td>
      <td class="score-bar-cell">${r.total_score}<div class="score-bar" style="width:${(r.total_score/150*100).toFixed(0)}%"></div></td>
      <td>${(r.win_prob*100).toFixed(1)}%</td>
      <td><b>${r.expected_value.toFixed(2)}</b></td>
      <td>${r.rating}</td>`;
    tbody.appendChild(tr);
  }

  renderCharts(sorted);
  renderDetails(sorted);
}

function renderCharts(sorted) {
  const labels = sorted.map((r) => `${r.umaban}.${r.name}`);
  const evData = sorted.map((r) => r.expected_value);
  const colors = sorted.map((r) =>
    r.expected_value >= 3.0 ? "#f5576c" :
    r.expected_value >= 2.0 ? "#4facfe" :
    r.expected_value >= 1.0 ? "#667eea" : "#888"
  );

  if (evChart) evChart.destroy();
  evChart = new Chart($("ev-chart"), {
    type: "bar",
    data: { labels, datasets: [{ label: "期待値", data: evData, backgroundColor: colors }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#9a9ab0", maxRotation: 60, minRotation: 45 }, grid: { color: "#2a2a45" } },
        y: { ticks: { color: "#9a9ab0" }, grid: { color: "#2a2a45" } },
      },
    },
  });

  if (scoreChart) scoreChart.destroy();
  scoreChart = new Chart($("score-chart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "基礎点", data: sorted.map((r) => r.base_score), backgroundColor: "#667eea" },
        { label: "物理補正", data: sorted.map((r) => r.physics_bonus), backgroundColor: "#764ba2" },
        { label: "状態補正", data: sorted.map((r) => r.condition_bonus), backgroundColor: "#f093fb" },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: "#e8e8f0" } } },
      scales: {
        x: { stacked: true, ticks: { color: "#9a9ab0", maxRotation: 60, minRotation: 45 }, grid: { color: "#2a2a45" } },
        y: { stacked: true, ticks: { color: "#9a9ab0" }, grid: { color: "#2a2a45" } },
      },
    },
  });
}

function renderDetails(sorted) {
  const dl = $("details-list");
  dl.innerHTML = "";
  for (const r of sorted) {
    const card = document.createElement("div");
    card.className = "detail-card";
    const summary = document.createElement("div");
    summary.className = "detail-summary";
    summary.textContent = `馬番${r.umaban} ${r.name} — ${r.rating} (EV: ${r.expected_value.toFixed(2)})`;
    summary.addEventListener("click", () => card.classList.toggle("open"));
    const body = document.createElement("div");
    body.className = "detail-body";
    const ul = document.createElement("ul");
    for (const d of r.details) {
      const li = document.createElement("li");
      li.textContent = d;
      ul.appendChild(li);
    }
    body.appendChild(ul);
    const p = document.createElement("p");
    p.innerHTML = `<b>合計スコア: ${r.total_score} / 150 → 推定勝率: ${(r.win_prob*100).toFixed(1)}% × オッズ${r.odds} = 期待値 ${r.expected_value.toFixed(2)}</b>`;
    body.appendChild(p);
    card.appendChild(summary);
    card.appendChild(body);
    dl.appendChild(card);
  }
}

// ---------- Box calculator ----------
function initBox() {
  $("bet-type").addEventListener("change", updateBox);
  $("unit-price").addEventListener("input", updateBox);
}

function renderBoxCheckboxes() {
  const wrap = $("box-checkboxes");
  wrap.innerHTML = "";
  const sorted = state.results.length
    ? [...state.results].sort((a, b) => b.expected_value - a.expected_value)
    : state.horses.map((h) => ({ umaban: h.umaban, name: h.name, expected_value: null }));

  for (const r of sorted) {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = r.umaban;
    cb.dataset.uma = r.umaban;
    // default: EV >= 1.5 (top 5)
    if (r.expected_value !== null && r.expected_value >= 1.5) cb.checked = true;
    cb.addEventListener("change", updateBox);
    label.appendChild(cb);
    const evText = r.expected_value !== null ? ` (EV:${r.expected_value.toFixed(2)})` : "";
    label.appendChild(document.createTextNode(`${r.umaban}.${r.name}${evText}`));
    wrap.appendChild(label);
  }
  // limit default checked to 5
  const checked = wrap.querySelectorAll("input:checked");
  if (checked.length > 5) {
    [...checked].slice(5).forEach((c) => (c.checked = false));
  }
  updateBox();
}

function updateBox() {
  const checked = $("box-checkboxes").querySelectorAll("input:checked");
  const n = checked.length;
  const betType = $("bet-type").value;
  const unit = Number($("unit-price").value);
  const tickets = calcBoxTickets(n, betType);
  const cost = tickets * unit;

  $("box-n").textContent = `${n}頭`;
  $("box-tickets").textContent = `${tickets}点`;
  $("box-cost").textContent = `¥${cost.toLocaleString()}`;

  // reference table
  const tbody = $("ref-table").querySelector("tbody");
  tbody.innerHTML = "";
  const maxN = Math.min(n + 2, 10);
  for (let h = 2; h <= maxN; h++) {
    for (const bt of BET_TYPES) {
      const t = calcBoxTickets(h, bt);
      if (t > 0) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${h}</td><td>${bt}</td><td>${t}</td><td>¥${(t*unit).toLocaleString()}</td>`;
        tbody.appendChild(tr);
      }
    }
  }
}

// ---------- Init ----------
initSidebar();
initTabs();
initHorseControls();
initBox();
renderHorses();
