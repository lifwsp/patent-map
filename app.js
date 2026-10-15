// 技術マップ — 静的 SPA（ハッシュルーティング, ECharts）
const AREA_COLOR = { I: "#2f6fde", II: "#13a89e", III: "#d9822b", IV: "#7c5cc4", V: "#8a8f98" };
const FULL_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]; // 2024- は未公開分が多い
const $app = document.getElementById("app");
const cache = {};
const charts = [];

async function load(path) {
  if (!cache[path]) cache[path] = fetch(`data/${path}`).then((r) => r.json());
  return cache[path];
}
const fmt = (n) => (n ?? 0).toLocaleString("ja-JP");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sumYears = (byYear, years) => years.reduce((s, y) => s + (byYear[y]?.apps || 0), 0);
function cagr(byYear) {
  const a = sumYears(byYear, [2015, 2016, 2017]), b = sumYears(byYear, [2021, 2022, 2023]);
  return a ? (Math.pow(b / a, 1 / 6) - 1) * 100 : null;
}
function chart(el, option) {
  const c = echarts.init(el);
  c.setOption(option);
  charts.push(c);
  return c;
}
window.addEventListener("resize", () => charts.forEach((c) => c.resize()));


// ---------------------------------------------------------------- 年次グラフ（未公開分の推計つき）
// 収録率 = 公式の出願件数に対する、データに入っている割合（基準年で補正）。1 未満の年は公開待ちで欠けている。
let META = null;
const coverageOf = (y) => (META?.coverage?.[y] ?? 1);
// 収録率が半分未満の年は推計が不安定なため表示しない
const MIN_COVERAGE = 0.5;
const chartYears = (by) => Object.keys(by).map(Number)
  .filter((y) => y >= 2015 && (y <= 2023 || META?.coverage?.[y] !== undefined) && coverageOf(y) >= MIN_COVERAGE).sort();
function yearChart(el, by, color) {
  const years = chartYears(by);
  const apps = years.map((y) => by[y]?.apps || 0);
  const est = years.map((y, i) => (coverageOf(y) < 1 ? Math.round(apps[i] / coverageOf(y)) : null));
  chart(el, {
    tooltip: { trigger: "axis", formatter: (ps) => {
      const i = ps[0].dataIndex, y = years[i], c = coverageOf(y);
      return `<b>${y}年</b><br>出願（収録済み）: ${fmt(apps[i])}件<br>うち登録: ${fmt(by[y]?.granted || 0)}件` +
        (c < 1 ? `<br><span style="color:#888">年間の推計: 約${fmt(est[i])}件<br>（収録率 ${(c * 100).toFixed(0)}%。残りは公開待ち）</span>` : ""); } },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    legend: { data: ["出願", "うち登録", "年間の推計（公開待ちを含む）"], right: 0 },
    xAxis: { type: "category", data: years.map((y) => (coverageOf(y) < 1 ? `${y}*` : `${y}`)) },
    yAxis: { type: "value" },
    series: [
      { name: "年間の推計（公開待ちを含む）", type: "bar", data: est, z: 1,
        itemStyle: { color: "rgba(140,146,156,.22)", borderColor: "#9aa1ab", borderType: "dashed", borderWidth: 1 } },
      { name: "出願", type: "bar", barGap: "-100%", z: 2, data: apps, itemStyle: { color } },
      { name: "うち登録", type: "bar", barGap: "-100%", z: 3, data: years.map((y) => by[y]?.granted || 0), itemStyle: { color: "rgba(0,0,0,.18)" } },
    ],
  });
}
function coverageNote() {
  const partial = Object.entries(META?.coverage || {}).filter(([, c]) => c < 1 && c >= MIN_COVERAGE);
  const hidden = Object.entries(META?.coverage || {}).filter(([, c]) => c < MIN_COVERAGE).map(([y]) => y);
  if (!partial.length) return "";
  return `<p class="note">* の年は出願から公開まで約1年半かかるため、まだ全件がそろっていません（${partial.map(([y, c]) => `${y}年: 約${(c * 100).toFixed(0)}%`).join("、")}。データ時点 ${esc(META.data_as_of)}）。
    灰色の点線は、収録率で割り戻した年間の推計値です（全分野で収録率が同じと仮定した概算）。
    ${hidden.length ? `${hidden.join("・")}年はまだ収録が半分未満のため表示していません。` : ""}</p>`;
}

// ---------------------------------------------------------------- 技術分野マップ
async function viewFields() {
  const [fields, meta] = await Promise.all([load("fields.json"), load("meta.json")]);
  fields.forEach((f) => { f.total = sumYears(f.by_year, FULL_YEARS); f.cagr = cagr(f.by_year); });
  $app.innerHTML = `
    <h1>技術分野マップ</h1>
    <p class="lead">${esc(meta.scope)}を WIPO の35技術分野に分類しました。面積は出願件数（2015–2023年）、色は5つの大分類です。分野をクリックすると詳細を開きます。</p>
    <div class="grid">
      <div class="card span-12"><div class="legend">${Object.entries(meta.areas).map(([k, v]) => `<span><i style="background:${AREA_COLOR[k]}"></i>${v}</span>`).join("")}</div>
        <div id="tm" class="chart tall"></div></div>
      <div class="card span-12"><h2>成長率と規模</h2>
        <p class="note">横軸: 出願件数（2015–2023年の合計）、縦軸: 年平均成長率（2015–17年平均 → 2021–23年平均）</p>
        <div id="sc" class="chart"></div></div>
    </div>`;
  const byArea = {};
  fields.forEach((f) => (byArea[f.area] ||= { name: f.area_name, area: f.area, children: [], itemStyle: { color: AREA_COLOR[f.area], borderColor: AREA_COLOR[f.area] } }).children.push(
    { name: f.name, value: f.total, id: f.id, cagr: f.cagr, itemStyle: { color: AREA_COLOR[f.area] } }));
  chart(document.getElementById("tm"), {
    tooltip: { formatter: (p) => p.data.id ? `${p.name}<br>${fmt(p.value)}件<br>成長率 ${p.data.cagr?.toFixed(1)}%/年` : p.name },
    series: [{ type: "treemap", data: Object.values(byArea), roam: false, nodeClick: false, breadcrumb: { show: false },
      upperLabel: { show: true, height: 22, color: "#fff" },
      levels: [{ itemStyle: { gapWidth: 3, borderColor: "#f7f7f5", borderWidth: 3 } },
               { itemStyle: { gapWidth: 1, borderColorSaturation: 0.4 } }],
      label: { formatter: (p) => `${p.name}\n${fmt(p.value)}`, fontSize: 12 } }],
  }).on("click", (p) => p.data.id && (location.hash = `#/field/${p.data.id}`));
  chart(document.getElementById("sc"), {
    tooltip: { formatter: (p) => `${p.data[2]}<br>${fmt(p.data[0])}件 / ${p.data[1].toFixed(1)}%/年` },
    grid: { left: 50, right: 30, top: 20, bottom: 40 },
    xAxis: { type: "log", name: "件数", nameLocation: "end" },
    yAxis: { type: "value", name: "%/年", axisLabel: { formatter: "{value}%" } },
    series: Object.keys(AREA_COLOR).map((a) => ({
      type: "scatter", symbolSize: 14, itemStyle: { color: AREA_COLOR[a] },
      // ラベルは目立つ分野（成長率の上下位・大規模）のみ。他はホバーで表示
      label: { show: true, position: "right", fontSize: 11, color: "#555",
        formatter: (p) => (Math.abs(p.data[1]) >= 4 || p.data[0] >= 150000 ? p.data[2] : "") },
      emphasis: { label: { show: true, formatter: (p) => p.data[2] } },
      data: fields.filter((f) => f.area === a).map((f) => [f.total, f.cagr ?? 0, f.name, f.id]) })),
  }).on("click", (p) => (location.hash = `#/field/${p.data[3]}`));
}

// ---------------------------------------------------------------- 分野詳細
async function viewField(id) {
  const [fields, companies] = await Promise.all([load("fields.json"), load("companies.json")]);
  const f = fields.find((x) => x.id === +id);
  const byName = Object.fromEntries(companies.map((c) => [c.name, c.id]));
  const link = (n) => byName[n] ? `<a href="#/company/${byName[n]}">${esc(n)}</a>` : esc(n);
  $app.innerHTML = `
    <p><a href="#/">← 技術分野マップ</a></p>
    <h1>${esc(f.name)} <span class="badge">${esc(f.area_name)}</span></h1>
    <p class="lead">${esc(f.name_en)}</p>
    <div class="kpis">
      <div class="kpi"><div class="v">${fmt(sumYears(f.by_year, FULL_YEARS))}</div><div class="l">出願（2015–2023）</div></div>
      <div class="kpi"><div class="v">${cagr(f.by_year)?.toFixed(1)}%</div><div class="l">年平均成長率</div></div>
    </div>
    <div class="grid">
      <div class="card span-12"><h2>出願件数の推移</h2><div id="ts" class="chart short"></div>
        ${coverageNote()}</div>
      <div class="card span-12"><h2>細分野（${f.subclasses.filter((x) => x.total > 0).length}）</h2>
        <p class="note">IPCサブクラス単位。面積は出願件数（2015–2023年）、色は成長率（緑=伸びている／赤=減っている）。クリックで詳細を開きます。</p>
        <div id="subtm" class="chart"></div>
        <table>${topicRows(f.subclasses.filter((x) => x.total > 0))}</table></div>
      <div class="card span-6"><h2>主要出願人（2015年以降）</h2><table>
        <tr><th>#</th><th>出願人</th><th class="num">件数</th></tr>
        ${f.top_assignees.map((a, i) => `<tr><td>${i + 1}</td><td>${link(a.name)}</td><td class="num">${fmt(a.apps)}</td></tr>`).join("")}
      </table></div>
      <div class="card span-6"><h2>新規参入</h2><p class="note">2015–2019年に出願がなく、2020年以降に20件以上出願した出願人</p><table>
        <tr><th>出願人</th><th class="num">2020年以降</th></tr>
        ${f.new_entrants.map((a) => `<tr><td>${link(a.name)}</td><td class="num">${fmt(a.apps)}</td></tr>`).join("") || `<tr><td colspan=2 class="note">該当なし</td></tr>`}
      </table></div>
    </div>`;
  yearChart(document.getElementById("ts"), f.by_year, AREA_COLOR[f.area]);
  growthTreemap(document.getElementById("subtm"), f.subclasses.map((x) => ({ name: x.name, value: x.total, code: x.code, g: cagrSimple(x.by_year) })),
    (d) => (location.hash = `#/topic/${d.code}`));
  bindRowLinks();
}

// 成長率で色分けした treemap（細分野・メイングループ共通）
function growthColor(g) {
  if (g == null || !isFinite(g)) return "#c9ced6";
  const t = Math.max(-1, Math.min(1, g / 12));
  return t >= 0 ? `rgba(15,157,88,${0.25 + 0.75 * t})` : `rgba(217,48,37,${0.25 + 0.75 * -t})`;
}
function growthTreemap(el, items, onClick) {
  chart(el, {
    tooltip: { formatter: (p) => `${esc(p.data.code)} ${esc(p.name)}<br>${fmt(p.value)}件<br>成長率 ${p.data.g == null || !isFinite(p.data.g) ? "-" : p.data.g.toFixed(1) + "%/年"}` },
    series: [{ type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
      data: items.filter((x) => x.value > 0).map((x) => ({ ...x, itemStyle: { color: growthColor(x.g) } })),
      label: { formatter: (p) => `${p.name}\n${fmt(p.value)}`, fontSize: 11, color: "#1d2433" },
      itemStyle: { borderColor: "#fff", borderWidth: 1, gapWidth: 1 } }],
  }).on("click", (p) => p.data && onClick(p.data));
}
const cagrSimple = (by) => { // by: {year: n}
  const g = (ys) => ys.reduce((s, y) => s + (by[y] || 0), 0);
  const a = g([2015, 2016, 2017]), b = g([2021, 2022, 2023]);
  return a >= 30 ? (Math.pow(b / a, 1 / 6) - 1) * 100 : null;
};
function spark(by) {
  const ys = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023], v = ys.map((y) => by[y] || 0), m = Math.max(1, ...v);
  return `<svg width="90" height="22" viewBox="0 0 90 22"><polyline fill="none" stroke="#2f6fde" stroke-width="1.5" points="${v.map((x, i) => `${i * 11},${21 - (x / m) * 20}`).join(" ")}"/></svg>`;
}
function topicRows(list) {
  return `<tr><th>コード</th><th>細分野</th><th class="num">出願 2015–23</th><th>推移</th><th class="num">成長率</th></tr>` +
    list.map((x) => { const g = cagrSimple(x.by_year);
      return `<tr class="click" data-href="#/topic/${x.code}"><td><code>${x.code}</code></td><td>${esc(x.name)}</td><td class="num">${fmt(x.total)}</td>
        <td>${spark(x.by_year)}</td><td class="num ${g > 0 ? "up" : g < 0 ? "down" : ""}">${g == null ? "-" : g.toFixed(1) + "%"}</td></tr>`; }).join("");
}
function bindRowLinks() {
  document.querySelectorAll("tr[data-href]").forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest("a")) location.hash = tr.dataset.href; }));
}

// ---------------------------------------------------------------- 細分野（サブクラス）
async function viewTopic(code) {
  const [t, fields, companies] = await Promise.all([load(`topics/${code}.json`), load("fields.json"), load("companies.json")]);
  const f = fields.find((x) => x.id === t.field);
  const byName = Object.fromEntries(companies.map((c) => [c.name, c.id]));
  const link = (n) => byName[n] ? `<a href="#/company/${byName[n]}">${esc(n)}</a>` : esc(n);
  const total = sumYears(t.by_year, FULL_YEARS);
  $app.innerHTML = `
    <p><a href="#/">技術分野マップ</a> › <a href="#/field/${f.id}">${esc(f.name)}</a></p>
    <h1><code>${esc(t.code)}</code> ${esc(t.name)}</h1>
    <p class="lead">${esc(t.name_en)}</p>
    <div class="kpis">
      <div class="kpi"><div class="v">${fmt(total)}</div><div class="l">出願（2015–2023）</div></div>
      <div class="kpi"><div class="v">${cagr(t.by_year)?.toFixed(1) ?? "-"}%</div><div class="l">年平均成長率</div></div>
      <div class="kpi"><div class="v">${t.groups.length}</div><div class="l">主要な技術グループ</div></div>
    </div>
    <div class="grid">
      <div class="card span-12"><h2>出願件数の推移</h2><div id="ts" class="chart short"></div>${coverageNote()}</div>
      ${t.groups.length ? `<div class="card span-12"><h2>技術グループ</h2>
        <p class="note">IPCメイングループ単位（出願100件以上）。説明は英語の分類タイトルです。色は成長率。</p>
        <div id="gtm" class="chart"></div>
        <table><tr><th>グループ</th><th>内容</th><th class="num">出願</th><th>推移</th><th class="num">成長率</th><th>主な出願人</th></tr>
        ${t.groups.map((g) => { const r = cagrSimple(g.by_year); return `<tr><td><code>${esc(g.code)}</code></td><td style="max-width:420px">${esc(g.title)}</td>
          <td class="num">${fmt(Object.values(g.by_year).reduce((a, b) => a + b, 0))}</td><td>${spark(g.by_year)}</td>
          <td class="num ${r > 0 ? "up" : r < 0 ? "down" : ""}">${r == null ? "-" : r.toFixed(1) + "%"}</td>
          <td class="note">${g.top.slice(0, 3).map((x) => link(x.name)).join(", ")}</td></tr>`; }).join("")}</table></div>` : ""}
      <div class="card span-6"><h2>主要出願人</h2><table>
        <tr><th>#</th><th>出願人</th><th class="num">2015年以降</th><th class="num">うち2020年以降</th></tr>
        ${t.top_assignees.map((a, i) => `<tr><td>${i + 1}</td><td>${link(a.name)}</td><td class="num">${fmt(a.apps)}</td><td class="num">${fmt(a.recent)}</td></tr>`).join("")}
      </table></div>
      <div class="card span-6"><h2>新規参入</h2><p class="note">2015–2019年に出願がなく、2020年以降に10件以上出願した出願人</p><table>
        <tr><th>出願人</th><th class="num">2020年以降</th></tr>
        ${t.new_entrants.map((a) => `<tr><td>${link(a.name)}</td><td class="num">${fmt(a.apps)}</td></tr>`).join("") || `<tr><td colspan=2 class="note">該当なし</td></tr>`}
      </table></div>
    </div>`;
  yearChart(document.getElementById("ts"), t.by_year, AREA_COLOR[f.area]);
  if (t.groups.length) growthTreemap(document.getElementById("gtm"),
    t.groups.map((g) => ({ name: g.code + " " + (g.title.split(";")[0] || "").slice(0, 40), value: Object.values(g.by_year).reduce((a, b) => a + b, 0), code: g.code, g: cagrSimple(g.by_year) })), () => {});
}

// ---------------------------------------------------------------- 検索
async function viewSearch(q) {
  q = decodeURIComponent(q || "");
  const [topics, companies, fields] = await Promise.all([load("topics.json"), load("companies.json"), load("fields.json")]);
  const F = Object.fromEntries(fields.map((f) => [f.id, f.name]));
  const Q = q.toUpperCase();
  const ts = topics.filter((t) => t.name.toUpperCase().includes(Q) || t.code.startsWith(Q)).sort((a, b) => b.total - a.total).slice(0, 50);
  const cs = companies.filter((c) => c.name.includes(Q)).slice(0, 30);
  $app.innerHTML = `<h1>「${esc(q)}」の検索結果</h1>
    <div class="grid"><div class="card span-8"><h2>細分野（${ts.length}）</h2><table>
      <tr><th>コード</th><th>細分野</th><th>分野</th><th class="num">出願</th></tr>
      ${ts.map((t) => `<tr class="click" data-href="#/topic/${t.code}"><td><code>${t.code}</code></td><td>${esc(t.name)}</td><td class="note">${esc(F[t.field])}</td><td class="num">${fmt(t.total)}</td></tr>`).join("") || `<tr><td colspan=4 class="note">該当なし</td></tr>`}
    </table></div>
    <div class="card span-4"><h2>企業（${cs.length}）</h2><table>
      ${cs.map((c) => `<tr class="click" data-href="#/company/${c.id}"><td>${esc(c.name)}</td><td class="num">${fmt(c.apps)}</td></tr>`).join("") || `<tr><td class="note">該当なし（上位300社のみ）</td></tr>`}
    </table></div></div>`;
  bindRowLinks();
}

// ---------------------------------------------------------------- 企業一覧
async function viewCompanies() {
  const [companies, fields] = await Promise.all([load("companies.json"), load("fields.json")]);
  const fname = Object.fromEntries(fields.map((f) => [f.id, f.name]));
  $app.innerHTML = `
    <h1>企業</h1>
    <p class="lead">2015年以降の出願件数が多い上位${companies.length}の出願人です。</p>
    <div class="toolbar"><input type="search" id="q" placeholder="出願人名で絞り込み（英語表記）">
      <select id="fl"><option value="">すべての分野</option>${fields.map((f) => `<option value="${f.id}">${esc(f.name)}</option>`).join("")}</select></div>
    <div class="card"><table id="tb"></table></div>`;
  const render = () => {
    const q = document.getElementById("q").value.toUpperCase(), fl = +document.getElementById("fl").value;
    const rows = companies.filter((c) => c.name.toUpperCase().includes(q) && (!fl || c.main_field === fl));
    document.getElementById("tb").innerHTML = `<tr><th>#</th><th>出願人</th><th>主分野</th><th class="num">出願</th><th class="num">登録</th></tr>` +
      rows.map((c) => `<tr class="click" data-id="${c.id}"><td>${companies.indexOf(c) + 1}</td><td>${esc(c.name)}</td>
        <td>${esc(fname[c.main_field] || "")}</td><td class="num">${fmt(c.apps)}</td><td class="num">${fmt(c.granted)}</td></tr>`).join("");
  };
  document.getElementById("q").oninput = render;
  document.getElementById("fl").onchange = render;
  document.getElementById("tb").onclick = (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) location.hash = `#/company/${tr.dataset.id}`; };
  render();
}

// ---------------------------------------------------------------- 企業プロファイル
async function viewCompany(id) {
  const [c, fields, companies] = await Promise.all([load(`companies/${id}.json`), load("fields.json"), load("companies.json")]);
  const F = Object.fromEntries(fields.map((f) => [f.id, f]));
  const byName = Object.fromEntries(companies.map((x) => [x.name, x.id]));
  const years = [...new Set(c.field_year.map((r) => r.year))].filter((y) => y >= 2015 && (y <= 2023 || META?.coverage?.[y] !== undefined) && coverageOf(y) >= MIN_COVERAGE).sort();
  const partial = years.filter((y) => coverageOf(y) < 1);
  const band = partial.length ? { silent: true, itemStyle: { color: "rgba(140,146,156,.15)" },
    label: { show: true, position: "insideTop", color: "#888", fontSize: 10, formatter: "公開待ちあり" },
    data: [[{ xAxis: String(partial[0]) }, { xAxis: String(partial[partial.length - 1]) }]] } : undefined;
  const topF = c.fields.slice(0, 8).map((x) => x.field);
  $app.innerHTML = `
    <p><a href="#/companies">← 企業一覧</a></p>
    <h1>${esc(c.name)}</h1>
    <div class="kpis">
      <div class="kpi"><div class="v">${fmt(c.apps)}</div><div class="l">出願（2015年以降）</div></div>
      <div class="kpi"><div class="v">${fmt(c.granted)}</div><div class="l">うち登録</div></div>
      <div class="kpi"><div class="v">${esc(F[c.main_field]?.name || "-")}</div><div class="l">主分野</div></div>
    </div>
    <div class="grid">
      <div class="card span-6"><h2>分野構成</h2><div id="pie" class="chart"></div></div>
      <div class="card span-6"><h2>分野別の推移（上位8分野）</h2><div id="st" class="chart"></div></div>
      <div class="card span-12"><h2>注力している細分野（上位20）</h2>
        <p class="note">増減は 2015–17年 → 2021–23年 の出願件数の比較です。</p><table>
        <tr><th>コード</th><th>細分野</th><th class="num">出願</th><th class="num">2015–17</th><th class="num">2021–23</th><th class="num">増減</th></tr>
        ${(c.subclasses || []).map((x) => { const d = x.early ? ((x.late / x.early - 1) * 100) : null;
          return `<tr class="click" data-href="#/topic/${x.code}"><td><code>${x.code}</code></td><td>${esc(x.name)}</td><td class="num">${fmt(x.apps)}</td>
          <td class="num">${fmt(x.early)}</td><td class="num">${fmt(x.late)}</td><td class="num ${d > 0 ? "up" : d < 0 ? "down" : ""}">${d == null ? "新規" : (d > 0 ? "+" : "") + d.toFixed(0) + "%"}</td></tr>`; }).join("")}
      </table></div>
      <div class="card span-6"><h2>研究開発の規模</h2><p class="note">その年の出願に名前のある発明者の人数（重複を除く）。個人名は表示しません。</p><div id="team" class="chart short"></div></div>
      <div class="card span-6"><h2>主な共同出願先</h2><table>
        <tr><th>出願人</th><th class="num">共同出願</th></tr>
        ${c.partners.map((p) => `<tr><td>${byName[p.name] ? `<a href="#/company/${byName[p.name]}">${esc(p.name)}</a>` : esc(p.name)}</td><td class="num">${fmt(p.apps)}</td></tr>`).join("") || `<tr><td colspan=2 class="note">なし</td></tr>`}
      </table></div>
    </div>
    <p><a href="#/compare/${id}">この企業を他社と比較 →</a></p>`;
  chart(document.getElementById("pie"), {
    tooltip: { formatter: (p) => `${p.name}<br>${fmt(p.value)}件 (${p.percent}%)` },
    series: [{ type: "pie", radius: ["35%", "70%"], label: { formatter: "{b}\n{d}%", fontSize: 11 },
      data: c.fields.slice(0, 10).map((x) => ({ name: F[x.field].name, value: x.apps, itemStyle: { color: AREA_COLOR[F[x.field].area] } }))
        .concat(c.fields.length > 10 ? [{ name: "その他", value: c.fields.slice(10).reduce((s, x) => s + x.apps, 0), itemStyle: { color: "#ccc" } }] : []) }],
  });
  chart(document.getElementById("st"), {
    tooltip: { trigger: "axis" }, legend: { type: "scroll", bottom: 0 }, grid: { left: 50, right: 10, top: 10, bottom: 50 },
    xAxis: { type: "category", data: years.map(String) }, yAxis: { type: "value" },
    series: topF.map((fid, k) => ({ name: F[fid].name, type: "line", stack: "s", areaStyle: {}, symbol: "none", markArea: k === 0 ? band : undefined,
      data: years.map((y) => c.field_year.find((r) => r.field === fid && r.year === y)?.apps || 0) })),
  });
  chart(document.getElementById("team"), {
    tooltip: { trigger: "axis" }, grid: { left: 50, right: 10, top: 10, bottom: 30 },
    xAxis: { type: "category", data: c.team.filter((t) => years.includes(t.year)).map((t) => String(t.year)) },
    yAxis: { type: "value", name: "人" },
    series: [{ type: "bar", markArea: band, data: c.team.filter((t) => years.includes(t.year)).map((t) => ({ value: t.unique_inventors,
      itemStyle: { color: coverageOf(t.year) < 1 ? "rgba(19,168,158,.45)" : "#13a89e" } })), itemStyle: { color: "#13a89e" } }],
  });
  bindRowLinks();
}

// ---------------------------------------------------------------- 比較
async function viewCompare(ids) {
  const [companies, fields] = await Promise.all([load("companies.json"), load("fields.json")]);
  let sel = (ids || "").split(",").filter(Boolean).slice(0, 5);
  if (!sel.length) sel = companies.slice(0, 3).map((c) => c.id);
  $app.innerHTML = `
    <h1>企業比較</h1><p class="lead">最大5社の分野構成を比べます。値は各社の出願に占める割合です。</p>
    <div class="toolbar"><input list="cl" id="add" placeholder="企業を追加（英語表記）"><datalist id="cl">${companies.map((c) => `<option value="${esc(c.name)}">`).join("")}</datalist>
      <div class="chips" id="chips"></div></div>
    <div class="card"><div id="hm" class="chart tall"></div></div>`;
  const draw = async () => {
    location.replace(`#/compare/${sel.join(",")}`);
    const ds = await Promise.all(sel.map((id) => load(`companies/${id}.json`)));
    document.getElementById("chips").innerHTML = ds.map((d, i) => `<button class="chip" data-i="${i}">${esc(d.name)} ×</button>`).join("");
    const share = ds.map((d) => { const t = d.fields.reduce((s, x) => s + x.apps, 0); return Object.fromEntries(d.fields.map((x) => [x.field, (x.apps / t) * 100])); });
    const used = fields.filter((f) => share.some((s) => (s[f.id] || 0) >= 1));
    const data = [];
    used.forEach((f, x) => ds.forEach((_, y) => data.push([x, y, +(share[y][f.id] || 0).toFixed(1)])));
    charts.forEach((c) => c.dispose()); charts.length = 0;
    chart(document.getElementById("hm"), {
      tooltip: { formatter: (p) => `${ds[p.data[1]].name}<br>${used[p.data[0]].name}: ${p.data[2]}%` },
      grid: { left: 220, right: 20, top: 10, bottom: 140 },
      xAxis: { type: "category", data: used.map((f) => f.name), axisLabel: { rotate: 50, fontSize: 11 } },
      yAxis: { type: "category", data: ds.map((d) => d.name), axisLabel: { fontSize: 12 } },
      visualMap: { min: 0, max: Math.max(10, ...data.map((d) => d[2])), calculable: true, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#f3f6fc", "#2f6fde"] } },
      series: [{ type: "heatmap", data, label: { show: true, formatter: (p) => (p.data[2] >= 1 ? p.data[2] : ""), fontSize: 10 } }],
    });
  };
  document.getElementById("add").onchange = (e) => {
    const c = companies.find((x) => x.name === e.target.value);
    if (c && !sel.includes(c.id) && sel.length < 5) { sel.push(c.id); draw(); }
    e.target.value = "";
  };
  document.getElementById("chips").onclick = (e) => { const b = e.target.closest("[data-i]"); if (b && sel.length > 1) { sel.splice(+b.dataset.i, 1); draw(); } };
  draw();
}

// ---------------------------------------------------------------- 共同出願ネットワーク
async function viewNetwork() {
  const [net, fields, companies] = await Promise.all([load("network.json"), load("fields.json"), load("companies.json")]);
  const F = Object.fromEntries(fields.map((f) => [f.id, f]));
  const byName = Object.fromEntries(companies.map((c) => [c.name, c.id]));
  $app.innerHTML = `
    <h1>共同出願ネットワーク</h1>
    <p class="lead">共同で15件以上出願した出願人どうしを線で結んでいます。円の大きさは出願件数、色は主分野の大分類です。グループ企業間の出願も含みます。</p>
    <div class="toolbar"><input type="search" id="q" placeholder="出願人を強調（英語表記）"></div>
    <div class="card"><div id="nw" class="chart" style="height:720px"></div></div>`;
  const maxApps = Math.max(...net.nodes.map((n) => n.apps));
  const nodes = net.nodes.map((n) => ({
    id: n.name, name: n.name, value: n.apps, symbolSize: 4 + 36 * Math.sqrt(n.apps / maxApps),
    itemStyle: { color: AREA_COLOR[F[n.main_field]?.area] || "#aaa" },
    label: { show: n.apps > maxApps * 0.08 } }));
  const c = chart(document.getElementById("nw"), {
    tooltip: { formatter: (p) => p.dataType === "edge" ? `${p.data.source} — ${p.data.target}<br>${fmt(p.data.value)}件` : `${p.name}<br>${fmt(p.value)}件` },
    series: [{ type: "graph", layout: "force", roam: true, draggable: true, data: nodes,
      edges: net.edges.map((e) => ({ source: e.source, target: e.target, value: e.apps, lineStyle: { width: Math.min(6, 0.5 + Math.log10(e.apps)) } })),
      force: { repulsion: 60, edgeLength: [20, 80], gravity: 0.08 },
      emphasis: { focus: "adjacency", lineStyle: { width: 4 } },
      lineStyle: { color: "source", opacity: 0.35, curveness: 0.1 }, label: { fontSize: 10, position: "right" } }],
  });
  c.on("dblclick", (p) => p.dataType === "node" && byName[p.name] && (location.hash = `#/company/${byName[p.name]}`));
  document.getElementById("q").oninput = (e) => {
    const q = e.target.value.toUpperCase();
    c.dispatchAction({ type: "downplay" });
    const idx = nodes.findIndex((n) => q && n.name.toUpperCase().includes(q));
    if (idx >= 0) c.dispatchAction({ type: "highlight", dataIndex: idx });
  };
}

// ---------------------------------------------------------------- データについて
async function viewAbout() {
  const meta = await load("meta.json");
  $app.innerHTML = `
    <h1>データについて</h1>
    <div class="card">
      <p><b>対象</b>: ${esc(meta.scope)}、${fmt(meta.applications)}件（技術分野を判定できたもの）</p>
      <p><b>出典</b>: ${esc(meta.source)}。技術分野は ${esc(meta.field_source)} で、各出願の筆頭IPCから判定しています。</p>
      <p><b>出願人名</b>: データセットの英語の統一表記（harmonized name）をそのまま使っています。グループ会社の名寄せはまだ行っていません。</p>
      <p><b>注意点</b></p>
      <ul>
        <li>出願は公開されるまで（通常は出願から1年半）データに含まれません。データ時点は ${esc(meta.data_as_of)} です。
          各年の収録率: ${Object.entries(meta.coverage).map(([y, c]) => `${y}年 ${(c * 100).toFixed(0)}%`).join("、")}。
          収録率は ${esc(meta.official_source)} の出願件数と比べて算出しています（国際出願の国内移行などで、完全な年でも公式件数の約9割が収録上限です）。</li>
        <li>出願人の情報は、公開公報（A）がある出願の約75%についてのみ取得できています。</li>
        <li>研究開発規模の人数は、英語表記の発明者名で重複を除いて数えた概算です。</li>
        <li>本サイトは集計値のみを表示しています。発明者個人の情報は掲載していません。</li>
      </ul>
    </div>`;
}

// ---------------------------------------------------------------- ルーター
async function route() {
  META ||= await load("meta.json");
  charts.forEach((c) => c.dispose()); charts.length = 0;
  const [, page, arg] = location.hash.split("/");
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active",
    a.dataset.nav === ({ "": "fields", field: "fields", topic: "fields", company: "companies" }[page || ""] || page)));
  $app.innerHTML = `<p class="loading">読み込み中…</p>`;
  try {
    if (page === "field") await viewField(arg);
    else if (page === "topic") await viewTopic(arg);
    else if (page === "search") await viewSearch(arg);
    else if (page === "companies") await viewCompanies();
    else if (page === "company") await viewCompany(arg);
    else if (page === "compare") await viewCompare(arg);
    else if (page === "network") await viewNetwork();
    else if (page === "about") await viewAbout();
    else await viewFields();
    window.scrollTo(0, 0);
  } catch (e) {
    $app.innerHTML = `<p>読み込みに失敗しました: ${esc(e.message)}</p>`;
    console.error(e);
  }
}
window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", () => {
  const f = document.getElementById("search");
  f.onsubmit = (e) => { e.preventDefault(); const q = f.q.value.trim(); if (q) location.hash = `#/search/${encodeURIComponent(q)}`; };
});
window.addEventListener("DOMContentLoaded", route);
