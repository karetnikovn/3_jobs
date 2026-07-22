function switchTab(name) {
  document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });
  document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
  document.getElementById("tab-" + name).classList.add("active");
  document.querySelector('.tab-btn[onclick*="' + name + '"]').classList.add("active");
  if (name === "rankings") { renderRankBumpCharts(); renderRankings(); }
  if (name === "titles") renderTitles();
  if (name === "topskills") { renderBumpChart(); renderTopSkills(); }
  if (name === "onetdata") renderOnetData();
  if (name === "coverage") renderCoverage();
  if (name === "mechanisms") renderMechanisms();
  if (name === "matrixcheck") renderMatrixCheck();
  if (name === "occcompare") renderOccCompare();
  if (name === "deltas") renderSkillDeltas();
}

const ALL_OCC = "All";
const OCCS = [...new Set(DATA.map(function(d) { return d.occupation; }))].filter(function(o) { return o !== ALL_OCC; });
const OCC_OPTIONS = [ALL_OCC].concat(OCCS);

/** Shared plot filter: hide rows with 2026 penetration below this % (0 = off). */
const MIN_PENETRATION_CUT = 5;
let minPenetrationPct = 0;

/** Keep rows if >= this % in 2023 or 2026 (0 = off). Applies to Lightcast skills and ESCO aggregates. */
const EITHER_YEAR_CUT = 5;
let eitherYearFloorPct = EITHER_YEAR_CUT;

/** Matrix mapping-confidence variant: 1 = all (c1+c2+c3), 2 = c2+c3, 3 = c3 only.
    Node penetration (DATA) and node exposure are precomputed per variant;
    skill-level node labels are gated via effNode(). */
let matrixConfMin = 1;

function skillMapConf(skill, node) {
  if (!node || typeof DICT === "undefined" || !DICT[node] || !DICT[node].conf) return null;
  var c = DICT[node].conf[skill];
  return c == null ? null : c;
}

/** Effective node for a skill under the current confidence variant (null = treat as unmapped). */
function effNode(skill, node) {
  if (!node) return null;
  if (matrixConfMin <= 1) return node;
  var c = skillMapConf(skill, node);
  return (c == null || c >= matrixConfMin) ? node : null;
}

function rowPenetration2026(r) {
  if (!r) return 0;
  if (typeof r.p26 === "number") return r.p26;
  if (typeof r.pct_2026 === "number") return r.pct_2026;
  return 0;
}

function filterByPenetration(rows) {
  if (!minPenetrationPct || !rows || !rows.length) return rows || [];
  return rows.filter(function(r) { return rowPenetration2026(r) >= minPenetrationPct; });
}

function rowPenetrationEither(r) {
  if (!r) return 0;
  var p23 = typeof r.pct_2023 === "number" ? r.pct_2023 : (typeof r.p23 === "number" ? r.p23 : 0);
  var p26 = typeof r.pct_2026 === "number" ? r.pct_2026 : (typeof r.p26 === "number" ? r.p26 : 0);
  return Math.max(p23, p26);
}

function filterByEitherYear(rows) {
  if (!eitherYearFloorPct || !rows || !rows.length) return rows || [];
  return rows.filter(function(r) { return rowPenetrationEither(r) >= eitherYearFloorPct; });
}

function penetrationFilterNote() {
  var parts = [];
  if (eitherYearFloorPct) parts.push("\u2265" + eitherYearFloorPct + "% either year");
  if (minPenetrationPct) parts.push("hide <" + minPenetrationPct + "% 2026");
  return parts.length ? (" | " + parts.join(" | ")) : "";
}

function refreshPenetrationDependentViews() {
  if (typeof renderMechanisms === "function") renderMechanisms();
  if (typeof renderMatrixCheck === "function") renderMatrixCheck();
  if (typeof renderOccCompare === "function") renderOccCompare();
  if (typeof renderSkillDeltas === "function") renderSkillDeltas();
  if (typeof renderRankings === "function") renderRankings();
  if (typeof renderRankBumpCharts === "function") renderRankBumpCharts();
  if (typeof renderBumpChart === "function") renderBumpChart();
  if (typeof renderTopSkills === "function") renderTopSkills();
  if (typeof render === "function") render();
}

let currentOcc = ALL_OCC;
let currentRankOcc = ALL_OCC;

const PARENT_NODES = new Set();
HIERARCHY.forEach(function(g) {
  [g.hard, g.soft].forEach(function(s) {
    if (s) PARENT_NODES.add(s.parent);
  });
});

let rankSort = { hard: { col: "fold", dir: -1 }, soft: { col: "fold", dir: -1 } };
let topSkillsYear = 2026;
let currentBumpOcc = null;
const BUMP_N = 20;
const BUMP_ROW_H = 26;
const BUMP_PAD_TOP = 18;

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hasAllOccData() {
  return DATA.some(function(d) { return d.occupation === ALL_OCC; });
}

function occList(occ) {
  return occ === ALL_OCC ? (hasAllOccData() ? [ALL_OCC] : OCCS) : [occ];
}

function getJobCounts(occ) {
  var jobs23 = 0;
  var jobs26 = 0;
  occList(occ).forEach(function(o) {
    var r23 = DATA.find(function(d) { return d.occupation === o && d.year === 2023; });
    var r26 = DATA.find(function(d) { return d.occupation === o && d.year === 2026; });
    if (r23) jobs23 += r23.total_jobs;
    if (r26) jobs26 += r26.total_jobs;
  });
  return { jobs23: jobs23, jobs26: jobs26 };
}

function getNodeNjobs(d) {
  return d.n_jobs != null ? d.n_jobs : Math.round(d.pct / 100 * d.total_jobs);
}

function addOccButtons(container, onSelect, occs) {
  (occs || OCC_OPTIONS).forEach(function(occ) {
    var btn = document.createElement("button");
    btn.textContent = occ;
    btn.dataset.occ = occ;
    btn.onclick = function() { onSelect(occ); };
    container.appendChild(btn);
  });
}

function getNodeData(occ) {
  var occs = occList(occ);
  var counts = getJobCounts(occ);
  var map = {};
  DATA.filter(function(d) { return occs.indexOf(d.occupation) !== -1; }).forEach(function(d) {
    if (!map[d.node]) map[d.node] = { matrixCat: d.category, isParent: false, n23: 0, n26: 0 };
    var n = getNodeNjobs(d);
    if (d.year === 2023) map[d.node].n23 += n;
    if (d.year === 2026) map[d.node].n26 += n;
  });
  Object.keys(map).forEach(function(node) {
    var m = map[node];
    m.pct23 = counts.jobs23 ? m.n23 / counts.jobs23 * 100 : 0;
    m.pct26 = counts.jobs26 ? m.n26 / counts.jobs26 * 100 : 0;
    m.change = m.pct26 - m.pct23;
  });
  HIERARCHY.forEach(function(g) {
    [g.hard, g.soft].forEach(function(s) {
      if (s && map[s.parent]) map[s.parent].isParent = true;
    });
  });
  return map;
}

function makeRow(name, data, maxPct, isParent) {
  var p23 = data ? data.pct23 : 0;
  var p26 = data ? data.pct26 : 0;
  var chg = data ? data.change : 0;
  var chgCls = chg >= 3 ? "up" : (chg <= -3 ? "down" : "stable");
  var div = document.createElement("div");
  div.className = isParent ? "group-parent-row" : "child-row";
  div.innerHTML =
    "<span style='" + (isParent ? "font-weight:700;color:#fff" : "color:#bbb") + "'>" +
    escapeHtml(name) +
    (isParent ? " <span style='font-size:0.65rem;color:#555;font-weight:400'>(union of children)</span>" : "") +
    "</span><span class='num'>" + p23.toFixed(1) + "%</span><span class='num'>" + p26.toFixed(1) + "%</span>" +
    "<div class='bar-wrap'><div class='bar bar-2023' style='width:" + (p23 / maxPct * 100) + "%'></div>" +
    "<div class='bar bar-2026' style='width:" + (p26 / maxPct * 100) + "%;background:" + (p26 >= p23 ? "#4ade80" : "#f87171") + "'></div></div>" +
    "<span class='num change " + chgCls + "'>" + (chg > 0 ? "+" : "") + chg.toFixed(1) + "pp</span>";
  return div;
}

function render() {
  controls.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentOcc);
  });
  var jobs = getJobCounts(currentOcc);
  document.getElementById("job-counts").textContent =
    currentOcc + " — 2023: " + jobs.jobs23.toLocaleString() + " jobs | 2026: " + jobs.jobs26.toLocaleString() + " jobs";
  var nodeData = getNodeData(currentOcc);
  var maxPct = 1;
  Object.keys(nodeData).forEach(function(k) {
    maxPct = Math.max(maxPct, nodeData[k].pct23 || 0, nodeData[k].pct26 || 0);
  });
  var content = document.getElementById("content");
  content.innerHTML = "";
  HIERARCHY.forEach(function(g) {
    var w = document.createElement("div");
    w.className = "two-col";
    [g.hard, g.soft].forEach(function(side) {
      var col = document.createElement("div");
      col.className = "col-side";
      if (side && side.parent) {
        col.appendChild(makeRow(side.parent, nodeData[side.parent], maxPct, true));
        (side.children || []).forEach(function(c) {
          col.appendChild(makeRow(c, nodeData[c], maxPct, false));
        });
      }
      w.appendChild(col);
    });
    content.appendChild(w);
  });
}

function getFoldSortKey(p23, p26) {
  if (p23 === 0 && p26 === 0) return 1;
  if (p23 === 0 && p26 > 0) return 1e6 + p26;
  if (p23 > 0 && p26 === 0) return 0;
  return p26 / p23;
}

function formatFold(p23, p26) {
  if (p23 === 0 && p26 === 0) return { text: "\u2014", cls: "stable" };
  if (p23 === 0 && p26 > 0) return { text: "new", cls: "new" };
  if (p23 > 0 && p26 === 0) return { text: "0\u00d7", cls: "down" };
  var r = p26 / p23;
  var t = (r >= 10 ? r.toFixed(1) : r.toFixed(2)) + "\u00d7";
  return { text: t, cls: r > 1.05 ? "up" : (r < 0.95 ? "down" : "stable") };
}

function getRankingEntries(occ, skillType) {
  var occs = occList(occ);
  var counts = getJobCounts(occ);
  var nodes = {};
  DATA.filter(function(d) { return occs.indexOf(d.occupation) !== -1 && d.type === skillType; }).forEach(function(d) {
    if (PARENT_NODES.has(d.node)) return;
    if (!nodes[d.node]) nodes[d.node] = { category: d.category, n23: 0, n26: 0 };
    var n = getNodeNjobs(d);
    if (d.year === 2023) nodes[d.node].n23 += n;
    if (d.year === 2026) nodes[d.node].n26 += n;
  });
  var entries = Object.keys(nodes).map(function(node) {
    var info = nodes[node];
    var p23 = counts.jobs23 ? info.n23 / counts.jobs23 * 100 : 0;
    var p26 = counts.jobs26 ? info.n26 / counts.jobs26 * 100 : 0;
    return {
      node: node,
      category: info.category,
      p23: p23,
      p26: p26,
      change: p26 - p23,
      sortKey: getFoldSortKey(p23, p26),
      fold: formatFold(p23, p26)
    };
  });
  return filterByPenetration(entries);
}

function sortRankingEntries(entries, col, dir) {
  return entries.slice().sort(function(a, b) {
    var cmp = col === "node" ? a.node.localeCompare(b.node) :
      col === "p23" ? a.p23 - b.p23 :
      col === "p26" ? a.p26 - b.p26 :
      col === "fold" ? a.sortKey - b.sortKey :
      a.change - b.change;
    return cmp !== 0 ? cmp * dir : b.p26 - a.p26;
  });
}

function makeSortableHeader(label, col, skillType, isNum) {
  var s = rankSort[skillType];
  var active = s.col === col;
  var arrow = active ? (s.dir === -1 ? "\u25BC" : "\u25B2") : "";
  return "<span class='sortable" + (isNum ? " num" : "") + (active ? " active" : "") +
    "' data-col='" + col + "' data-type='" + skillType + "'>" + label +
    (arrow ? " <span class='sort-arrow'>" + arrow + "</span>" : "") + "</span>";
}

function makeRankColumn(title, titleClass, entries, skillType) {
  var col = document.createElement("div");
  col.className = "col-side";
  var hdr = document.createElement("div");
  hdr.className = "rank-col-title " + titleClass;
  hdr.textContent = title + " (" + entries.length + ")";
  col.appendChild(hdr);
  var sorted = sortRankingEntries(entries, rankSort[skillType].col, rankSort[skillType].dir);
  var th = document.createElement("div");
  th.className = "rank-header";
  th.innerHTML =
    "<span>#</span>" +
    makeSortableHeader("Skill node", "node", skillType, false) +
    "<span>Mechanism</span>" +
    makeSortableHeader("2023", "p23", skillType, true) +
    makeSortableHeader("2026", "p26", skillType, true) +
    makeSortableHeader("Change", "fold", skillType, true);
  th.querySelectorAll(".sortable").forEach(function(el) {
    el.onclick = function() {
      var c = el.dataset.col;
      if (rankSort[skillType].col === c) rankSort[skillType].dir *= -1;
      else {
        rankSort[skillType].col = c;
        rankSort[skillType].dir = c === "node" ? 1 : -1;
      }
      renderRankings();
    };
  });
  col.appendChild(th);
  sorted.forEach(function(e, i) {
    var row = document.createElement("div");
    row.className = "rank-row";
    row.innerHTML =
      "<span class='rank-num'>" + (i + 1) + "</span>" +
      "<span class='rank-name'>" + escapeHtml(e.node) + "</span>" +
      "<span class='rank-mech'>" + mechTagHtml(e.node, e.change) + "</span>" +
      "<span class='num'>" + e.p23.toFixed(1) + "%</span>" +
      "<span class='num'>" + e.p26.toFixed(1) + "%</span>" +
      "<span class='rank-fold " + e.fold.cls + "'>" + e.fold.text + "</span>";
    col.appendChild(row);
  });
  return col;
}

function renderRankings() {
  rankControls.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentRankOcc);
  });
  var jobs = getJobCounts(currentRankOcc);
  document.getElementById("rank-job-counts").textContent =
    currentRankOcc + " — 2023: " + jobs.jobs23.toLocaleString() + " jobs | 2026: " + jobs.jobs26.toLocaleString() + " jobs";
  var w = document.createElement("div");
  w.className = "two-col";
  w.appendChild(makeRankColumn("Hard skills", "hard", getRankingEntries(currentRankOcc, "hard"), "hard"));
  w.appendChild(makeRankColumn("Soft skills", "soft", getRankingEntries(currentRankOcc, "soft"), "soft"));
  var c = document.getElementById("rank-content");
  c.innerHTML = mechLegendHtml();
  c.appendChild(w);
}

function bumpNodeLabelHtml(item) {
  return "<span class='bump-skill'>" + escapeHtml(item[0]) + "</span>";
}

function getCombinedNodePenetrationRankLists(occ, limit) {
  var entries = [];
  ["hard", "soft"].forEach(function(t) {
    getRankingEntries(occ, t).forEach(function(e) {
      entries.push({ node: e.node, category: e.category, type: t, p23: e.p23, p26: e.p26 });
    });
  });
  var list23 = entries.slice().sort(function(a, b) { return b.p23 - a.p23; }).slice(0, limit)
    .map(function(e) { return [e.node, 0, e.p23, e.category, e.type]; });
  var list26 = entries.slice().sort(function(a, b) { return b.p26 - a.p26; }).slice(0, limit)
    .map(function(e) { return [e.node, 0, e.p26, e.category, e.type]; });
  var rankLookup23 = {};
  var absentIn2023 = {};
  entries.slice().sort(function(a, b) { return b.p23 - a.p23; }).forEach(function(e, i) {
    rankLookup23[e.node] = i + 1;
    if (e.p23 === 0) absentIn2023[e.node] = true;
  });
  return { list23: list23, list26: list26, n: limit, rankLookup23: rankLookup23, absentIn2023: absentIn2023 };
}

function getRankedList(info, year) {
  return info["ranked_" + year] || info["top_" + year] || [];
}

function bumpY(rank) {
  return BUMP_PAD_TOP + (rank - 1) * BUMP_ROW_H + BUMP_ROW_H / 2;
}

function bumpRank23(topRank, fullRank, absent) {
  return absent ? null : (topRank || fullRank || null);
}

function bumpLineClass(topRank, rank26, fullRank, absent) {
  if (!rank26) return "stable";
  if (absent) return "new";
  var r23 = bumpRank23(topRank, fullRank, false);
  if (!r23) return "stable";
  var d = r23 - rank26;
  return d >= 3 ? "up" : (d <= -3 ? "down" : "stable");
}

function bumpDeltaHtml(topRank, rank26, fullRank, absent) {
  if (!rank26) return "<span class='bump-delta stable'>\u2014</span>";
  if (absent) return "<span class='bump-delta new'>new</span>";
  var r23 = bumpRank23(topRank, fullRank, false);
  if (!r23) return "<span class='bump-delta new'>new</span>";
  var d = r23 - rank26;
  if (d > 0) return "<span class='bump-delta up'>\u25B2" + d + "</span>";
  if (d < 0) return "<span class='bump-delta down'>\u25BC" + Math.abs(d) + "</span>";
  return "<span class='bump-delta stable'>\u2014</span>";
}

function bumpLabelHtml(name) {
  return "<span class='bump-skill' title='" + escapeHtml(name) + "'>" + escapeHtml(name) + "</span>";
}

function highlightBumpItem(root, skill, on) {
  if (!root) return;
  root.querySelectorAll(".bump-row").forEach(function(r) {
    r.classList.toggle("highlight", on && r.dataset.skill === skill);
  });
  var svg = root.querySelector(".bump-svg");
  if (svg) {
    svg.querySelectorAll(".bump-line").forEach(function(l) {
      if (on && l.dataset.skill === skill) l.classList.add("active");
      else if (on) { l.classList.add("muted"); l.classList.remove("active"); }
      else l.classList.remove("active", "muted");
    });
  }
}

function renderBumpChartCore(chartEl, list23, list26, n, labelFn, bumpMeta) {
  chartEl.innerHTML = "";
  n = n || BUMP_N;
  bumpMeta = bumpMeta || {};
  var rankLookup23 = bumpMeta.rankLookup23 || {};
  var absentIn2023 = bumpMeta.absentIn2023 || {};
  var rank23 = {};
  var rank26 = {};
  list23.forEach(function(it, i) { rank23[it[0]] = i + 1; });
  list26.forEach(function(it, i) { rank26[it[0]] = i + 1; });
  var tracked = {};
  list23.forEach(function(it) { tracked[it[0]] = 1; });
  list26.forEach(function(it) { tracked[it[0]] = 1; });
  var skills = Object.keys(tracked);
  var chartH = BUMP_PAD_TOP * 2 + n * BUMP_ROW_H;
  var svgW = 200;
  var left = document.createElement("div");
  left.className = "bump-side";
  left.innerHTML = "<div class='bump-year-hdr'>2023</div>";
  var leftRows = {};
  for (var i = 0; i < n; i++) {
    var it = list23[i];
    var row = document.createElement("div");
    row.className = "bump-row";
    row.style.height = BUMP_ROW_H + "px";
    if (it) {
      row.dataset.skill = it[0];
      row.innerHTML =
        "<span class='bump-rank" + (i < 3 ? " top3" : "") + "'>" + (i + 1) + "</span>" +
        (labelFn ? labelFn(it) : bumpLabelHtml(it[0])) +
        "<span class='bump-pct'>" + it[2].toFixed(1) + "%</span>";
      leftRows[it[0]] = row;
    } else {
      row.innerHTML = "<span class='bump-rank'>" + (i + 1) + "</span><span></span><span></span>";
    }
    left.appendChild(row);
  }
  var svgCol = document.createElement("div");
  svgCol.className = "bump-svg-col";
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "bump-svg");
  svg.setAttribute("width", svgW);
  svg.setAttribute("height", chartH);
  svg.setAttribute("viewBox", "0 0 " + svgW + " " + chartH);
  var off = n + 0.5;
  skills.forEach(function(sk) {
    var y1 = bumpY(rank23[sk] || off);
    var y2 = bumpY(rank26[sk] || off);
    var mx = svgW / 2;
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M 0 " + y1 + " C " + mx + " " + y1 + ", " + mx + " " + y2 + ", " + svgW + " " + y2);
    path.setAttribute("class", "bump-line " + bumpLineClass(rank23[sk], rank26[sk], rankLookup23[sk], !!absentIn2023[sk]));
    path.dataset.skill = sk;
    path.addEventListener("mouseenter", function() { highlightBumpItem(chartEl, sk, true); });
    path.addEventListener("mouseleave", function() { highlightBumpItem(chartEl, sk, false); });
    svg.appendChild(path);
  });
  svgCol.appendChild(svg);
  var right = document.createElement("div");
  right.className = "bump-side";
  right.innerHTML = "<div class='bump-year-hdr'>2026</div>";
  for (var j = 0; j < n; j++) {
    var it2 = list26[j];
    var rowR = document.createElement("div");
    rowR.className = "bump-row right";
    rowR.style.height = BUMP_ROW_H + "px";
    if (it2) {
      rowR.dataset.skill = it2[0];
      rowR.innerHTML =
        bumpDeltaHtml(rank23[it2[0]], j + 1, rankLookup23[it2[0]], !!absentIn2023[it2[0]]) +
        "<span class='bump-rank" + (j < 3 ? " top3" : "") + "'>" + (j + 1) + "</span>" +
        (labelFn ? labelFn(it2) : bumpLabelHtml(it2[0])) +
        "<span class='bump-pct'>" + it2[2].toFixed(1) + "%</span>";
      (function(s) {
        rowR.addEventListener("mouseenter", function() { highlightBumpItem(chartEl, s, true); });
        rowR.addEventListener("mouseleave", function() { highlightBumpItem(chartEl, s, false); });
      })(it2[0]);
    } else {
      rowR.innerHTML = "<span></span><span class='bump-rank'>" + (j + 1) + "</span><span></span><span></span>";
    }
    right.appendChild(rowR);
  }
  Object.keys(leftRows).forEach(function(sk) {
    leftRows[sk].addEventListener("mouseenter", function() { highlightBumpItem(chartEl, sk, true); });
    leftRows[sk].addEventListener("mouseleave", function() { highlightBumpItem(chartEl, sk, false); });
  });
  chartEl.appendChild(left);
  chartEl.appendChild(svgCol);
  chartEl.appendChild(right);
}

function renderRankBumpCharts() {
  rankControls.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentRankOcc);
  });
  var jobs = getJobCounts(currentRankOcc);
  document.getElementById("rank-job-counts").textContent =
    currentRankOcc + " \u2014 2023: " + jobs.jobs23.toLocaleString() + " jobs | 2026: " + jobs.jobs26.toLocaleString() + " jobs";
  var lists = getCombinedNodePenetrationRankLists(currentRankOcc, BUMP_N);
  document.getElementById("rank-bump-meta").textContent = "Top " + BUMP_N + " nodes (hard + soft) by penetration %";
  renderBumpChartCore(
    document.getElementById("rank-bump-chart"),
    lists.list23,
    lists.list26,
    BUMP_N,
    bumpNodeLabelHtml,
    { rankLookup23: lists.rankLookup23, absentIn2023: lists.absentIn2023 }
  );
}

function renderBumpChart() {
  bumpControls.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentBumpOcc);
  });
  var chartEl = document.getElementById("bump-chart");
  var metaEl = document.getElementById("bump-meta");
  chartEl.innerHTML = "";
  if (typeof TOP_SKILLS === "undefined" || !TOP_SKILLS || !TOP_SKILLS[currentBumpOcc]) {
    metaEl.textContent = "No rank data";
    return;
  }
  var info = TOP_SKILLS[currentBumpOcc];
  var list23 = getRankedList(info, 2023);
  var list26 = getRankedList(info, 2026);
  metaEl.textContent = (info.name || currentBumpOcc) + " | top " + BUMP_N + " skills";
  var bumpMeta = { rankLookup23: info.rank_lookup_2023 || {}, absentIn2023: {} };
  list26.forEach(function(it) {
    if (!bumpMeta.rankLookup23[it[0]]) bumpMeta.absentIn2023[it[0]] = true;
  });
  renderBumpChartCore(chartEl, list23, list26, BUMP_N, function(it) { return bumpLabelHtml(it[0]); }, bumpMeta);
}

function renderTopSkills() {
  topskillsYearEl.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", parseInt(b.dataset.year, 10) === topSkillsYear);
  });
  bumpControls.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentBumpOcc);
  });
  var content = document.getElementById("topskills-content");
  content.innerHTML = "";
  if (typeof TOP_SKILLS === "undefined" || !TOP_SKILLS) {
    content.innerHTML = "<p>No top skills data</p>";
    return;
  }
  (currentBumpOcc === ALL_OCC ? [ALL_OCC] : [currentBumpOcc]).forEach(function(occ) {
    var info = TOP_SKILLS[occ];
    if (!info) return;
    var topList = getRankedList(info, topSkillsYear).slice(0, 10);
    var block = document.createElement("div");
    block.className = "top-skills-block";
    block.innerHTML =
      "<div class='top-skills-occ-title'>" + escapeHtml(info.name || occ) + "</div>" +
      "<div class='top-skills-header'><span>#</span><span>Skill</span><span class='num'>Jobs</span><span class='num'>%</span></div>";
    topList.forEach(function(it, i) {
      var row = document.createElement("div");
      row.className = "top-skills-row";
      var node = effNode(it[0], it[3]);
      row.innerHTML =
        "<span class='rank-num'>" + (i + 1) + "</span>" +
        "<span class='top-skills-name'>" + escapeHtml(it[0]) +
        (node ? "<span class='top-skills-node'>" + escapeHtml(node) + "</span>" : "<span class='top-skills-unmapped'>unmapped</span>") +
        "</span><span class='num'>" + it[1].toLocaleString() + "</span><span class='num'>" + it[2].toFixed(1) + "%</span>";
      block.appendChild(row);
    });
    content.appendChild(block);
  });
}

function getDisplaySkills(nodeName, query) {
  var info = DICT[nodeName];
  if (!info) return [];
  var skills = (info.skills || []).filter(function(s) { return effNode(s, nodeName); });
  if (!query) return skills;
  if (nodeName.toLowerCase().indexOf(query) !== -1) return skills;
  return skills.filter(function(s) { return s.toLowerCase().indexOf(query) !== -1; });
}

function nodeMatchesSearch(nodeName, query) {
  if (!query) return true;
  if (nodeName.toLowerCase().indexOf(query) !== -1) return true;
  var info = DICT[nodeName];
  return info && info.skills && info.skills.some(function(s) { return s.toLowerCase().indexOf(query) !== -1; });
}

function sideMatchesSearch(side, query) {
  if (!side) return false;
  return nodeMatchesSearch(side.parent, query) || side.children.some(function(c) { return nodeMatchesSearch(c, query); });
}

function expColor(v) {
  var h = Math.round(140 * (1 - Math.max(0, Math.min(1, v))));
  return "hsl(" + h + ",65%,58%)";
}

function skillExpHtml(s) {
  if (typeof SKILL_AI_EXPOSURE === "undefined") return "";
  var v = SKILL_AI_EXPOSURE[s];
  if (v == null) return "";
  return " <span class='skill-exp' style='color:" + expColor(v) + "' title='AI-exposure " + v.toFixed(2) + "'>" + v.toFixed(2) + "</span>";
}

function nodeExpMetaHtml(skills) {
  if (typeof SKILL_AI_EXPOSURE === "undefined") return "";
  var vals = skills.map(function(s) { return SKILL_AI_EXPOSURE[s]; }).filter(function(v) { return v != null; });
  if (!vals.length) return "";
  var mean = vals.reduce(function(a, b) { return a + b; }, 0) / vals.length;
  return " \u00b7 avg AI-exposure <span style='color:" + expColor(mean) + ";font-weight:700'>" + mean.toFixed(2) + "</span>";
}

/** Mapping-confidence badge (LLM adjudication: 3 = clear, 2 = reasonable, 1 = borderline). */
function skillConfHtml(nodeName, s) {
  var info = DICT[nodeName];
  if (!info || !info.conf) return "";
  var c = info.conf[s];
  if (c == null) return "";
  var colors = { 3: "#4ade80", 2: "#facc15", 1: "#f87171" };
  var labels = { 3: "clear construct fit", 2: "reasonable fit", 1: "borderline fit" };
  return "<span class='skill-conf' style='color:" + colors[c] + "' title='Mapping confidence " + c + "/3 — " + labels[c] + " (LLM-adjudicated)'>c" + c + "</span>";
}

function appendSkillTags(container, className, skills, nodeName) {
  var el = document.createElement("div");
  el.className = className + " dict-skills";
  el.innerHTML = skills.length ?
    skills.map(function(s) { return "<span class='skill-tag'>" + escapeHtml(s) + skillExpHtml(s) + (nodeName ? skillConfHtml(nodeName, s) : "") + "</span>"; }).join("") :
    "<span class='dict-empty'>No mapped skills</span>";
  container.appendChild(el);
}

function makeDictCategoryBlock(nodeName, query, counts) {
  var info = DICT[nodeName];
  if (!info) return null;
  var displaySkills = getDisplaySkills(nodeName, query);
  var block = document.createElement("div");
  var nameEl = document.createElement("div");
  nameEl.className = "dict-category";
  nameEl.textContent = nodeName;
  block.appendChild(nameEl);
  if (query && displaySkills.length > 0) {
    counts.skills += displaySkills.length;
    appendSkillTags(block, "dict-category-skills", displaySkills, nodeName);
  }
  return block;
}

function makeDictNodeBlock(nodeName, query, counts) {
  if (!nodeMatchesSearch(nodeName, query)) return null;
  var info = DICT[nodeName];
  if (!info) return null;
  var displaySkills = getDisplaySkills(nodeName, query);
  if (query && displaySkills.length === 0) return null;
  counts.nodes++;
  counts.skills += displaySkills.length;
  var block = document.createElement("div");
  block.className = "dict-node-block";
  var nameEl = document.createElement("div");
  nameEl.className = "dict-node-name";
  nameEl.innerHTML = escapeHtml(nodeName) + "<span class='dict-node-meta'>" + displaySkills.length + " skills" + nodeExpMetaHtml(displaySkills) + "</span>";
  block.appendChild(nameEl);
  appendSkillTags(block, "dict-node-skills", displaySkills, nodeName);
  return block;
}

function buildDictSide(side, query, counts) {
  if (!side || !sideMatchesSearch(side, query)) return null;
  var col = document.createElement("div");
  col.className = "col-side";
  var type = DICT[side.parent] ? DICT[side.parent].type : "hard";
  var header = document.createElement("div");
  header.className = "dict-col-header " + type;
  header.textContent = type;
  col.appendChild(header);
  col.appendChild(makeDictCategoryBlock(side.parent, query, counts));
  side.children.forEach(function(child) {
    var cb = makeDictNodeBlock(child, query, counts);
    if (cb) col.appendChild(cb);
  });
  return col.childElementCount > 1 ? col : null;
}

function renderDict() {
  var query = (document.getElementById("dict-search").value || "").toLowerCase().trim();
  var content = document.getElementById("dict-content");
  var statsEl = document.getElementById("dict-stats");
  var counts = { nodes: 0, skills: 0 };
  var totalSkills = Object.keys(DICT).reduce(function(n, nodeName) {
    var d = DICT[nodeName];
    return n + (d.skills || []).filter(function(s) { return effNode(s, nodeName); }).length;
  }, 0);
  var totalNodes = Object.keys(DICT).length;
  var hasResults = false;
  content.innerHTML = "";
  HIERARCHY.forEach(function(group, idx) {
    if (!sideMatchesSearch(group.hard, query) && !sideMatchesSearch(group.soft, query)) return;
    hasResults = true;
    var wrapper = document.createElement("div");
    wrapper.className = "two-col dict-group" + (idx === 4 || idx === 5 ? " section-end" : "");
    var leftCol = buildDictSide(group.hard, query, counts);
    var rightCol = buildDictSide(group.soft, query, counts);
    if (leftCol) wrapper.appendChild(leftCol);
    else wrapper.appendChild(document.createElement("div")).className = "col-side";
    if (rightCol) wrapper.appendChild(rightCol);
    else wrapper.appendChild(document.createElement("div")).className = "col-side";
    content.appendChild(wrapper);
  });
  if (!hasResults) content.innerHTML = "<div class='dict-no-results'>No nodes or skills match your search.</div>";
  statsEl.innerHTML = (query ?
    "Showing " + counts.nodes + " of " + totalNodes + " nodes (" + counts.skills + " skills)" :
    totalNodes + " nodes, " + totalSkills + " mapped skills (cosine similarity \u2265 0.45)") +
    " \u00b7 number after each skill = AI-exposure (" +
    "<span style='color:" + expColor(0.1) + "'>low</span>\u2192" +
    "<span style='color:" + expColor(0.9) + "'>high</span>)";
}

function getOccTitlesKey(occName) {
  for (var code in OCC_TITLES) {
    if (OCC_TITLES[code].name === occName) return code;
  }
  return null;
}

function renderTitles() {
  titlesControls.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentTitlesOcc);
  });
  var code = getOccTitlesKey(currentTitlesOcc);
  var info = code ? OCC_TITLES[code] : null;
  var onetEl = document.getElementById("titles-onet");
  var statsEl = document.getElementById("titles-stats");
  var content = document.getElementById("titles-content");
  var footnote = document.getElementById("titles-footnote");
  if (!info) {
    onetEl.textContent = "No title data";
    statsEl.textContent = "";
    content.innerHTML = "";
    footnote.textContent = "";
    return;
  }
  onetEl.innerHTML =
    "<strong style='color:#ccc'>" + escapeHtml(info.name) + "</strong> &mdash; O*NET <code>" + escapeHtml(info.onet) + "</code>";
  var query = (document.getElementById("titles-search").value || "").toLowerCase().trim();
  var showAll = document.getElementById("titles-show-all").checked;
  var allTitles = info.titles || [];
  var filtered = query ? allTitles.filter(function(t) { return t[0].toLowerCase().indexOf(query) !== -1; }) : allTitles;
  var limit = query ? TITLES_SEARCH_LIMIT : (showAll ? TITLES_ALL_LIMIT : TITLES_DEFAULT_LIMIT);
  var shown = filtered.slice(0, limit);
  statsEl.textContent =
    info.unique_titles.toLocaleString() + " unique titles | " +
    info.postings_2023.toLocaleString() + " (2023) | " +
    info.postings_2026.toLocaleString() + " (2026)" +
    (query ? " | " + filtered.length + " matches" : "");
  content.innerHTML =
    "<div class='titles-header'><span>#</span><span>Job title</span><span class='num'>2023</span><span class='num'>2026</span><span class='num'>Total</span></div>";
  shown.forEach(function(t, i) {
    var row = document.createElement("div");
    row.className = "titles-row";
    row.innerHTML =
      "<span class='rank-num'>" + (i + 1) + "</span>" +
      "<span class='titles-name'>" + escapeHtml(t[0]) + "</span>" +
      "<span class='num'>" + t[1].toLocaleString() + "</span>" +
      "<span class='num'>" + t[2].toLocaleString() + "</span>" +
      "<span class='num'>" + (t[1] + t[2]).toLocaleString() + "</span>";
    content.appendChild(row);
  });
  footnote.textContent = filtered.length > shown.length ? "Showing " + shown.length + " of " + filtered.length : "";
}

function renderOnetData() {
  var metaEl = document.getElementById("onet-meta");
  var tableEl = document.getElementById("onet-table");
  tableEl.innerHTML = "";
  if (typeof ONET_JOB_COUNTS === "undefined" || !ONET_JOB_COUNTS || !ONET_JOB_COUNTS.rows) {
    metaEl.textContent = "No O*NET count data";
    return;
  }
  var info = ONET_JOB_COUNTS;
  metaEl.textContent =
    info.source + " | total: " + (info.total_postings_2023 || 0).toLocaleString() +
    " (2023) \u2192 " + (info.total_postings_2026 || 0).toLocaleString() + " (2026)";
  tableEl.innerHTML =
    "<div class='onet-header'><span>#</span><span>O*NET</span><span>Occupation</span>" +
    "<span class='num'>2023</span><span class='num'>2026</span><span class='num'>Change</span><span></span></div>";
  info.rows.forEach(function(row) {
    var el = document.createElement("div");
    el.className = "onet-row" + (row.in_dashboard ? " focus" : "");
    var chgCls = row.change > 0 ? "up" : (row.change < 0 ? "down" : "stable");
    el.innerHTML =
      "<span class='rank-num'>" + row.rank + "</span>" +
      "<span class='onet-code'>" + escapeHtml(row.onet) + "</span>" +
      "<span class='onet-name'>" + escapeHtml(row.name) +
      (row.in_dashboard ? "<span class='onet-flag'>in dashboard</span>" : "") + "</span>" +
      "<span class='num'>" + row.postings_2023.toLocaleString() + "</span>" +
      "<span class='num'>" + row.postings_2026.toLocaleString() + "</span>" +
      "<span class='num change " + chgCls + "'>" + (row.change > 0 ? "+" : "") + row.change.toLocaleString() + "</span>" +
      "<span></span>";
    tableEl.appendChild(el);
  });
}

function getCoverageFilter() {
  var checked = document.querySelector('input[name="coverage-filter"]:checked');
  return checked ? checked.value : "all";
}

function renderCoverage() {
  coverageOccControls.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentCoverageOcc);
  });
  coverageYearControls.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", parseInt(b.dataset.year, 10) === coverageYear);
  });
  var tableEl = document.getElementById("coverage-table");
  var nodesEl = document.getElementById("coverage-nodes");
  var statsEl = document.getElementById("coverage-stats");
  var metaEl = document.getElementById("coverage-meta");
  if (typeof TOP_SKILLS === "undefined" || !TOP_SKILLS || !TOP_SKILLS[currentCoverageOcc]) {
    metaEl.textContent = "No coverage data";
    statsEl.innerHTML = "";
    tableEl.innerHTML = "";
    nodesEl.innerHTML = "";
    return;
  }
  var info = TOP_SKILLS[currentCoverageOcc];
  var skills = getRankedList(info, coverageYear).slice(0, COVERAGE_TOP_N);
  var filter = getCoverageFilter();
  var mappedCount = 0;
  skills.forEach(function(it) { if (effNode(it[0], it[3])) mappedCount++; });
  metaEl.textContent =
    (info.name || currentCoverageOcc) + " | " + (info["total_jobs_" + coverageYear] || 0).toLocaleString() +
    " postings (" + coverageYear + ")";
  statsEl.innerHTML =
    "<div class='coverage-stat mapped'><div class='val'>" + mappedCount + "/" + skills.length + "</div><div class='lbl'>Mapped</div></div>" +
    "<div class='coverage-stat unmapped'><div class='val'>" + (skills.length - mappedCount) + "/" + skills.length + "</div><div class='lbl'>Unmapped</div></div>";
  tableEl.innerHTML =
    "<div class='coverage-header'><span>#</span><span>Skill</span><span class='num'>Jobs</span><span class='num'>%</span><span>Matrix node</span></div>";
  var nodeAgg = {};
  var displayIdx = 0;
  skills.forEach(function(it) {
    var skill = it[0];
    var node = effNode(it[0], it[3]);
    var isMapped = !!node;
    if (filter === "mapped" && !isMapped) return;
    if (filter === "unmapped" && isMapped) return;
    displayIdx++;
    var row = document.createElement("div");
    row.className = "coverage-row" + (isMapped ? "" : " unmapped");
    var nodeHtml = node ?
      "<span class='coverage-node'>" + escapeHtml(node) + "</span>" :
      "<span class='coverage-node none'>Not mapped</span>";
    if (node && DICT[node]) {
      if (!nodeAgg[node]) nodeAgg[node] = { count: 0, pctSum: 0 };
      nodeAgg[node].count++;
      nodeAgg[node].pctSum += it[2];
    }
    row.innerHTML =
      "<span class='rank-num'>" + displayIdx + "</span>" +
      "<span class='coverage-skill'>" + escapeHtml(skill) + "</span>" +
      "<span class='num'>" + it[1].toLocaleString() + "</span>" +
      "<span class='num'>" + it[2].toFixed(1) + "%</span>" + nodeHtml;
    tableEl.appendChild(row);
  });
  nodesEl.innerHTML = "";
  Object.keys(nodeAgg).map(function(n) {
    return { name: n, count: nodeAgg[n].count, pctSum: nodeAgg[n].pctSum };
  }).sort(function(a, b) { return b.count - a.count; }).forEach(function(n) {
    var row = document.createElement("div");
    row.className = "coverage-node-row";
    row.innerHTML =
      "<span class='coverage-node-name'>" + escapeHtml(n.name) + "</span>" +
      "<span class='coverage-node-count'>" + n.count + "</span>" +
      "<span class='coverage-node-pct'>" + n.pctSum.toFixed(1) + "%</span>";
    nodesEl.appendChild(row);
  });
}

const controls = document.getElementById("controls");
addOccButtons(controls, function(occ) { currentOcc = occ; render(); });

const rankControls = document.getElementById("rank-controls");
addOccButtons(rankControls, function(occ) {
  currentRankOcc = occ;
  renderRankBumpCharts();
  renderRankings();
});

let currentTitlesOcc = OCCS[0] || ALL_OCC;
const TITLES_DEFAULT_LIMIT = 200;
const TITLES_SEARCH_LIMIT = 500;
const TITLES_ALL_LIMIT = 3000;

const titlesControls = document.getElementById("titles-controls");
addOccButtons(titlesControls, function(occ) { currentTitlesOcc = occ; renderTitles(); }, OCCS);

const topskillsYearEl = document.getElementById("topskills-year");
[2023, 2026].forEach(function(yr) {
  var btn = document.createElement("button");
  btn.textContent = yr;
  btn.dataset.year = yr;
  btn.onclick = function() { topSkillsYear = yr; renderTopSkills(); };
  topskillsYearEl.appendChild(btn);
});

const bumpControls = document.getElementById("bump-controls");
currentBumpOcc = ALL_OCC;
addOccButtons(bumpControls, function(occ) {
  currentBumpOcc = occ;
  renderBumpChart();
  renderTopSkills();
});

let currentCoverageOcc = ALL_OCC;
let coverageYear = 2026;
const COVERAGE_TOP_N = 20;

const coverageOccControls = document.getElementById("coverage-occ-controls");
addOccButtons(coverageOccControls, function(occ) { currentCoverageOcc = occ; renderCoverage(); });

const coverageYearControls = document.getElementById("coverage-year-controls");
[2023, 2026].forEach(function(yr) {
  var btn = document.createElement("button");
  btn.textContent = yr;
  btn.dataset.year = yr;
  btn.onclick = function() { coverageYear = yr; renderCoverage(); };
  coverageYearControls.appendChild(btn);
});

document.querySelectorAll('input[name="coverage-filter"]').forEach(function(el) {
  el.addEventListener("change", renderCoverage);
});
document.getElementById("dict-search").addEventListener("input", renderDict);
document.getElementById("titles-search").addEventListener("input", renderTitles);
document.getElementById("titles-show-all").addEventListener("change", renderTitles);

/* ═══════════════════════════════════════════════════════════════
   AI Mechanisms tab — AI-exposure × demand-trend 2×2 matrix
   Splits "rising demand" into automation-driven expansion (Jevons)
   vs. human-premium (scarcity) effects, with a displacement and a
   non-AI placebo quadrant.
   ═══════════════════════════════════════════════════════════════ */

// NODE_AI_EXPOSURE is loaded from node_exposure.js (generated by
// llm_review/build_llm_review.py — mean of LLM-adjudicated member-skill
// scores per node; parents aggregate over children members).

const MECH_META = {
  transform: {
    title: "AI-transformed",
    subtitle: "Rising \u00b7 High exposure",
    mechanism: "Mechanism 1 \u2014 automation-driven expansion (Jevons paradox)",
    prescription: "Teach with AI: the competency becomes \u201cproduce X using AI tools.\u201d",
    color: "#f59e0b"
  },
  premium: {
    title: "Human premium",
    subtitle: "Rising \u00b7 Low exposure",
    mechanism: "Mechanism 2 \u2014 scarcity-driven premium (human bottleneck)",
    prescription: "Teach as inherently human practice: judgment, trust, relational capital.",
    color: "#4ade80"
  },
  displace: {
    title: "Displacement",
    subtitle: "Falling \u00b7 High exposure",
    mechanism: "Genuine substitution \u2014 AI displaces the task",
    prescription: "De-emphasize as a standalone skill; fold into AI-supervised workflows.",
    color: "#f87171"
  },
  shift: {
    title: "Non-AI shift",
    subtitle: "Falling \u00b7 Low exposure",
    mechanism: "Placebo \u2014 demand shift not primarily an AI story",
    prescription: "Interpret with caution: not every change is driven by AI.",
    color: "#64748b"
  }
};

const MECH_ORDER = ["transform", "premium", "displace", "shift"];


let currentMechOcc = ALL_OCC;
let currentMechLevel = "skills"; // "skills" | "esco" | "pillar" | "domain"
let mechExposureThreshold = 0.5;
let mechShowLabels = true;
/** Card list sort: "p26" | "abs_change" | "change" | "exposure" | "name" */
let mechCardSort = "p26";
/** Y-axis / card trend metric: "pp" (Δpp) or "fold" (2026÷2023 relative). */
let mechYMetric = "pp";

function mechEntryFold(e) {
  if (e.fold != null) return e.fold;
  return escoFold(e.p23, e.p26);
}

function mechYValue(e) {
  return mechYMetric === "fold" ? mechEntryFold(e) : e.change;
}

function fmtMechY(e) {
  return mechYMetric === "fold" ? fmtFold(mechEntryFold(e)) : fmtChg(e.change);
}

function sortMechCardList(list, quadrant) {
  return list.slice().sort(function(a, b) {
    if (mechCardSort === "name") {
      return String(a.node).localeCompare(String(b.node));
    }
    if (mechCardSort === "exposure") {
      return b.exposure - a.exposure || b.p26 - a.p26;
    }
    if (mechCardSort === "abs_change") {
      if (mechYMetric === "fold") {
        return Math.abs(Math.log2(mechEntryFold(b))) - Math.abs(Math.log2(mechEntryFold(a))) || b.p26 - a.p26;
      }
      return Math.abs(b.change) - Math.abs(a.change) || b.p26 - a.p26;
    }
    if (mechCardSort === "change") {
      if (mechYMetric === "fold") {
        if (quadrant === "displace" || quadrant === "shift") {
          return mechEntryFold(a) - mechEntryFold(b) || b.p26 - a.p26;
        }
        return mechEntryFold(b) - mechEntryFold(a) || b.p26 - a.p26;
      }
      if (quadrant === "displace" || quadrant === "shift") {
        return a.change - b.change || b.p26 - a.p26;
      }
      return b.change - a.change || b.p26 - a.p26;
    }
    if (mechYMetric === "fold") {
      return b.p26 - a.p26 || Math.abs(Math.log2(mechEntryFold(b))) - Math.abs(Math.log2(mechEntryFold(a)));
    }
    return b.p26 - a.p26 || Math.abs(b.change) - Math.abs(a.change);
  });
}

function mechQuadrant(exposure, change, thr) {
  var rising = change >= 0;
  var high = exposure >= thr;
  if (rising && high) return "transform";
  if (rising && !high) return "premium";
  if (!rising && high) return "displace";
  return "shift";
}

function nodeMechanism(node, change) {
  var exp = NODE_AI_EXPOSURE[node];
  if (exp == null) return null;
  return mechQuadrant(exp, change, mechExposureThreshold);
}

function skillExposure(skill) {
  if (typeof SKILL_AI_EXPOSURE === "undefined" || !SKILL_AI_EXPOSURE) return null;
  var v = SKILL_AI_EXPOSURE[skill];
  return v != null ? v : null;
}

function mechTagHtml(node, change) {
  var q = nodeMechanism(node, change);
  if (!q) return "";
  var meta = MECH_META[q];
  return "<span class='mech-tag' style='color:" + meta.color + ";border-color:" + meta.color + "44' " +
    "title='" + escapeHtml(meta.title + " \u2014 " + meta.subtitle + " (AI-exposure " + NODE_AI_EXPOSURE[node].toFixed(2) + ")") + "'>" +
    "<span class='mech-tag-dot' style='background:" + meta.color + "'></span>" + meta.title + "</span>";
}

function mechLegendHtml() {
  var items = MECH_ORDER.map(function(q) {
    var meta = MECH_META[q];
    return "<span><span class='mech-tag-dot' style='background:" + meta.color + "'></span>" + meta.title +
      " <span class='mech-legend-sub'>(" + meta.subtitle + ")</span></span>";
  }).join("");
  return "<div class='mech-legend'>" + items +
    "<span class='mech-legend-note'>AI-exposure threshold " + mechExposureThreshold.toFixed(2) +
    " \u2014 tune it in the AI Mechanisms tab</span></div>";
}

function fmtChg(c) {
  return (c > 0 ? "+" : "") + c.toFixed(1) + "pp";
}

/** Mechanisms plane: Lightcast skills, Matrix leaves/parents, or ESCO aggregates. */
function getMechEntries(occ) {
  if (currentMechLevel === "matrix_leaf") return getMatrixMechEntries(occ);
  if (currentMechLevel === "matrix_parent") return getMatrixParentMechEntries(occ);

  var rows;
  if (currentMechLevel === "domain") rows = getEscoDomainDeltaRows(occ);
  else if (currentMechLevel === "pillar") rows = getEscoPillarDeltaRows(occ);
  else if (currentMechLevel === "esco") rows = getEscoDeltaRows(occ);
  else rows = getSkillDeltaRows(occ);

  return rows.filter(function(r) {
    return r.exposure != null;
  }).map(function(r) {
    var name = r.skill;
    var mNode = currentMechLevel === "skills" ? effNode(name, r.node || null) : null;
    return {
      node: name,
      skill: name,
      matrixNode: mNode,
      category: currentMechLevel === "skills" ? (mNode ? "mapped" : "unmapped") : currentMechLevel,
      type: currentMechLevel,
      p23: r.pct_2023,
      p26: r.pct_2026,
      change: r.delta_pp,
      fold: escoFold(r.pct_2023, r.pct_2026),
      exposure: r.exposure
    };
  });
}

function mechLevelLabel() {
  if (currentMechLevel === "matrix_leaf") {
    return eitherYearFloorPct ? "Matrix leaves (\u2265" + eitherYearFloorPct + "% either year)" : "Matrix leaves";
  }
  if (currentMechLevel === "matrix_parent") {
    return eitherYearFloorPct ? "Matrix parents (\u2265" + eitherYearFloorPct + "% either year)" : "Matrix parents";
  }
  if (currentMechLevel === "domain") {
    return eitherYearFloorPct ? "ESCO domains (\u2265" + eitherYearFloorPct + "% either year)" : "ESCO domains";
  }
  if (currentMechLevel === "pillar") {
    return eitherYearFloorPct ? "ESCO pillars (\u2265" + eitherYearFloorPct + "% either year)" : "ESCO pillars";
  }
  if (currentMechLevel === "esco") {
    return eitherYearFloorPct ? "ESCO groups (\u2265" + eitherYearFloorPct + "% either year)" : "ESCO groups";
  }
  if (eitherYearFloorPct) return "Lightcast skills (\u2265" + eitherYearFloorPct + "% either year)";
  return "Lightcast skills (no 5% floor)";
}

/** AI Skill Matrix leaf nodes — Mechanisms matrix levels. */
function getMatrixMechEntries(occ) {
  var out = [];
  ["hard", "soft"].forEach(function(t) {
    getRankingEntries(occ, t).forEach(function(e) {
      var exp = NODE_AI_EXPOSURE[e.node];
      if (exp == null) return;
      out.push({
        node: e.node, category: e.category, type: t,
        p23: e.p23, p26: e.p26, change: e.change,
        fold: escoFold(e.p23, e.p26), exposure: exp
      });
    });
  });
  return filterByPenetration(filterByEitherYear(out));
}

/** AI Skill Matrix parent nodes (union-of-children penetration in DATA). */
function getMatrixParentMechEntries(occ) {
  var occs = occList(occ);
  var counts = getJobCounts(occ);
  var nodes = {};
  DATA.filter(function(d) { return occs.indexOf(d.occupation) !== -1; }).forEach(function(d) {
    if (!PARENT_NODES.has(d.node)) return;
    if (!nodes[d.node]) nodes[d.node] = { category: d.category, type: d.type, n23: 0, n26: 0 };
    var n = getNodeNjobs(d);
    if (d.year === 2023) nodes[d.node].n23 += n;
    if (d.year === 2026) nodes[d.node].n26 += n;
  });
  var out = Object.keys(nodes).map(function(node) {
    var info = nodes[node];
    var exp = NODE_AI_EXPOSURE[node];
    if (exp == null) return null;
    var p23 = counts.jobs23 ? info.n23 / counts.jobs23 * 100 : 0;
    var p26 = counts.jobs26 ? info.n26 / counts.jobs26 * 100 : 0;
    return {
      node: node,
      category: info.category,
      type: info.type,
      p23: p23,
      p26: p26,
      change: p26 - p23,
      fold: escoFold(p23, p26),
      exposure: exp
    };
  }).filter(Boolean);
  return filterByPenetration(filterByEitherYear(out));
}

function renderMechScatter(entries) {
  var wrap = document.getElementById("mech-scatter");
  var W = 920, H = 540, m = { l: 66, r: 24, t: 34, b: 58 };
  var pw = W - m.l - m.r, ph = H - m.t - m.b, thr = mechExposureThreshold;
  var useFold = mechYMetric === "fold";

  function X(exp) { return m.l + exp * pw; }
  var Y, yZero, yTicks, yAxisLabel;
  if (useFold) {
    var fMin = 8, fMax = 0.125;
    entries.forEach(function(e) {
      var f = mechEntryFold(e);
      fMin = Math.min(fMin, f);
      fMax = Math.max(fMax, f);
    });
    var logLo = Math.log2(Math.max(0.15, fMin * 0.85));
    var logHi = Math.log2(Math.min(8, fMax * 1.15));
    if (logHi - logLo < 1.2) { logLo -= 0.6; logHi += 0.6; }
    logLo = Math.min(logLo, -0.15);
    logHi = Math.max(logHi, 0.15);
    Y = function(fold) {
      var lg = Math.log2(Math.max(0.125, Math.min(8, fold)));
      return m.t + (logHi - lg) / (logHi - logLo) * ph;
    };
    yZero = Y(1);
    yTicks = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8].filter(function(f) {
      var lg = Math.log2(f);
      return lg >= logLo - 0.01 && lg <= logHi + 0.01;
    });
    yAxisLabel = "2026 compared to 2023 (fold \u00d7)";
  } else {
    var maxAbs = 0.0001;
    entries.forEach(function(e) { maxAbs = Math.max(maxAbs, Math.abs(e.change)); });
    var dMax = maxAbs * 1.12, dMin = -maxAbs * 1.12;
    Y = function(c) { return m.t + (dMax - c) / (dMax - dMin) * ph; };
    yZero = Y(0);
    yTicks = [dMax, dMax / 2, 0, dMin / 2, dMin];
    yAxisLabel = "Change in penetration 2023\u21922026 (pp)";
  }

  var maxP = 1;
  entries.forEach(function(e) { maxP = Math.max(maxP, e.p26); });
  function R(p) { return 4 + Math.sqrt(p / maxP) * 13; }
  var xThr = X(thr);
  var s = "";
  s += "<rect x='" + m.l + "' y='" + m.t + "' width='" + (xThr - m.l) + "' height='" + (yZero - m.t) + "' fill='#4ade80' opacity='0.05'/>";
  s += "<rect x='" + xThr + "' y='" + m.t + "' width='" + (m.l + pw - xThr) + "' height='" + (yZero - m.t) + "' fill='#f59e0b' opacity='0.06'/>";
  s += "<rect x='" + m.l + "' y='" + yZero + "' width='" + (xThr - m.l) + "' height='" + (m.t + ph - yZero) + "' fill='#64748b' opacity='0.05'/>";
  s += "<rect x='" + xThr + "' y='" + yZero + "' width='" + (m.l + pw - xThr) + "' height='" + (m.t + ph - yZero) + "' fill='#f87171' opacity='0.06'/>";
  s += "<text class='mech-quad-label' x='" + (m.l + 8) + "' y='" + (m.t + 16) + "' fill='#4ade80'>Human premium</text>";
  s += "<text class='mech-quad-label' x='" + (m.l + pw - 8) + "' y='" + (m.t + 16) + "' fill='#f59e0b' text-anchor='end'>AI-transformed</text>";
  s += "<text class='mech-quad-label' x='" + (m.l + 8) + "' y='" + (m.t + ph - 8) + "' fill='#64748b'>Non-AI shift</text>";
  s += "<text class='mech-quad-label' x='" + (m.l + pw - 8) + "' y='" + (m.t + ph - 8) + "' fill='#f87171' text-anchor='end'>Displacement</text>";
  s += "<line class='mech-axis' x1='" + m.l + "' y1='" + yZero + "' x2='" + (m.l + pw) + "' y2='" + yZero + "'/>";
  s += "<line class='mech-thr-line' x1='" + xThr + "' y1='" + m.t + "' x2='" + xThr + "' y2='" + (m.t + ph) + "'/>";
  s += "<line class='mech-axis' x1='" + m.l + "' y1='" + m.t + "' x2='" + m.l + "' y2='" + (m.t + ph) + "'/>";
  [0, 0.25, 0.5, 0.75, 1].forEach(function(t) {
    s += "<text class='mech-axis-label' x='" + X(t) + "' y='" + (m.t + ph + 18) + "' text-anchor='middle'>" + t.toFixed(2) + "</text>";
  });
  yTicks.forEach(function(v) {
    if (useFold) {
      var lab = v === 1 ? "1\u00d7" : (v + "\u00d7");
      s += "<text class='mech-axis-label' x='" + (m.l - 8) + "' y='" + (Y(v) + 3) + "' text-anchor='end'>" + lab + "</text>";
    } else {
      s += "<text class='mech-axis-label' x='" + (m.l - 8) + "' y='" + (Y(v) + 3) + "' text-anchor='end'>" + (v > 0 ? "+" : "") + v.toFixed(1) + "</text>";
    }
  });
  s += "<text class='mech-axis-label' x='" + (m.l + pw / 2) + "' y='" + (H - 6) + "' text-anchor='middle' style='font-size:12px'>AI exposure (automatability) \u2192</text>";
  s += "<text class='mech-axis-label' transform='translate(16," + (m.t + ph / 2) + ") rotate(-90)' text-anchor='middle' style='font-size:12px'>" + yAxisLabel + "</text>";
  entries.forEach(function(e, i) {
    var color = MECH_META[mechQuadrant(e.exposure, e.change, thr)].color;
    var cy = Y(mechYValue(e));
    s += "<circle class='mech-dot' data-i='" + i + "' cx='" + X(e.exposure) + "' cy='" + cy + "' r='" + R(e.p26) + "' fill='" + color + "' opacity='0.72' stroke='" + color + "' stroke-width='1'/>";
  });
  if (mechShowLabels) {
    var labeled = entries.slice().sort(function(a, b) {
      if (useFold) return Math.abs(Math.log2(mechEntryFold(b))) - Math.abs(Math.log2(mechEntryFold(a)));
      return Math.abs(b.change) - Math.abs(a.change);
    }).slice(0, 18);
    labeled.forEach(function(e) {
      var cx = X(e.exposure), cy = Y(mechYValue(e)), r = R(e.p26);
      var name = e.node.length > 26 ? e.node.slice(0, 25) + "\u2026" : e.node;
      var anchor, tx;
      if ((m.l + pw) - cx < 135) { anchor = "end"; tx = cx - r - 4; }
      else { anchor = "start"; tx = cx + r + 4; }
      s += "<text class='mech-point-label' x='" + tx + "' y='" + (cy + 3) + "' text-anchor='" + anchor + "'>" + escapeHtml(name) + "</text>";
    });
  }
  wrap.innerHTML = "<svg viewBox='0 0 " + W + " " + H + "' width='100%' style='max-width:" + W + "px;display:block' preserveAspectRatio='xMinYMin meet'>" + s + "</svg>";
  var tip = document.getElementById("mech-tooltip");
  wrap.querySelectorAll(".mech-dot").forEach(function(el) {
    var e = entries[parseInt(el.dataset.i, 10)];
    el.addEventListener("mousemove", function(ev) {
      tip.style.display = "block";
      tip.style.left = (ev.clientX + 14) + "px";
      tip.style.top = (ev.clientY + 14) + "px";
      tip.innerHTML =
        "<div class='tt-node'>" + escapeHtml(e.node) + "</div>" +
        "<div class='tt-row'><span>Mechanism</span><span>" + MECH_META[mechQuadrant(e.exposure, e.change, thr)].title + "</span></div>" +
        "<div class='tt-row'><span>AI exposure</span><span>" + e.exposure.toFixed(2) + "</span></div>" +
        "<div class='tt-row'><span>2023 \u2192 2026</span><span>" + e.p23.toFixed(1) + "% \u2192 " + e.p26.toFixed(1) + "%</span></div>" +
        "<div class='tt-row'><span>" + (useFold ? "Relative" : "Change") + "</span><span>" + fmtMechY(e) + (useFold ? " (" + fmtChg(e.change) + ")" : "") + "</span></div>";
    });
    el.addEventListener("mouseleave", function() { tip.style.display = "none"; });
  });
}

function renderMechCards(entries) {
  var cardsEl = document.getElementById("mech-cards");
  cardsEl.innerHTML = "";
  var thr = mechExposureThreshold;
  var groups = { transform: [], premium: [], displace: [], shift: [] };
  entries.forEach(function(e) { groups[mechQuadrant(e.exposure, e.change, thr)].push(e); });
  MECH_ORDER.forEach(function(q) {
    var meta = MECH_META[q];
    var list = sortMechCardList(groups[q], q);
    var rows = list.length ? list.map(function(e) {
      var cls = e.change >= 0 ? "up" : "down";
      return "<div class='mech-node-row'>" +
        "<span class='mech-node-name' title='" + escapeHtml(e.node) + "'>" + escapeHtml(e.node) + "</span>" +
        "<span class='mech-node-exp'>" + e.exposure.toFixed(2) + "</span>" +
        "<span class='mech-node-chg " + cls + "'>" + fmtMechY(e) + "</span></div>";
    }).join("") : "<div class='mech-card-empty'>No nodes in this quadrant.</div>";
    var card = document.createElement("div");
    card.className = "mech-card";
    card.innerHTML =
      "<div class='mech-card-head'>" +
        "<div class='mech-card-title'><span class='mech-card-swatch' style='background:" + meta.color + "'></span>" +
          meta.title + " <span style='color:#666;font-weight:400;font-size:0.75rem'>(" + list.length + ")</span></div>" +
        "<div class='mech-card-sub'>" + meta.subtitle + "</div>" +
        "<div class='mech-card-mech'>" + meta.mechanism + "</div>" +
        "<div class='mech-card-presc'>" + meta.prescription + "</div>" +
      "</div>" +
      "<div class='mech-card-list'>" + rows + "</div>";
    cardsEl.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════════════
   ESCO tab — domains (default) / pillars / groups × AI exposure.
   Y-axis = 2026 compared to 2023 (fold ×), log scale for readability.
   ═══════════════════════════════════════════════════════════════ */

function hasEscoData() {
  return typeof ESCO_GROUP_DATA !== "undefined" && ESCO_GROUP_DATA && ESCO_GROUP_DATA.groups;
}

function escoFold(p23, p26) {
  // 2026 compared to 2023; capped for plot stability
  if (p23 <= 0 && p26 <= 0) return 1;
  if (p23 <= 0) return 8;
  if (p26 <= 0) return 0.125;
  return Math.max(0.125, Math.min(8, p26 / p23));
}

function fmtFold(f) {
  if (f >= 10) return f.toFixed(1) + "\u00d7";
  if (f >= 1) return f.toFixed(2) + "\u00d7";
  return f.toFixed(2) + "\u00d7";
}

/* ── Skill Deltas tab ─────────────────────────────────────────── */
let currentDeltaOcc = "All";
let currentDeltaLevel = "skills"; // "skills" | "esco" | "pillar" | "domain"
let currentDeltaMetric = "pp";    // "pp" | "rank"
const DELTA_TOP_N = 40;

function hasEscoPillarData() {
  return typeof ESCO_PILLAR_DATA !== "undefined" && ESCO_PILLAR_DATA && ESCO_PILLAR_DATA.pillars;
}

function hasEscoDomainData() {
  return typeof ESCO_DOMAIN_DATA !== "undefined" && ESCO_DOMAIN_DATA && ESCO_DOMAIN_DATA.domains;
}

function getEscoDeltaRows(occ) {
  if (!hasEscoData()) return [];
  return filterByPenetration(filterByEitherYear(ESCO_GROUP_DATA.groups.map(function(g) {
    var o = g.occ[occ] || { p23: 0, p26: 0 };
    return {
      skill: g.group,
      node: g.n_skills + " ESCO skills",
      pct_2023: o.p23,
      pct_2026: o.p26,
      delta_pp: +(o.p26 - o.p23).toFixed(2),
      exposure: g.exposure
    };
  })));
}

function getEscoPillarDeltaRows(occ) {
  if (!hasEscoPillarData()) return [];
  return filterByPenetration(filterByEitherYear(ESCO_PILLAR_DATA.pillars.map(function(p) {
    var o = p.occ[occ] || { p23: 0, p26: 0 };
    var nGroups = p.n_groups != null ? p.n_groups : 0;
    return {
      skill: p.pillar,
      node: p.n_skills + " skills \u00b7 " + nGroups + " groups",
      pct_2023: o.p23,
      pct_2026: o.p26,
      delta_pp: +(o.p26 - o.p23).toFixed(2),
      exposure: p.exposure
    };
  })));
}

function getEscoDomainDeltaRows(occ) {
  if (!hasEscoDomainData()) return [];
  return filterByPenetration(filterByEitherYear(ESCO_DOMAIN_DATA.domains.map(function(d) {
    var o = d.occ[occ] || { p23: 0, p26: 0 };
    var nPillars = d.n_pillars != null ? d.n_pillars : 0;
    return {
      skill: d.domain,
      node: d.n_skills + " skills \u00b7 " + nPillars + " pillars",
      pct_2023: o.p23,
      pct_2026: o.p26,
      delta_pp: +(o.p26 - o.p23).toFixed(2),
      exposure: d.exposure
    };
  })));
}

function getSkillDeltaRows(occ) {
  if (typeof SKILL_DELTA_DATA === "undefined" || !SKILL_DELTA_DATA || !SKILL_DELTA_DATA.occupations) return [];
  var info = SKILL_DELTA_DATA.occupations[occ];
  if (!info) return [];
  var base = (info.all && info.all.length) ? info.all.slice() : [];
  if (!base.length) {
    var seen = {};
    (info.top_by_abs || []).concat(info.risers || []).concat(info.fallers || []).forEach(function(r) {
      if (seen[r.skill]) return;
      seen[r.skill] = 1;
      base.push(r);
    });
  }
  return filterByPenetration(filterByEitherYear(base.map(function(r) {
    var exp = (typeof SKILL_AI_EXPOSURE !== "undefined" && SKILL_AI_EXPOSURE) ? SKILL_AI_EXPOSURE[r.skill] : null;
    return Object.assign({}, r, { exposure: exp != null ? exp : null });
  })));
}

function annotateMechanism(rows) {
  return rows.map(function(r) {
    var mech = (r.exposure != null) ? mechQuadrant(r.exposure, r.delta_pp, mechExposureThreshold) : null;
    return Object.assign({}, r, { mechanism: mech });
  });
}

function annotateRanks(rows) {
  var by23 = rows.slice().sort(function(a, b) { return b.pct_2023 - a.pct_2023 || b.pct_2026 - a.pct_2026; });
  var by26 = rows.slice().sort(function(a, b) { return b.pct_2026 - a.pct_2026 || b.pct_2023 - a.pct_2023; });
  var r23 = {}, r26 = {};
  by23.forEach(function(r, i) { r23[r.skill] = i + 1; });
  by26.forEach(function(r, i) { r26[r.skill] = i + 1; });
  return rows.map(function(r) {
    var rank23 = r23[r.skill];
    var rank26 = r26[r.skill];
    // positive delta_rank = rose in ranking (lower rank number in 2026)
    var deltaRank = rank23 - rank26;
    return Object.assign({}, r, {
      rank_2023: rank23,
      rank_2026: rank26,
      delta_rank: deltaRank
    });
  });
}

function makeDeltaColumn(title, titleCls, rows, maxAbs, nameHeader, metric) {
  var col = document.createElement("div");
  var rankMode = metric === "rank";
  var hdrCls = "delta-header" + (rankMode ? " rankmode" : "");
  var rowCls = "delta-row" + (rankMode ? " rankmode" : "");
  var html = "<div class='delta-col-title " + titleCls + "'>" + escapeHtml(title) + " (" + rows.length + ")</div>";
  if (rankMode) {
    html += "<div class='" + hdrCls + "'><span>#</span><span>" + escapeHtml(nameHeader || "Skill") +
      "</span><span class='num'>R23</span><span class='num'>R26</span><span class='num'>\u0394rank</span>" +
      "<span class='num'>2023</span><span class='num'>2026</span><span></span></div>";
  } else {
    html += "<div class='" + hdrCls + "'><span>#</span><span>" + escapeHtml(nameHeader || "Skill") +
      "</span><span class='num'>2023</span><span class='num'>2026</span><span class='num'>\u0394pp</span><span></span></div>";
  }
  rows.forEach(function(r, i) {
    var up = rankMode ? r.delta_rank > 0 : r.delta_pp >= 0;
    var mag = rankMode ? Math.abs(r.delta_rank) : Math.abs(r.delta_pp);
    var w = maxAbs ? Math.min(100, mag / maxAbs * 100) : 0;
    var sub = r.node || (r.exposure != null ? ("AI-exp " + r.exposure.toFixed(2)) : "");
    if (rankMode) {
      var dTxt = r.delta_rank > 0 ? ("+" + r.delta_rank) : String(r.delta_rank);
      var dCls = r.delta_rank > 0 ? "up" : (r.delta_rank < 0 ? "down" : "stable");
      html += "<div class='" + rowCls + "'>" +
        "<span class='rank-num'>" + (i + 1) + "</span>" +
        "<span class='delta-name' title='" + escapeHtml(r.skill) + "'>" + escapeHtml(r.skill) +
          (sub ? "<span class='delta-node'>" + escapeHtml(sub) + "</span>" : "") + "</span>" +
        "<span class='num'>" + r.rank_2023 + "</span>" +
        "<span class='num'>" + r.rank_2026 + "</span>" +
        "<span class='num change " + dCls + "'>" + dTxt + "</span>" +
        "<span class='num'>" + r.pct_2023.toFixed(1) + "</span>" +
        "<span class='num'>" + r.pct_2026.toFixed(1) + "</span>" +
        "<div class='delta-bar-wrap'><div class='delta-bar " + (up ? "up" : "down") + "' style='width:" + w + "%'></div></div>" +
        "</div>";
    } else {
      html += "<div class='" + rowCls + "'>" +
        "<span class='rank-num'>" + (i + 1) + "</span>" +
        "<span class='delta-name' title='" + escapeHtml(r.skill) + "'>" + escapeHtml(r.skill) +
          (sub ? "<span class='delta-node'>" + escapeHtml(sub) + "</span>" : "") + "</span>" +
        "<span class='num'>" + r.pct_2023.toFixed(1) + "</span>" +
        "<span class='num'>" + r.pct_2026.toFixed(1) + "</span>" +
        "<span class='num change " + (up ? "up" : "down") + "'>" + (up ? "+" : "") + r.delta_pp.toFixed(1) + "</span>" +
        "<div class='delta-bar-wrap'><div class='delta-bar " + (up ? "up" : "down") + "' style='width:" + w + "%'></div></div>" +
        "</div>";
    }
  });
  col.innerHTML = html;
  return col;
}

function renderSkillDeltas() {
  var controlsEl = document.getElementById("delta-controls");
  controlsEl.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentDeltaOcc);
  });
  var levelEl = document.getElementById("delta-level");
  if (levelEl) {
    levelEl.querySelectorAll("button").forEach(function(b) {
      b.classList.toggle("active", b.dataset.level === currentDeltaLevel);
    });
  }
  var metricEl = document.getElementById("delta-metric");
  if (metricEl) {
    metricEl.querySelectorAll("button").forEach(function(b) {
      b.classList.toggle("active", b.dataset.metric === currentDeltaMetric);
    });
  }
  var metaEl = document.getElementById("delta-meta");
  var colsEl = document.getElementById("delta-cols");
  var rows = [];
  var nameHeader = "Skill";
  var nJobsMeta = "";

  if (currentDeltaLevel === "domain") {
    nameHeader = "ESCO domain";
    if (!hasEscoDomainData()) {
      metaEl.textContent = "ESCO domain data not loaded.";
      colsEl.innerHTML = "";
      return;
    }
    rows = getEscoDomainDeltaRows(currentDeltaOcc);
    var tjd = (ESCO_DOMAIN_DATA.total_jobs || {})[currentDeltaOcc] || {};
    nJobsMeta = "2023: " + (tjd["2023"] || 0).toLocaleString() + " jobs | 2026: " + (tjd["2026"] || 0).toLocaleString() + " jobs";
    metaEl.textContent = currentDeltaOcc + " \u00b7 ESCO domains \u2014 " + rows.length + " domains | " + nJobsMeta;
  } else if (currentDeltaLevel === "pillar") {
    nameHeader = "ESCO pillar";
    if (!hasEscoPillarData()) {
      metaEl.textContent = "ESCO pillar data not loaded.";
      colsEl.innerHTML = "";
      return;
    }
    rows = getEscoPillarDeltaRows(currentDeltaOcc);
    var tjp = (ESCO_PILLAR_DATA.total_jobs || {})[currentDeltaOcc] || {};
    nJobsMeta = "2023: " + (tjp["2023"] || 0).toLocaleString() + " jobs | 2026: " + (tjp["2026"] || 0).toLocaleString() + " jobs";
    metaEl.textContent = currentDeltaOcc + " \u00b7 ESCO pillars \u2014 " + rows.length + " pillars | " + nJobsMeta;
  } else if (currentDeltaLevel === "esco") {
    nameHeader = "ESCO group";
    if (!hasEscoData()) {
      metaEl.textContent = "ESCO group data not loaded.";
      colsEl.innerHTML = "";
      return;
    }
    rows = getEscoDeltaRows(currentDeltaOcc);
    var tj = (ESCO_GROUP_DATA.total_jobs || {})[currentDeltaOcc] || {};
    nJobsMeta = "2023: " + (tj["2023"] || 0).toLocaleString() + " jobs | 2026: " + (tj["2026"] || 0).toLocaleString() + " jobs";
    metaEl.textContent = currentDeltaOcc + " \u00b7 ESCO groups \u2014 " + rows.length + " groups | " + nJobsMeta;
  } else {
    if (typeof SKILL_DELTA_DATA === "undefined" || !SKILL_DELTA_DATA || !SKILL_DELTA_DATA.occupations) {
      metaEl.textContent = "Skill delta data not loaded.";
      colsEl.innerHTML = "";
      return;
    }
    var info = SKILL_DELTA_DATA.occupations[currentDeltaOcc];
    if (!info) { metaEl.textContent = "No data for " + currentDeltaOcc; colsEl.innerHTML = ""; return; }
    rows = getSkillDeltaRows(currentDeltaOcc);
    nJobsMeta = "2023: " + info.n_2023.toLocaleString() + " jobs | 2026: " + info.n_2026.toLocaleString() + " jobs";
    metaEl.textContent =
      currentDeltaOcc + " \u00b7 Lightcast skills \u2014 " + info.n_skills_kept +
      " skills with \u22655% in either year (showing " + rows.length + " after filters) | " + nJobsMeta;
  }
  metaEl.textContent += penetrationFilterNote();

  rows = annotateRanks(rows);
  var risers, fallers, maxAbs = 0.0001, riseTitle, fallTitle;

  if (currentDeltaMetric === "rank") {
    riseTitle = "Biggest rank gains vs 2023";
    fallTitle = "Biggest rank drops vs 2023";
    risers = rows.filter(function(r) { return r.delta_rank > 0; })
      .sort(function(a, b) { return b.delta_rank - a.delta_rank || b.pct_2026 - a.pct_2026; })
      .slice(0, DELTA_TOP_N);
    fallers = rows.filter(function(r) { return r.delta_rank < 0; })
      .sort(function(a, b) { return a.delta_rank - b.delta_rank || a.pct_2026 - b.pct_2026; })
      .slice(0, DELTA_TOP_N);
    risers.concat(fallers).forEach(function(r) { maxAbs = Math.max(maxAbs, Math.abs(r.delta_rank)); });
    metaEl.textContent += " | sorted by \u0394rank (R23\u2212R26; + = rose)";
  } else {
    riseTitle = "Largest increases (\u0394pp)";
    fallTitle = "Largest decreases (\u0394pp)";
    risers = rows.filter(function(r) { return r.delta_pp > 0; })
      .sort(function(a, b) { return b.delta_pp - a.delta_pp; })
      .slice(0, DELTA_TOP_N);
    fallers = rows.filter(function(r) { return r.delta_pp < 0; })
      .sort(function(a, b) { return a.delta_pp - b.delta_pp; })
      .slice(0, DELTA_TOP_N);
    risers.concat(fallers).forEach(function(r) { maxAbs = Math.max(maxAbs, Math.abs(r.delta_pp)); });
    metaEl.textContent += " | sorted by \u0394pp";
  }

  colsEl.innerHTML = "";
  colsEl.appendChild(makeDeltaColumn(riseTitle, "up", risers, maxAbs, nameHeader, currentDeltaMetric));
  colsEl.appendChild(makeDeltaColumn(fallTitle, "down", fallers, maxAbs, nameHeader, currentDeltaMetric));
}

function renderMechanisms() {
  var controlsEl = document.getElementById("mech-controls");
  controlsEl.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentMechOcc);
  });
  var levelEl = document.getElementById("mech-level");
  if (levelEl) {
    levelEl.querySelectorAll("button").forEach(function(b) {
      b.classList.toggle("active", b.dataset.level === currentMechLevel);
    });
  }
  var floorWrap = document.getElementById("mech-skill-floor-wrap");
  if (floorWrap) floorWrap.style.display = "";
  var jobs = getJobCounts(currentMechOcc);
  var entries = getMechEntries(currentMechOcc);
  var unit = currentMechLevel === "skills" ? "skills"
    : (currentMechLevel === "matrix_leaf" ? "leaves"
      : (currentMechLevel === "matrix_parent" ? "parents"
        : (currentMechLevel === "esco" ? "groups"
          : (currentMechLevel === "pillar" ? "pillars" : "domains"))));
  document.getElementById("mech-job-counts").textContent =
    currentMechOcc + " \u2014 " + mechLevelLabel() + " \u2014 " + entries.length + " " + unit +
    " | 2023: " + jobs.jobs23.toLocaleString() + " | 2026: " + jobs.jobs26.toLocaleString() + " jobs" +
    penetrationFilterNote();
  document.getElementById("mech-thr-val").textContent = mechExposureThreshold.toFixed(2);
  renderMechScatter(entries);
  renderMechCards(entries);
}

const mechControls = document.getElementById("mech-controls");
addOccButtons(mechControls, function(occ) { currentMechOcc = occ; renderMechanisms(); });
const mechLevelEl = document.getElementById("mech-level");
if (mechLevelEl) {
  mechLevelEl.querySelectorAll("button[data-level]").forEach(function(btn) {
    btn.onclick = function() {
      currentMechLevel = btn.dataset.level;
      renderMechanisms();
    };
  });
}
document.getElementById("mech-thr").addEventListener("input", function() {
  mechExposureThreshold = parseFloat(this.value);
  document.getElementById("mech-thr-val").textContent = mechExposureThreshold.toFixed(2);
  renderMechanisms();
  if (typeof renderMatrixCheck === "function") renderMatrixCheck();
  renderRankings();
});
document.getElementById("mech-labels").addEventListener("change", function() {
  mechShowLabels = this.checked;
  renderMechanisms();
});
const mechCardSortEl = document.getElementById("mech-card-sort");
if (mechCardSortEl) {
  mechCardSortEl.value = mechCardSort;
  mechCardSortEl.addEventListener("change", function() {
    mechCardSort = this.value || "p26";
    renderMechanisms();
  });
}
const mechYMetricEl = document.getElementById("mech-y-metric");
if (mechYMetricEl) {
  mechYMetricEl.value = mechYMetric;
  mechYMetricEl.addEventListener("change", function() {
    mechYMetric = this.value === "fold" ? "fold" : "pp";
    renderMechanisms();
  });
}
const mechSkillFloorEl = document.getElementById("mech-skill-floor");
if (mechSkillFloorEl) {
  mechSkillFloorEl.checked = eitherYearFloorPct >= EITHER_YEAR_CUT;
  mechSkillFloorEl.addEventListener("change", function() {
    eitherYearFloorPct = this.checked ? EITHER_YEAR_CUT : 0;
    renderMechanisms();
    if (typeof renderSkillDeltas === "function") renderSkillDeltas();
  });
}

const deltaControls = document.getElementById("delta-controls");
if (typeof SKILL_DELTA_DATA !== "undefined" && SKILL_DELTA_DATA && SKILL_DELTA_DATA.occupations) {
  Object.keys(SKILL_DELTA_DATA.occupations).forEach(function(name) {
    var btn = document.createElement("button");
    btn.textContent = name;
    btn.dataset.occ = name;
    btn.onclick = function() { currentDeltaOcc = name; renderSkillDeltas(); };
    deltaControls.appendChild(btn);
  });
  currentDeltaOcc = Object.keys(SKILL_DELTA_DATA.occupations)[0] || currentDeltaOcc;
}
const deltaLevelEl = document.getElementById("delta-level");
[
  { id: "skills", label: "Lightcast skills" },
  { id: "esco", label: "ESCO groups" },
  { id: "pillar", label: "ESCO pillars" },
  { id: "domain", label: "ESCO domains" }
].forEach(function(opt) {
  var btn = document.createElement("button");
  btn.textContent = opt.label;
  btn.dataset.level = opt.id;
  btn.onclick = function() { currentDeltaLevel = opt.id; renderSkillDeltas(); };
  deltaLevelEl.appendChild(btn);
});
const deltaMetricEl = document.getElementById("delta-metric");
[
  { id: "pp", label: "\u0394pp" },
  { id: "rank", label: "\u0394rank vs 2023" }
].forEach(function(opt) {
  var btn = document.createElement("button");
  btn.textContent = opt.label;
  btn.dataset.metric = opt.id;
  btn.onclick = function() { currentDeltaMetric = opt.id; renderSkillDeltas(); };
  deltaMetricEl.appendChild(btn);
});

const minPenFilterEl = document.getElementById("min-pen-filter");
if (minPenFilterEl) {
  minPenFilterEl.checked = minPenetrationPct >= MIN_PENETRATION_CUT;
  minPenFilterEl.addEventListener("change", function() {
    minPenetrationPct = this.checked ? MIN_PENETRATION_CUT : 0;
    refreshPenetrationDependentViews();
  });
}

const confFilterEl = document.getElementById("conf-filter");
if (confFilterEl) {
  confFilterEl.value = String(matrixConfMin);
  confFilterEl.addEventListener("change", function() {
    matrixConfMin = parseInt(this.value, 10) || 1;
    // Swap the precomputed variant: node penetration + node exposure.
    if (typeof DATA_ALL !== "undefined") {
      DATA = DATA_ALL.filter(function(d) { return (d.conf_min || 1) === matrixConfMin; });
    }
    if (typeof NODE_AI_EXPOSURE_BY_CONF !== "undefined") {
      NODE_AI_EXPOSURE = NODE_AI_EXPOSURE_BY_CONF[String(matrixConfMin)] || NODE_AI_EXPOSURE;
    }
    render();
    renderDict();
    renderRankBumpCharts();
    renderRankings();
    renderBumpChart();
    renderTopSkills();
    renderCoverage();
    renderMechanisms();
    if (typeof renderMatrixCheck === "function") renderMatrixCheck();
    if (typeof renderOccCompare === "function") renderOccCompare();
  });
}

/* ═══════════════════════════════════════════════════════════════
   Matrix vs Evidence — confronts the AI Skill Matrix's predicted
   trajectories (Declining / Enduring / Emerging, by construction)
   with observed 2023→2026 penetration and LLM-adjudicated exposure.
   ═══════════════════════════════════════════════════════════════ */
let currentMcheckOcc = ALL_OCC;

var MCHECK_EPS = 1.0;   // ±pp band treated as "flat"
var MCHECK_THIN = 1.0;  // <1% penetration both years = thin evidence

var MCHECK_PREDICTION = {
  "Declining": "demand falls",
  "Enduring": "demand holds or grows",
  "Emerging": "demand grows"
};

/** Demand verdict: does observed Δpp confirm the category's prediction? */
function mcheckVerdict(category, change) {
  if (category === "Declining") {
    if (change <= -MCHECK_EPS) return "match";
    if (change < MCHECK_EPS) return "partial";
    return "diverge";
  }
  if (category === "Enduring") {
    return change > -MCHECK_EPS ? "match" : "diverge";
  }
  // Emerging
  if (change >= MCHECK_EPS) return "match";
  if (change > -MCHECK_EPS) return "partial";
  return "diverge";
}

function mcheckBadge(verdict) {
  var labels = { match: "match", partial: "partial", diverge: "diverge", thin: "thin" };
  return "<span class='mcheck-badge " + verdict + "'>" + labels[verdict] + "</span>";
}

function getMcheckEntries(occ) {
  var out = [];
  ["hard", "soft"].forEach(function(t) {
    getRankingEntries(occ, t).forEach(function(e) {
      out.push({
        node: e.node, category: e.category, type: t,
        p23: e.p23, p26: e.p26, change: e.p26 - e.p23,
        fold: escoFold(e.p23, e.p26),
        exposure: NODE_AI_EXPOSURE[e.node] != null ? NODE_AI_EXPOSURE[e.node] : null
      });
    });
  });
  // Global "hide <5% 2026" filter applies here like on the other analysis tabs.
  return filterByPenetration(out);
}

function renderMatrixCheck() {
  var controlsEl = document.getElementById("mcheck-controls");
  controlsEl.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentMcheckOcc);
  });
  var jobs = getJobCounts(currentMcheckOcc);
  var entries = getMcheckEntries(currentMcheckOcc);

  entries.forEach(function(e) {
    e.thin = Math.max(e.p23, e.p26) < MCHECK_THIN;
    e.verdict = mcheckVerdict(e.category, e.change);
  });

  var solid = entries.filter(function(e) { return !e.thin; });
  var counts = { match: 0, partial: 0, diverge: 0 };
  solid.forEach(function(e) { counts[e.verdict]++; });
  var decided = counts.match + counts.diverge;
  var matchRate = decided ? Math.round(counts.match / decided * 100) : 0;

  var filterNote = minPenetrationPct ? " | hiding nodes <" + minPenetrationPct + "% 2026" : "";
  document.getElementById("mcheck-meta").textContent =
    currentMcheckOcc + " — " + entries.length + " leaf nodes (" + solid.length +
    " with ≥1% penetration) | 2023: " + jobs.jobs23.toLocaleString() +
    " | 2026: " + jobs.jobs26.toLocaleString() + " jobs" + filterNote;

  document.getElementById("mcheck-summary").innerHTML =
    "<div class='mcheck-summary-wrap'>" +
    "<div class='mcheck-stat'><span class='val' style='color:#4ade80'>" + counts.match + "</span><span class='lbl'>match</span></div>" +
    "<div class='mcheck-stat'><span class='val' style='color:#facc15'>" + counts.partial + "</span><span class='lbl'>partial / flat</span></div>" +
    "<div class='mcheck-stat'><span class='val' style='color:#f87171'>" + counts.diverge + "</span><span class='lbl'>diverge</span></div>" +
    "<div class='mcheck-stat'><span class='val'>" + matchRate + "%</span><span class='lbl'>match rate (decided, non-thin)</span></div>" +
    "<div class='mcheck-stat'><span class='val' style='color:#777'>" + (entries.length - solid.length) + "</span><span class='lbl'>thin (&lt;1%)</span></div>" +
    "</div>";

  var content = document.getElementById("mcheck-content");
  content.innerHTML = "";
  ["Declining", "Enduring", "Emerging"].forEach(function(cat) {
    var list = entries.filter(function(e) { return e.category === cat; })
      .sort(function(a, b) { return a.change - b.change; });
    if (!list.length) return;
    var catSolid = list.filter(function(e) { return !e.thin; });
    var catMatch = catSolid.filter(function(e) { return e.verdict === "match"; }).length;
    var head = document.createElement("div");
    head.className = "mcheck-cat";
    head.innerHTML = escapeHtml(cat) +
      "<span class='sub'>prediction: " + MCHECK_PREDICTION[cat] + " · " +
      catMatch + "/" + catSolid.length + " non-thin nodes match</span>";
    content.appendChild(head);
    var header = document.createElement("div");
    header.className = "mcheck-header";
    header.innerHTML = "<span>Node</span><span>Type</span><span class='num'>Exp</span>" +
      "<span class='num'>2023%</span><span class='num'>2026%</span><span class='num'>Δpp</span>" +
      "<span class='num' title='Relative growth, 2026 penetration ÷ 2023 penetration'>2026÷2023</span>" +
      "<span>Empirical mechanism</span><span>Verdict</span>";
    content.appendChild(header);
    list.forEach(function(e) {
      var row = document.createElement("div");
      row.className = "mcheck-row" + (e.thin ? " thin-row" : "");
      var cls = e.change >= 0 ? "up" : "down";
      var expHtml = e.exposure != null ?
        "<span class='num' style='color:" + expColor(e.exposure) + ";font-weight:600'>" + e.exposure.toFixed(2) + "</span>" :
        "<span class='num' style='color:#555'>—</span>";
      row.innerHTML =
        "<span class='name'>" + escapeHtml(e.node) + "</span>" +
        "<span style='color:#888'>" + e.type + "</span>" +
        expHtml +
        "<span class='num'>" + e.p23.toFixed(1) + "</span>" +
        "<span class='num'>" + e.p26.toFixed(1) + "</span>" +
        "<span class='num change " + cls + "'>" + fmtChg(e.change) + "</span>" +
        "<span class='num change " + (e.fold >= 1 ? "up" : "down") + "'>" + fmtFold(e.fold) + "</span>" +
        "<span>" + (e.exposure != null ? mechTagHtml(e.node, e.change) : "") + "</span>" +
        "<span>" + mcheckBadge(e.thin ? "thin" : e.verdict) + "</span>";
      content.appendChild(row);
    });
  });
}

const mcheckControls = document.getElementById("mcheck-controls");
addOccButtons(mcheckControls, function(occ) { currentMcheckOcc = occ; renderMatrixCheck(); });

/* ═══════════════════════════════════════════════════════════════
   Occupation Compare — matrix-leaf increases/declines side by side
   for the three focal occupations.
   ═══════════════════════════════════════════════════════════════ */
var OCCCMP_OCCS = [
  { name: "Marketing Managers", abbr: "MKT", color: "#60a5fa" },
  { name: "Human Resources Managers", abbr: "HR", color: "#f472b6" },
  { name: "Financial Managers", abbr: "FIN", color: "#fbbf24" }
];
let occcmpSort = "avgdesc";

function getOccCompareEntries() {
  var byNode = {};
  OCCCMP_OCCS.forEach(function(o) {
    ["hard", "soft"].forEach(function(t) {
      getRankingEntries(o.name, t).forEach(function(e) {
        if (!byNode[e.node]) byNode[e.node] = { node: e.node, category: e.category, type: t, occ: {} };
        byNode[e.node].occ[o.name] = { p23: e.p23, p26: e.p26, change: e.p26 - e.p23 };
      });
    });
  });
  var out = [];
  Object.keys(byNode).forEach(function(n) {
    var e = byNode[n];
    var cells = OCCCMP_OCCS.map(function(o) { return e.occ[o.name] || { p23: 0, p26: 0, change: 0 }; });
    // Omit nodes with zero presence in every occupation and year
    if (cells.every(function(c) { return c.p23 === 0 && c.p26 === 0; })) return;
    // Global "hide <5% 2026" filter: hide only if under the cut in ALL occupations
    if (minPenetrationPct && cells.every(function(c) { return c.p26 < minPenetrationPct; })) return;
    var changes = cells.map(function(c) { return c.change; });
    e.avg = changes.reduce(function(a, b) { return a + b; }, 0) / changes.length;
    e.spread = Math.max.apply(null, changes) - Math.min.apply(null, changes);
    e.maxP26 = Math.max.apply(null, cells.map(function(c) { return c.p26; }));
    var up = changes.filter(function(c) { return c >= 0.5; }).length;
    var down = changes.filter(function(c) { return c <= -0.5; }).length;
    e.consensus = up === changes.length ? "allup"
      : (down === changes.length ? "alldown"
        : (up === 0 && down === 0 ? "flat" : "mixed"));
    out.push(e);
  });
  return out;
}

function occcmpSortFn(a, b) {
  if (occcmpSort === "avgasc") return a.avg - b.avg;
  if (occcmpSort === "spread") return b.spread - a.spread;
  if (occcmpSort === "p26") return b.maxP26 - a.maxP26;
  if (occcmpSort === "name") return a.node.localeCompare(b.node);
  return b.avg - a.avg; // avgdesc
}

function occcmpCellHtml(cell, color) {
  var maxAbs = occcmpCellHtml._maxAbs || 1;
  var halfPct = Math.min(48, Math.abs(cell.change) / maxAbs * 48);
  var up = cell.change >= 0;
  var barStyle = up
    ? "left:50%;width:" + halfPct + "%;background:" + color
    : "right:50%;width:" + halfPct + "%;background:" + color;
  var valStyle = up ? "left:calc(50% + 4px);color:#9fb3c8" : "right:calc(50% + 4px);color:#9fb3c8";
  var tip = "2023: " + cell.p23.toFixed(1) + "% → 2026: " + cell.p26.toFixed(1) + "%";
  return "<div class='occcmp-cell' title='" + tip + "'>" +
    "<div class='axis'></div>" +
    "<div class='bar' style='" + barStyle + "'></div>" +
    "<span class='val' style='" + valStyle + "'>" + fmtChg(cell.change) + "</span>" +
    "</div>";
}

var OCCCMP_TAGS = { allup: "all ↑", alldown: "all ↓", mixed: "mixed", flat: "flat" };

function renderOccCompare() {
  var sortEl = document.getElementById("occcmp-sort");
  if (sortEl) sortEl.value = occcmpSort;
  var entries = getOccCompareEntries();
  var maxAbs = 1;
  entries.forEach(function(e) {
    OCCCMP_OCCS.forEach(function(o) {
      var c = e.occ[o.name];
      if (c) maxAbs = Math.max(maxAbs, Math.abs(c.change));
    });
  });
  occcmpCellHtml._maxAbs = maxAbs;

  var consensusCounts = { allup: 0, alldown: 0, mixed: 0, flat: 0 };
  entries.forEach(function(e) { consensusCounts[e.consensus]++; });
  document.getElementById("occcmp-meta").textContent =
    entries.length + " leaf nodes | all ↑: " + consensusCounts.allup +
    " | all ↓: " + consensusCounts.alldown +
    " | mixed: " + consensusCounts.mixed +
    " | flat: " + consensusCounts.flat +
    (minPenetrationPct ? " | hiding nodes <" + minPenetrationPct + "% 2026 in all occupations" : "");

  var content = document.getElementById("occcmp-content");
  content.innerHTML = "";
  ["Declining", "Enduring", "Emerging"].forEach(function(cat) {
    var list = entries.filter(function(e) { return e.category === cat; }).sort(occcmpSortFn);
    if (!list.length) return;
    var head = document.createElement("div");
    head.className = "mcheck-cat";
    head.innerHTML = escapeHtml(cat) + "<span class='sub'>" + list.length + " nodes</span>";
    content.appendChild(head);
    var header = document.createElement("div");
    header.className = "occcmp-header";
    header.innerHTML = "<span>Node</span><span class='mkt'>Marketing Δpp</span>" +
      "<span class='hr'>HR Δpp</span><span class='fin'>Financial Δpp</span><span>Consensus</span>";
    content.appendChild(header);
    list.forEach(function(e) {
      var row = document.createElement("div");
      row.className = "occcmp-row";
      row.innerHTML =
        "<span class='name'>" + escapeHtml(e.node) +
        " <span style='color:#666;font-size:0.7rem'>" + e.type + "</span></span>" +
        OCCCMP_OCCS.map(function(o) {
          return occcmpCellHtml(e.occ[o.name] || { p23: 0, p26: 0, change: 0 }, o.color);
        }).join("") +
        "<span><span class='occcmp-tag " + e.consensus + "'>" + OCCCMP_TAGS[e.consensus] + "</span></span>";
      content.appendChild(row);
    });
  });
}

var occcmpSortEl = document.getElementById("occcmp-sort");
if (occcmpSortEl) {
  occcmpSortEl.addEventListener("change", function() {
    occcmpSort = this.value || "avgdesc";
    renderOccCompare();
  });
}

/* ── Initial render (after all definitions, incl. mechanism data) ── */
render();
renderDict();
renderRankBumpCharts();
renderRankings();
renderBumpChart();
renderTopSkills();
renderOnetData();
renderCoverage();
renderTitles();
renderMechanisms();
renderMatrixCheck();
renderOccCompare();
renderSkillDeltas();
