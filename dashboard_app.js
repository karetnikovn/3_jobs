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
  if (name === "teaching") renderTeaching();
  if (name === "student") renderStudentFocus();
  if (name === "esco") renderEsco();
  if (name === "escotop") renderEscoTop();
  if (name === "payproxy") renderPayProxy();
  if (name === "deltas") renderSkillDeltas();
  if (name === "portfolio") renderPortfolio();
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
  if (typeof renderTeaching === "function") renderTeaching();
  if (typeof renderStudentFocus === "function") renderStudentFocus();
  if (typeof renderEsco === "function") renderEsco();
  if (typeof renderEscoTop === "function") renderEscoTop();
  if (typeof renderSkillDeltas === "function") renderSkillDeltas();
  if (typeof renderPortfolio === "function") renderPortfolio();
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
      row.innerHTML =
        "<span class='rank-num'>" + (i + 1) + "</span>" +
        "<span class='top-skills-name'>" + escapeHtml(it[0]) +
        (it[3] ? "<span class='top-skills-node'>" + escapeHtml(it[3]) + "</span>" : "<span class='top-skills-unmapped'>unmapped</span>") +
        "</span><span class='num'>" + it[1].toLocaleString() + "</span><span class='num'>" + it[2].toFixed(1) + "%</span>";
      block.appendChild(row);
    });
    content.appendChild(block);
  });
}

function getDisplaySkills(nodeName, query) {
  var info = DICT[nodeName];
  if (!info) return [];
  var skills = info.skills || [];
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

function appendSkillTags(container, className, skills) {
  var el = document.createElement("div");
  el.className = className + " dict-skills";
  el.innerHTML = skills.length ?
    skills.map(function(s) { return "<span class='skill-tag'>" + escapeHtml(s) + skillExpHtml(s) + "</span>"; }).join("") :
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
    appendSkillTags(block, "dict-category-skills", displaySkills);
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
  appendSkillTags(block, "dict-node-skills", displaySkills);
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
  var totalSkills = Object.values(DICT).reduce(function(n, d) { return n + (d.skills ? d.skills.length : 0); }, 0);
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
  skills.forEach(function(it) { if (it[3]) mappedCount++; });
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
    var node = it[3];
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

// AI-exposure score per leaf node, AGGREGATED FROM PER-ESCO-SKILL SCORES.
//   0 = AI cannot perform the underlying task (human bottleneck)
//   1 = AI can largely perform / automate the task
// Each ESCO skill mapped to a node is scored by a transparent rubric grounded in
// the task-level exposure literature (Eloundou et al. GPT-exposure, Felten et al.
// AIOE); the node value below is the MEAN exposure of its mapped ESCO skills.
// Regenerate with build_skill_exposure.py -> node_ai_exposure.json.
// AI-exposure score per leaf node = MEAN of member skill keyword scores
// (matrix-independent: no category prior on skills). Regenerate via
// build_skill_exposure.py -> node_ai_exposure.json.
const NODE_AI_EXPOSURE = {
  // ── Declining · hard ──────────────────────────────────────
  "Locate and retrieve information": 0.72,
  "Digital information analysis and synthesis": 0.685,
  "Declarative and retrieval-based knowledge": 0.623,
  "business knowledge as stored facts": 0.606,
  "Routine tasks": 0.552,
  "Standardized routine execution": 0.481,
  // ── Declining · soft ──────────────────────────────────────
  "Individual knowledge": 0.5,
  "language-specific knowledge": 0.491,
  // ── Enduring · hard ───────────────────────────────────────
  "Quantitative, data, and analytical foundations": 0.63,
  "Data communication and storytelling": 0.63,
  "Analytical and Structured Problem-Solving": 0.569,
  "Data- and Evidence-Based Decision-Making": 0.56,
  "Methodical Process and Technology Management": 0.522,
  "Business and management foundations": 0.514,
  "Foundations": 0.5,
  "A structured approach to work": 0.483,
  "Communications": 0.482,
  "Business & Professional communication": 0.465,
  // ── Enduring · soft ───────────────────────────────────────
  "Analytical and critical thinking": 0.587,
  "Criticism": 0.519,
  "Critical thinking": 0.5,
  "Creativity": 0.453,
  "Entrepreneurial and Innovation-Oriented Thinking": 0.448,
  "Learning": 0.439,
  "Emotional and interpersonal intelligence": 0.426,
  "Collaboration": 0.412,
  "Ethical decision-making": 0.406,
  "Creative Thinking and Curiosity": 0.402,
  "Self-reflection": 0.402,
  "Leadership and social influence": 0.372,
  "Learning orientation": 0.37,
  "Teamwork and cooperation": 0.343,
  // ── Emerging · hard ───────────────────────────────────────
  "Digital and AI literacy": 0.643,
  "AI System Design (How are AI-supported tools, workflows, and processes designed?)": 0.63,
  "AI Data and Process Management": 0.63,
  "AI monitoring; output evaluation and verification": 0.604,
  "AI Development and Implementation": 0.565,
  "AI Risk, Privacy, and Security Management": 0.557,
  "AI-ideation": 0.556,
  "Societal and Environmental AI Impact": 0.511,
  "AI Interaction (How do humans use, communicate with, and evaluate AI?)": 0.5,
  "AI Use-Case Identification and Professional Application": 0.5,
  "AI infrastructure and Deployment Readiness": 0.5,
  "Responsible and Ethical AI Evaluation": 0.5,
  "Prompting skills": 0.481,
  "Governance and Accountability Structures": 0.48,
  // ── Emerging · soft ───────────────────────────────────────
  "AI transformation and organizational redesign": 0.63,
  "Socio-Technical Systems Thinking": 0.531,
  "AI-Driven Change and Opportunity Management": 0.5,
  "Systemic Skills (ability to understand AI implementation within a wider organizational and socio-technical context)": 0.5,
  "Human-AI collaboration": 0.5,
  "Adaptability (capacity to respond constructively to technological and organizational change)": 0.409,
  "Adaptive Mindset and Resilience": 0.37
};

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

// Teaching-design translation: each mechanism quadrant maps to a pedagogy.
// Ordered by curricular priority (what's growing first).
const TEACH_MODES = [
  {
    key: "premium",
    label: "Teach as human craft",
    tagline: "Rising \u00b7 Low AI-exposure",
    color: "#4ade80",
    how: "Socratic dialogue, experiential & case-based work, live coaching, role-play and simulation.",
    assess: "Assess live and in person \u2014 judgment under ambiguity, persuasion, ethical reasoning \u2014 not written artifacts an AI could generate.",
    why: "AI can\u2019t substitute these, so they become the scarce human bottleneck the market pays a premium for. This is the bulk of what\u2019s growing."
  },
  {
    key: "transform",
    label: "Teach with AI",
    tagline: "Rising \u00b7 Moderate / High AI-exposure",
    color: "#f59e0b",
    how: "Put the tools in the classroom. The competency is now orchestrating, prompting and verifying AI output \u2014 not manual production.",
    assess: "Reward supervision & verification: catching model errors, evaluating output quality, integrating AI into a real workflow.",
    why: "AI makes the output cheap, so demand rises \u2014 but for people who can direct and check it."
  },
  {
    key: "displace",
    label: "Retire / fold into AI workflows",
    tagline: "Falling \u00b7 High AI-exposure",
    color: "#f87171",
    how: "Stop teaching as a standalone skill; fold the residual into AI-supervised workflows.",
    assess: "Minimal standalone assessment \u2014 test only the human oversight around the now-automated task.",
    why: "AI performs the task directly and demand is declining."
  },
  {
    key: "shift",
    label: "Deprioritize (watch)",
    tagline: "Falling \u00b7 Low AI-exposure",
    color: "#64748b",
    how: "Not primarily an AI story \u2014 investigate the market reason before cutting anything.",
    assess: "Keep light; revisit as more trend data accumulates.",
    why: "Declining for reasons likely unrelated to AI."
  }
];

let currentMechOcc = ALL_OCC;
let currentMechLevel = "skills"; // "skills" | "esco" | "pillar" | "domain"
let currentTeachOcc = ALL_OCC;
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
    return {
      node: name,
      skill: name,
      matrixNode: currentMechLevel === "skills" ? (r.node || null) : null,
      category: currentMechLevel === "skills" ? (r.node ? "mapped" : "unmapped") : currentMechLevel,
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

/** AI Skill Matrix leaf nodes — Mechanisms / Teaching Design / What to learn. */
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
let currentEscoOcc = ALL_OCC;
let currentEscoLevel = "domain"; // "domain" | "pillar" | "group"

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

function getEscoEntries(occ, level) {
  level = level || currentEscoLevel;
  var rows = [];
  if (level === "domain") {
    if (!hasEscoDomainData()) return [];
    rows = ESCO_DOMAIN_DATA.domains.map(function(d) {
      var o = d.occ[occ] || { p23: 0, p26: 0 };
      var change = +(o.p26 - o.p23).toFixed(2);
      return {
        group: d.domain,
        exposure: d.exposure,
        n_skills: d.n_skills,
        n_groups: d.n_pillars || 0,
        p23: o.p23,
        p26: o.p26,
        change: change,
        fold: escoFold(o.p23, o.p26)
      };
    });
  } else if (level === "pillar") {
    if (!hasEscoPillarData()) return [];
    rows = ESCO_PILLAR_DATA.pillars.map(function(p) {
      var o = p.occ[occ] || { p23: 0, p26: 0 };
      var change = +(o.p26 - o.p23).toFixed(2);
      return {
        group: p.pillar,
        exposure: p.exposure,
        n_skills: p.n_skills,
        n_groups: p.n_groups || 0,
        p23: o.p23,
        p26: o.p26,
        change: change,
        fold: escoFold(o.p23, o.p26)
      };
    });
  } else {
    if (!hasEscoData()) return [];
    rows = ESCO_GROUP_DATA.groups.map(function(g) {
      var o = g.occ[occ] || { p23: 0, p26: 0 };
      var change = +(o.p26 - o.p23).toFixed(2);
      return {
        group: g.group,
        exposure: g.exposure,
        n_skills: g.n_skills,
        n_groups: 0,
        p23: o.p23,
        p26: o.p26,
        change: change,
        fold: escoFold(o.p23, o.p26)
      };
    });
  }
  return filterByPenetration(filterByEitherYear(rows));
}

function renderEscoScatter(entries) {
  var wrap = document.getElementById("esco-scatter");
  var W = 1280, H = 820, m = { l: 92, r: 200, t: 48, b: 72 };
  var pw = W - m.l - m.r, ph = H - m.t - m.b, thr = mechExposureThreshold;

  // Zoom axes to data (+ padding) so the cloud fills the plot
  var xMin = 1, xMax = 0, fMin = 8, fMax = 0.125;
  entries.forEach(function(e) {
    xMin = Math.min(xMin, e.exposure);
    xMax = Math.max(xMax, e.exposure);
    fMin = Math.min(fMin, e.fold);
    fMax = Math.max(fMax, e.fold);
  });
  var xPad = Math.max(0.04, (xMax - xMin) * 0.12);
  xMin = Math.max(0, xMin - xPad);
  xMax = Math.min(1, xMax + xPad);
  if (xMax - xMin < 0.2) { xMin = Math.max(0, thr - 0.25); xMax = Math.min(1, thr + 0.25); }
  // keep threshold inside view when possible
  if (thr < xMin) xMin = Math.max(0, thr - 0.05);
  if (thr > xMax) xMax = Math.min(1, thr + 0.05);
  var logLo = Math.log2(Math.max(0.15, fMin * 0.85));
  var logHi = Math.log2(Math.min(8, fMax * 1.15));
  if (logHi - logLo < 1.2) { logLo -= 0.6; logHi += 0.6; }
  // keep 1× in view
  logLo = Math.min(logLo, -0.15);
  logHi = Math.max(logHi, 0.15);

  function X(v) { return m.l + ((v - xMin) / (xMax - xMin)) * pw; }
  function Y(fold) {
    var lg = Math.log2(Math.max(0.125, Math.min(8, fold)));
    return m.t + (logHi - lg) / (logHi - logLo) * ph;
  }
  var maxP = 1;
  entries.forEach(function(e) { maxP = Math.max(maxP, e.p26); });
  function R(p) { return 7 + Math.sqrt(p / maxP) * 20; }

  var xThr = X(thr), yOne = Y(1);
  var s = "";
  s += "<rect x='" + m.l + "' y='" + m.t + "' width='" + pw + "' height='" + ph + "' fill='#12141c'/>";
  // quadrant washes clipped to plot
  var xMid = Math.max(m.l, Math.min(m.l + pw, xThr));
  var yMid = Math.max(m.t, Math.min(m.t + ph, yOne));
  s += "<rect x='" + m.l + "' y='" + m.t + "' width='" + Math.max(0, xMid - m.l) + "' height='" + Math.max(0, yMid - m.t) + "' fill='#4ade80' opacity='0.08'/>";
  s += "<rect x='" + xMid + "' y='" + m.t + "' width='" + Math.max(0, m.l + pw - xMid) + "' height='" + Math.max(0, yMid - m.t) + "' fill='#f59e0b' opacity='0.09'/>";
  s += "<rect x='" + m.l + "' y='" + yMid + "' width='" + Math.max(0, xMid - m.l) + "' height='" + Math.max(0, m.t + ph - yMid) + "' fill='#64748b' opacity='0.08'/>";
  s += "<rect x='" + xMid + "' y='" + yMid + "' width='" + Math.max(0, m.l + pw - xMid) + "' height='" + Math.max(0, m.t + ph - yMid) + "' fill='#f87171' opacity='0.09'/>";
  s += "<text class='mech-quad-label' x='" + (m.l + 12) + "' y='" + (m.t + 22) + "' fill='#4ade80' style='font-size:15px;font-weight:700'>Human premium</text>";
  s += "<text class='mech-quad-label' x='" + (m.l + pw - 12) + "' y='" + (m.t + 22) + "' fill='#f59e0b' text-anchor='end' style='font-size:15px;font-weight:700'>AI-transformed</text>";
  s += "<text class='mech-quad-label' x='" + (m.l + 12) + "' y='" + (m.t + ph - 12) + "' fill='#94a3b8' style='font-size:15px;font-weight:700'>Non-AI shift</text>";
  s += "<text class='mech-quad-label' x='" + (m.l + pw - 12) + "' y='" + (m.t + ph - 12) + "' fill='#f87171' text-anchor='end' style='font-size:15px;font-weight:700'>Displacement</text>";

  // grid ticks from zoomed ranges
  var xTicks = [];
  for (var xt = Math.ceil(xMin * 20) / 20; xt <= xMax + 1e-9; xt += 0.05) xTicks.push(+xt.toFixed(2));
  if (xTicks.indexOf(+thr.toFixed(2)) === -1) xTicks.push(+thr.toFixed(2));
  xTicks.sort(function(a, b) { return a - b; });
  xTicks.forEach(function(t) {
    if (t < xMin || t > xMax) return;
    s += "<line class='mech-axis' x1='" + X(t) + "' y1='" + m.t + "' x2='" + X(t) + "' y2='" + (m.t + ph) + "' stroke-dasharray='2 5' opacity='0.4'/>";
    s += "<text class='mech-axis-label' x='" + X(t) + "' y='" + (m.t + ph + 20) + "' text-anchor='middle' style='font-size:12px'>" + t.toFixed(2) + "</text>";
  });
  var foldTicks = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8].filter(function(f) {
    var lg = Math.log2(f);
    return lg >= logLo - 0.01 && lg <= logHi + 0.01;
  });
  foldTicks.forEach(function(f) {
    s += "<line class='mech-axis' x1='" + m.l + "' y1='" + Y(f) + "' x2='" + (m.l + pw) + "' y2='" + Y(f) + "' stroke-dasharray='2 5' opacity='0.35'/>";
    var lab = f === 1 ? "1\u00d7 same" : (f + "\u00d7");
    s += "<text class='mech-axis-label' x='" + (m.l - 10) + "' y='" + (Y(f) + 4) + "' text-anchor='end' style='font-size:12px'>" + lab + "</text>";
  });
  s += "<line class='mech-axis' x1='" + m.l + "' y1='" + yOne + "' x2='" + (m.l + pw) + "' y2='" + yOne + "' stroke-width='1.8'/>";
  s += "<line class='mech-thr-line' x1='" + xThr + "' y1='" + m.t + "' x2='" + xThr + "' y2='" + (m.t + ph) + "'/>";
  s += "<line class='mech-axis' x1='" + m.l + "' y1='" + m.t + "' x2='" + m.l + "' y2='" + (m.t + ph) + "'/>";
  s += "<line class='mech-axis' x1='" + m.l + "' y1='" + (m.t + ph) + "' x2='" + (m.l + pw) + "' y2='" + (m.t + ph) + "'/>";
  s += "<text class='mech-axis-label' x='" + (m.l + pw / 2) + "' y='" + (H - 12) + "' text-anchor='middle' style='font-size:15px;fill:#c8d0dc;font-weight:600'>AI exposure (automatability) \u2192</text>";
  s += "<text class='mech-axis-label' transform='translate(18," + (m.t + ph / 2) + ") rotate(-90)' text-anchor='middle' style='font-size:15px;fill:#c8d0dc;font-weight:600'>2026 compared to 2023 (fold \u00d7)</text>";

  var drawOrder = entries.slice().sort(function(a, b) {
    return Math.abs(Math.log2(a.fold)) - Math.abs(Math.log2(b.fold));
  });
  drawOrder.forEach(function(e) {
    var i = entries.indexOf(e);
    var color = MECH_META[mechQuadrant(e.exposure, e.change, thr)].color;
    var dist = Math.abs(Math.log2(e.fold)) + Math.abs(e.exposure - thr);
    var op = 0.55 + Math.min(0.4, dist * 0.25);
    s += "<circle class='mech-dot' data-i='" + i + "' cx='" + X(e.exposure) + "' cy='" + Y(e.fold) + "' r='" + R(e.p26) +
      "' fill='" + color + "' opacity='" + op.toFixed(2) + "' stroke='#fff' stroke-width='1.4'/>";
  });

  // Label many points with greedy collision avoidance
  var candidates = entries.slice().sort(function(a, b) {
    var sa = a.p26 * (0.5 + Math.abs(Math.log2(a.fold)));
    var sb = b.p26 * (0.5 + Math.abs(Math.log2(b.fold)));
    return sb - sa;
  });
  var maxLabels = Math.min(
    entries.length,
    currentEscoLevel === "domain" ? entries.length : (currentEscoLevel === "pillar" ? 36 : 22)
  );
  var placed = [];
  var labelSvg = "";
  function overlaps(box) {
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      if (!(box.x2 < p.x1 || box.x1 > p.x2 || box.y2 < p.y1 || box.y1 > p.y2)) return true;
    }
    return false;
  }
  candidates.slice(0, maxLabels + 12).forEach(function(e) {
    if (placed.length >= maxLabels) return;
    var cx = X(e.exposure), cy = Y(e.fold), r = R(e.p26);
    var name = e.group.length > 34 ? e.group.slice(0, 33) + "\u2026" : e.group;
    var tw = Math.min(210, 7.2 * name.length + 8);
    var th = 16;
    var tries = [
      { anchor: "start", tx: cx + r + 8, ty: cy + 5 },
      { anchor: "end", tx: cx - r - 8, ty: cy + 5 },
      { anchor: "start", tx: cx + r + 8, ty: cy - 12 },
      { anchor: "end", tx: cx - r - 8, ty: cy - 12 },
      { anchor: "start", tx: cx + r + 8, ty: cy + 18 },
      { anchor: "end", tx: cx - r - 8, ty: cy + 18 }
    ];
    for (var t = 0; t < tries.length; t++) {
      var tr = tries[t];
      var x1 = tr.anchor === "end" ? tr.tx - tw : tr.tx;
      var x2 = tr.anchor === "end" ? tr.tx : tr.tx + tw;
      var y1 = tr.ty - 12, y2 = tr.ty + 4;
      // keep inside plot + right margin for labels
      if (x1 < m.l - 4 || x2 > W - 8 || y1 < m.t || y2 > m.t + ph) continue;
      var box = { x1: x1 - 2, x2: x2 + 2, y1: y1, y2: y2 };
      if (overlaps(box)) continue;
      placed.push(box);
      var color = MECH_META[mechQuadrant(e.exposure, e.change, thr)].color;
      labelSvg += "<line class='esco-leader' x1='" + cx + "' y1='" + cy + "' x2='" +
        (tr.anchor === "end" ? tr.tx + 2 : tr.tx - 2) + "' y2='" + (tr.ty - 2) + "' stroke='" + color + "'/>";
      labelSvg += "<text class='esco-label' x='" + tr.tx + "' y='" + tr.ty + "' text-anchor='" + tr.anchor + "'>" +
        escapeHtml(name) + "</text>";
      break;
    }
  });
  s += labelSvg;

  wrap.innerHTML = "<svg class='esco-plot-svg' viewBox='0 0 " + W + " " + H + "' width='100%' style='max-width:100%;display:block' preserveAspectRatio='xMinYMin meet'>" + s + "</svg>";
  var tip = document.getElementById("esco-tooltip");
  wrap.querySelectorAll(".mech-dot").forEach(function(el) {
    var e = entries[parseInt(el.dataset.i, 10)];
    el.addEventListener("mousemove", function(ev) {
      tip.style.display = "block";
      tip.style.left = (ev.clientX + 14) + "px";
      tip.style.top = (ev.clientY + 14) + "px";
      tip.innerHTML =
        "<div class='tt-node'>" + escapeHtml(e.group) + "</div>" +
        "<div class='tt-row'><span>Mechanism</span><span>" + MECH_META[mechQuadrant(e.exposure, e.change, thr)].title + "</span></div>" +
        "<div class='tt-row'><span>AI exposure</span><span>" + e.exposure.toFixed(2) + "</span></div>" +
        "<div class='tt-row'><span>2023 \u2192 2026</span><span>" + e.p23.toFixed(1) + "% \u2192 " + e.p26.toFixed(1) + "%</span></div>" +
        "<div class='tt-row'><span>2026 vs 2023</span><span>" + fmtFold(e.fold) + " (" + fmtChg(e.change) + ")</span></div>" +
        "<div class='tt-row'><span>ESCO skills</span><span>" + e.n_skills + (e.n_groups ? (" \u00b7 " + e.n_groups + " groups") : "") + "</span></div>";
    });
    el.addEventListener("mouseleave", function() { tip.style.display = "none"; });
  });
}

function renderEscoTable(entries) {
  var tableEl = document.getElementById("esco-table");
  var nameHdr = currentEscoLevel === "domain" ? "ESCO domain"
    : (currentEscoLevel === "pillar" ? "ESCO pillar" : "ESCO group");
  var sorted = entries.slice().sort(function(a, b) { return b.fold - a.fold; });
  var html = "<div class='esco-header foldmode'><span>#</span><span>" + nameHdr + "</span><span>Mechanism</span>" +
    "<span class='num'>Exp</span><span class='num'>2023</span><span class='num'>2026</span><span class='num'>vs 2023</span><span class='num'>Skills</span></div>";
  sorted.forEach(function(e, i) {
    var q = mechQuadrant(e.exposure, e.change, mechExposureThreshold);
    var meta = MECH_META[q];
    var cls = e.fold >= 1 ? "up" : "down";
    html += "<div class='esco-row foldmode'>" +
      "<span class='rank-num'>" + (i + 1) + "</span>" +
      "<span class='esco-name' title='" + escapeHtml(e.group) + "'>" + escapeHtml(e.group) + "</span>" +
      "<span class='esco-mech'><span class='mech-tag' style='color:" + meta.color + ";border-color:" + meta.color + "44'><span class='mech-tag-dot' style='background:" + meta.color + "'></span>" + meta.title + "</span></span>" +
      "<span class='num' style='color:" + expColor(e.exposure) + ";font-weight:600'>" + e.exposure.toFixed(2) + "</span>" +
      "<span class='num'>" + e.p23.toFixed(1) + "%</span>" +
      "<span class='num'>" + e.p26.toFixed(1) + "%</span>" +
      "<span class='num change " + cls + "'>" + fmtFold(e.fold) + "</span>" +
      "<span class='num' style='color:#777'>" + e.n_skills + "</span></div>";
  });
  tableEl.innerHTML = html;
}

function renderEsco() {
  var controlsEl = document.getElementById("esco-controls");
  controlsEl.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentEscoOcc);
  });
  var levelEl = document.getElementById("esco-level");
  if (levelEl) {
    levelEl.querySelectorAll("button").forEach(function(b) {
      b.classList.toggle("active", b.dataset.level === currentEscoLevel);
    });
  }
  var metaEl = document.getElementById("esco-meta");
  if (currentEscoLevel === "domain" && !hasEscoDomainData()) {
    metaEl.textContent = "ESCO domain data not loaded.";
    document.getElementById("esco-scatter").innerHTML = "";
    document.getElementById("esco-table").innerHTML = "";
    return;
  }
  if (currentEscoLevel === "pillar" && !hasEscoPillarData()) {
    metaEl.textContent = "ESCO pillar data not loaded.";
    document.getElementById("esco-scatter").innerHTML = "";
    document.getElementById("esco-table").innerHTML = "";
    return;
  }
  if (currentEscoLevel === "group" && !hasEscoData()) {
    metaEl.textContent = "ESCO group data not loaded.";
    return;
  }
  var tjSrc = currentEscoLevel === "domain" ? ESCO_DOMAIN_DATA
    : (currentEscoLevel === "pillar" ? ESCO_PILLAR_DATA : ESCO_GROUP_DATA);
  var tj = ((tjSrc.total_jobs || {})[currentEscoOcc] || {});
  var entries = getEscoEntries(currentEscoOcc, currentEscoLevel);
  var unit = currentEscoLevel === "domain" ? "domains"
    : (currentEscoLevel === "pillar" ? "pillars" : "groups");
  metaEl.textContent = currentEscoOcc + " \u2014 " + entries.length + " ESCO " + unit +
    " \u00b7 Y = 2026 vs 2023 (fold) \u00b7 threshold " + mechExposureThreshold.toFixed(2) +
    penetrationFilterNote() +
    " \u2014 2023: " + (tj["2023"] || 0).toLocaleString() +
    " | 2026: " + (tj["2026"] || 0).toLocaleString() + " jobs";
  renderEscoScatter(entries);
  renderEscoTable(entries);
}

/* ── Top ESCO Groups (ranking + 2023→2026 bump) ──────────────── */
let currentEscoTopOcc = ALL_OCC;
let escoTopYear = 2026;

function getEscoRankLists(occ, limit) {
  var entries = getEscoEntries(occ, "group");
  var by23 = entries.slice().sort(function(a, b) { return b.p23 - a.p23; });
  var by26 = entries.slice().sort(function(a, b) { return b.p26 - a.p26; });
  var list23 = by23.slice(0, limit).map(function(e) { return [e.group, 0, e.p23]; });
  var list26 = by26.slice(0, limit).map(function(e) { return [e.group, 0, e.p26]; });
  var rankLookup23 = {}, absentIn2023 = {};
  by23.forEach(function(e, i) { rankLookup23[e.group] = i + 1; if (e.p23 === 0) absentIn2023[e.group] = true; });
  return { list23: list23, list26: list26, rankLookup23: rankLookup23, absentIn2023: absentIn2023 };
}

/* ── High-Pay Proxy tab ───────────────────────────────────────── */
let currentPayOcc = "Marketing Managers";

function fmtUsd(n) {
  if (n == null) return "\u2014";
  return "$" + Math.round(n).toLocaleString();
}

function payDeltaHtml(e) {
  if (e.new_in_top) return "<span class='pay-delta new'>new</span>";
  if (e.rank_delta == null) return "<span class='pay-delta stable'>\u2014</span>";
  if (e.rank_delta > 0) return "<span class='pay-delta up'>\u25B2" + e.rank_delta + "</span>";
  if (e.rank_delta < 0) return "<span class='pay-delta down'>\u25BC" + Math.abs(e.rank_delta) + "</span>";
  return "<span class='pay-delta stable'>\u2014</span>";
}

function makePayColumn(title, sub, rows, showDelta) {
  var col = document.createElement("div");
  var html = "<div class='pay-col-title'>" + escapeHtml(title) + "</div>" +
    "<div class='pay-col-sub'>" + escapeHtml(sub) + "</div>" +
    "<div class='pay-header'><span>#</span><span>Skill</span><span class='num'>%</span>" +
    (showDelta ? "<span class='num'>\u0394rank</span>" : "<span></span>") + "</div>";
  (rows || []).forEach(function(e, i) {
    var rank = e.rank || (i + 1);
    var cls = e.new_in_top ? " new" : "";
    html += "<div class='pay-row" + cls + "'>" +
      "<span class='rank-num'>" + rank + "</span>" +
      "<span class='pay-name rank-name' title='" + escapeHtml(e.skill) + "'>" + escapeHtml(e.skill) + "</span>" +
      "<span class='num'>" + e.pct.toFixed(1) + "</span>" +
      (showDelta ? payDeltaHtml(e) : "<span></span>") +
      "</div>";
  });
  col.innerHTML = html;
  return col;
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

/* ── Skill Portfolio tab (mechanism plane: exposure × demand change) ─ */
const PORT_CELLS = {
  premium: {
    key: "premium",
    title: "Human premium",
    subtitle: "Rising \u00b7 Low AI-exposure",
    color: "#4ade80",
    hero: true,
    strategy: "Invest in scarce human work",
    why: "Demand is rising for skills AI still struggles to do \u2014 scarcity / human-bottleneck channel."
  },
  transform: {
    key: "transform",
    title: "AI-transformed",
    subtitle: "Rising \u00b7 High AI-exposure",
    color: "#f59e0b",
    strategy: "Teach with AI / complementarity",
    why: "Demand rises even though the task is automatable \u2014 expansion around AI tools (Jevons-like)."
  },
  shift: {
    key: "shift",
    title: "Non-AI shift",
    subtitle: "Falling \u00b7 Low AI-exposure",
    color: "#64748b",
    strategy: "Interpret with caution",
    why: "Falling for reasons that are probably not primarily AI \u2014 investigate before cutting."
  },
  displace: {
    key: "displace",
    title: "Displacement",
    subtitle: "Falling \u00b7 High AI-exposure",
    color: "#f87171",
    strategy: "Deprioritize / fold into AI workflows",
    why: "High automatability and falling demand \u2014 substitution residual."
  }
};
// Visual 2×2 (low exposure left, rising top): Premium | Transformed / Non-AI | Displacement
const PORT_ORDER = ["premium", "transform", "shift", "displace"];
const PORT_UNMAPPED = "#94a3b8";

let currentPortOcc = "All";
let currentPortLevel = "skills";
let currentPortMetric = "pp";
let portShowLabels = true;

function median(vals) {
  if (!vals.length) return 0;
  var a = vals.slice().sort(function(x, y) { return x - y; });
  var m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function annotateSkillKind(rows) {
  return rows.map(function(r) {
    var kind = null;
    if (currentPortLevel === "skills" && r.node && typeof DICT !== "undefined" && DICT[r.node]) {
      kind = DICT[r.node].type || null;
    }
    return Object.assign({}, r, { skillKind: kind });
  });
}

function getPortfolioRows() {
  var rows;
  if (currentPortLevel === "domain") rows = getEscoDomainDeltaRows(currentPortOcc);
  else if (currentPortLevel === "pillar") rows = getEscoPillarDeltaRows(currentPortOcc);
  else if (currentPortLevel === "esco") rows = getEscoDeltaRows(currentPortOcc);
  else rows = getSkillDeltaRows(currentPortOcc);
  rows = annotateSkillKind(annotateRanks(rows)).filter(function(r) { return r.exposure != null; });
  return rows.map(function(r) {
    var cell = portCell(r);
    return Object.assign({}, r, { mechanism: cell });
  });
}

function portTrendValue(r) {
  return currentPortMetric === "rank" ? r.delta_rank : r.delta_pp;
}

function portCell(r) {
  // Paper logic: AI exposure × demand change (rising = non-negative trend)
  if (r.exposure == null) return null;
  return mechQuadrant(r.exposure, portTrendValue(r), mechExposureThreshold);
}

function portDotColor(r) {
  var cell = portCell(r);
  return cell && PORT_CELLS[cell] ? PORT_CELLS[cell].color : PORT_UNMAPPED;
}

function portLegendHtml() {
  return "<div class='port-legend-row'>" + PORT_ORDER.map(function(k) {
    var c = PORT_CELLS[k];
    return "<span><span class='swatch' style='background:" + c.color + "'></span> " + c.title + "</span>";
  }).join("") +
    "<span style='color:#888'>Threshold " + mechExposureThreshold.toFixed(2) +
    " (tune in AI Mechanisms) \u00b7 bubble \u221d 2026 share</span></div>";
}

function fmtPortTrend(v) {
  if (currentPortMetric === "rank") return (v > 0 ? "+" : "") + Math.round(v) + " ranks";
  return (v > 0 ? "+" : "") + (+v).toFixed(1) + " pp";
}

function renderPortScatter(rows) {
  var wrap = document.getElementById("port-scatter");
  var W = 940, H = 540, m = { l: 88, r: 36, t: 42, b: 72 };
  var pw = W - m.l - m.r, ph = H - m.t - m.b;
  var thr = mechExposureThreshold;
  var maxPct = 0.0001;
  var maxAbs = 0.0001;
  rows.forEach(function(r) {
    maxPct = Math.max(maxPct, r.pct_2026);
    maxAbs = Math.max(maxAbs, Math.abs(portTrendValue(r)));
  });
  var yPad = Math.max(maxAbs * 1.15, currentPortMetric === "rank" ? 3 : 0.8);
  var yMax = yPad, yMin = -yPad;
  function X(exp) { return m.l + Math.max(0, Math.min(1, exp)) * pw; }
  function Y(t) { return m.t + (yMax - t) / (yMax - yMin) * ph; }
  function R(p) { return 3.5 + Math.sqrt(p / maxPct) * 10; }
  var xThr = X(thr);
  var yZero = Y(0);
  var s = "";
  s += "<rect x='" + m.l + "' y='" + m.t + "' width='" + pw + "' height='" + ph + "' fill='#fafaf8'/>";
  s += "<rect x='" + m.l + "' y='" + m.t + "' width='" + (xThr - m.l) + "' height='" + (yZero - m.t) + "' fill='#4ade80' opacity='0.07'/>";
  s += "<rect x='" + xThr + "' y='" + m.t + "' width='" + (m.l + pw - xThr) + "' height='" + (yZero - m.t) + "' fill='#f59e0b' opacity='0.07'/>";
  s += "<rect x='" + m.l + "' y='" + yZero + "' width='" + (xThr - m.l) + "' height='" + (m.t + ph - yZero) + "' fill='#64748b' opacity='0.05'/>";
  s += "<rect x='" + xThr + "' y='" + yZero + "' width='" + (m.l + pw - xThr) + "' height='" + (m.t + ph - yZero) + "' fill='#f87171' opacity='0.06'/>";
  s += "<rect class='port-hero-arrow' x='" + m.l + "' y='" + m.t + "' width='" + (xThr - m.l) + "' height='" + (yZero - m.t) + "' rx='2'/>";
  s += "<text class='mech-quad-label' x='" + (m.l + 12) + "' y='" + (m.t + 20) + "' fill='#1a7f4b'>Human premium</text>";
  s += "<text class='mech-quad-label' x='" + (m.l + pw - 12) + "' y='" + (m.t + 20) + "' fill='#b45309' text-anchor='end'>AI-transformed</text>";
  s += "<text class='mech-quad-label' x='" + (m.l + pw - 12) + "' y='" + (m.t + ph - 12) + "' fill='#b91c1c' text-anchor='end'>Displacement</text>";
  s += "<text class='mech-quad-label' x='" + (m.l + 12) + "' y='" + (m.t + ph - 12) + "' fill='#64748b'>Non-AI shift</text>";
  s += "<line class='mech-axis' x1='" + m.l + "' y1='" + yZero + "' x2='" + (m.l + pw) + "' y2='" + yZero + "'/>";
  s += "<line class='mech-thr-line' x1='" + xThr + "' y1='" + m.t + "' x2='" + xThr + "' y2='" + (m.t + ph) + "'/>";
  s += "<line class='mech-axis' x1='" + m.l + "' y1='" + m.t + "' x2='" + m.l + "' y2='" + (m.t + ph) + "'/>";
  s += "<line class='mech-axis' x1='" + m.l + "' y1='" + (m.t + ph) + "' x2='" + (m.l + pw) + "' y2='" + (m.t + ph) + "'/>";
  [0, 0.25, 0.5, 0.75, 1].forEach(function(t) {
    s += "<text class='mech-axis-label' x='" + X(t) + "' y='" + (m.t + ph + 18) + "' text-anchor='middle'>" + t.toFixed(2) + "</text>";
  });
  [yMax, 0, yMin].forEach(function(v) {
    s += "<text class='mech-axis-label' x='" + (m.l - 8) + "' y='" + (Y(v) + 3) + "' text-anchor='end'>" +
      (v === 0 ? "0" : fmtPortTrend(v)) + "</text>";
  });
  s += "<text class='mech-axis-label' x='" + (m.l + pw / 2) + "' y='" + (H - 10) + "' text-anchor='middle' style='font-size:13px;fill:#333;font-weight:600'>AI exposure (automatability) \u2192</text>";
  s += "<text class='mech-axis-label' transform='translate(16," + (m.t + ph / 2) + ") rotate(-90)' text-anchor='middle' style='font-size:13px;fill:#333;font-weight:600'>Demand change vs 2023 \u2192</text>";

  var drawOrder = rows.slice().sort(function(a, b) {
    return Math.abs(portTrendValue(a)) - Math.abs(portTrendValue(b));
  });
  drawOrder.forEach(function(r) {
    var i = rows.indexOf(r);
    var color = portDotColor(r);
    var tv = portTrendValue(r);
    s += "<circle class='mech-dot' data-i='" + i + "' cx='" + X(r.exposure) + "' cy='" + Y(tv) + "' r='" + R(r.pct_2026) +
      "' fill='" + color + "' opacity='0.72' stroke='#fff' stroke-width='1.2'/>";
  });

  if (portShowLabels) {
    var byCell = { premium: [], transform: [], shift: [], displace: [] };
    rows.forEach(function(r) {
      var c = portCell(r);
      if (c && byCell[c]) byCell[c].push(r);
    });
    function topByAbs(arr, n) {
      return arr.slice().sort(function(a, b) {
        return Math.abs(portTrendValue(b)) - Math.abs(portTrendValue(a)) || b.pct_2026 - a.pct_2026;
      }).slice(0, n);
    }
    var labeled = topByAbs(byCell.premium, 5)
      .concat(topByAbs(byCell.transform, 4))
      .concat(topByAbs(byCell.displace, 2))
      .concat(topByAbs(byCell.shift, 1));
    labeled.forEach(function(r) {
      var tv = portTrendValue(r);
      var cx = X(r.exposure), cy = Y(tv), rad = R(r.pct_2026);
      var name = r.skill.length > 26 ? r.skill.slice(0, 25) + "\u2026" : r.skill;
      var anchor = r.exposure > 0.62 ? "end" : "start";
      var tx = r.exposure > 0.62 ? cx - rad - 5 : cx + rad + 5;
      s += "<text class='mech-point-label' x='" + tx + "' y='" + (cy + 3) + "' text-anchor='" + anchor + "'>" + escapeHtml(name) + "</text>";
    });
  }

  wrap.innerHTML = "<svg viewBox='0 0 " + W + " " + H + "' width='100%' style='max-width:" + W + "px;display:block' preserveAspectRatio='xMinYMin meet'>" + s + "</svg>";
  var tip = document.getElementById("port-tooltip");
  wrap.querySelectorAll(".mech-dot").forEach(function(el) {
    var r = rows[parseInt(el.dataset.i, 10)];
    var cell = PORT_CELLS[portCell(r)];
    el.addEventListener("mousemove", function(ev) {
      tip.style.display = "block";
      tip.style.left = (ev.clientX + 14) + "px";
      tip.style.top = (ev.clientY + 14) + "px";
      var trendTxt = currentPortMetric === "rank"
        ? ("\u0394rank " + (r.delta_rank > 0 ? "+" : "") + r.delta_rank + " (R" + r.rank_2023 + "\u2192R" + r.rank_2026 + ")")
        : ("\u0394pp " + (r.delta_pp > 0 ? "+" : "") + r.delta_pp.toFixed(1));
      tip.innerHTML =
        "<div class='tt-node'>" + escapeHtml(r.skill) + "</div>" +
        "<div class='tt-row'><span>Quadrant</span><span>" + cell.title + "</span></div>" +
        "<div class='tt-row'><span>Strategy</span><span>" + cell.strategy + "</span></div>" +
        (r.skillKind ? "<div class='tt-row'><span>Type</span><span>" + r.skillKind + "</span></div>" : "") +
        "<div class='tt-row'><span>AI exposure</span><span>" + r.exposure.toFixed(2) + " (thr " + thr.toFixed(2) + ")</span></div>" +
        "<div class='tt-row'><span>Share (2026)</span><span>" + r.pct_2026.toFixed(1) + "%</span></div>" +
        "<div class='tt-row'><span>Demand change</span><span>" + trendTxt + "</span></div>";
    });
    el.addEventListener("mouseleave", function() { tip.style.display = "none"; });
  });
}

function renderPortCards(rows) {
  var cardsEl = document.getElementById("port-cards");
  cardsEl.innerHTML = "";
  cardsEl.className = "port-matrix";
  var groups = { premium: [], transform: [], shift: [], displace: [] };
  rows.forEach(function(r) {
    var c = portCell(r);
    if (c && groups[c]) groups[c].push(r);
  });
  PORT_ORDER.forEach(function(key) {
    var meta = PORT_CELLS[key];
    var rising = (key === "premium" || key === "transform");
    var list = groups[key].slice().sort(function(a, b) {
      var ta = portTrendValue(a), tb = portTrendValue(b);
      if (rising) return tb - ta || b.pct_2026 - a.pct_2026;
      return ta - tb || a.pct_2026 - b.pct_2026;
    });
    var chips = list.length ? list.slice(0, 10).map(function(r) {
      var tv = portTrendValue(r);
      var cls = tv >= 0 ? "up" : "down";
      var tlabel = currentPortMetric === "rank"
        ? ((tv > 0 ? "+" : "") + tv)
        : ((tv > 0 ? "+" : "") + r.delta_pp.toFixed(1) + "pp");
      return "<div class='port-item'>" +
        "<span class='port-item-name' title='" + escapeHtml(r.skill) + "'>" + escapeHtml(r.skill) + "</span>" +
        "<span class='port-item-mech' style='color:#666;font-size:0.68rem'>exp " + r.exposure.toFixed(2) + "</span>" +
        "<span class='port-item-pct'>" + r.pct_2026.toFixed(1) + "%</span>" +
        "<span class='chg " + cls + "'>" + tlabel + "</span></div>";
    }).join("") + (list.length > 10 ? "<div class='teach-empty'>+" + (list.length - 10) + " more \u2014 hover scatter for all</div>" : "")
      : "<div class='teach-empty'>No items in this quadrant.</div>";
    var card = document.createElement("div");
    card.className = "port-cell-card" + (meta.hero ? " hero" : "");
    card.style.borderLeft = "4px solid " + meta.color;
    card.innerHTML =
      "<div class='port-cell-head'>" +
        "<div class='port-cell-title'>" + meta.title +
          "<span class='port-cell-count'>" + list.length + "</span></div>" +
        "<div class='port-cell-sub'>" + meta.subtitle + " \u00b7 " + meta.strategy + "</div>" +
        "<div class='port-cell-why'>" + meta.why + "</div>" +
      "</div>" +
      "<div class='port-cell-list'>" + chips + "</div>";
    cardsEl.appendChild(card);
  });
}

function renderPortfolio() {
  document.getElementById("port-controls").querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentPortOcc);
  });
  document.getElementById("port-level").querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.level === currentPortLevel);
  });
  document.getElementById("port-metric").querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.metric === currentPortMetric);
  });
  var labelsEl = document.getElementById("port-labels");
  if (labelsEl) labelsEl.checked = portShowLabels;
  var legendEl = document.getElementById("port-mech-legend");
  if (legendEl) legendEl.innerHTML = portLegendHtml();
  var metaEl = document.getElementById("port-meta");
  var rows = getPortfolioRows();
  if (!rows.length) {
    metaEl.textContent = "No portfolio data for this selection.";
    document.getElementById("port-scatter").innerHTML = "";
    document.getElementById("port-cards").innerHTML = "";
    return;
  }
  var levelLabel = currentPortLevel === "domain" ? "ESCO domains"
    : (currentPortLevel === "pillar" ? "ESCO pillars"
      : (currentPortLevel === "esco" ? "ESCO groups" : "Lightcast skills"));
  var metricLabel = currentPortMetric === "rank" ? "\u0394rank vs 2023" : "\u0394pp";
  var premN = rows.filter(function(r) { return portCell(r) === "premium"; }).length;
  var transN = rows.filter(function(r) { return portCell(r) === "transform"; }).length;
  var rising = rows.filter(function(r) { return portTrendValue(r) >= 0; });
  var sumPos = rising.reduce(function(a, r) { return a + Math.max(0, portTrendValue(r)); }, 0);
  var premMass = rising.filter(function(r) { return portCell(r) === "premium"; })
    .reduce(function(a, r) { return a + Math.max(0, portTrendValue(r)); }, 0);
  var premShare = sumPos ? (100 * premMass / sumPos) : 0;
  metaEl.textContent =
    currentPortOcc + " \u00b7 mechanism portfolio \u00b7 " + levelLabel + " \u00b7 " + metricLabel +
    " \u2014 " + rows.length + " items | " + premN + " premium | " + transN + " transformed | " +
    premShare.toFixed(0) + "% of rising mass is premium | thr " + mechExposureThreshold.toFixed(2) +
    penetrationFilterNote();
  renderPortScatter(rows);
  renderPortCards(rows);
}

function renderPayProxy() {
  var controlsEl = document.getElementById("pay-controls");
  controlsEl.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentPayOcc);
  });
  var metaEl = document.getElementById("pay-meta");
  var blsEl = document.getElementById("pay-bls");
  var exEl = document.getElementById("pay-examples");
  var colsEl = document.getElementById("pay-cols");
  if (typeof SALARY_PROXY_DATA === "undefined" || !SALARY_PROXY_DATA || !SALARY_PROXY_DATA.occupations) {
    metaEl.textContent = "Salary-proxy data not loaded.";
    blsEl.innerHTML = ""; exEl.innerHTML = ""; colsEl.innerHTML = "";
    return;
  }
  var info = SALARY_PROXY_DATA.occupations[currentPayOcc];
  if (!info) { metaEl.textContent = "No data for " + currentPayOcc; return; }
  metaEl.textContent =
    currentPayOcc + " (2026) \u2014 All: " + info.n_all.toLocaleString() +
    " postings | High-pay proxy (top 5%): " + info.n_high_proxy.toLocaleString() +
    " | Random sample: " + info.n_sample +
    " | seniority cutoff score: " + info.score_cutoff;
  var bls = info.bls || {};
  blsEl.innerHTML =
    "<div class='pay-bls-box'><span class='val'>" + fmtUsd(bls.median) + "</span><span class='lbl'>BLS median</span></div>" +
    "<div class='pay-bls-box'><span class='val'>" + fmtUsd(bls.p75) + "</span><span class='lbl'>BLS 75th</span></div>" +
    "<div class='pay-bls-box'><span class='val'>" + fmtUsd(bls.p90) + "+</span><span class='lbl'>BLS ~90th / top-coded</span></div>" +
    "<div class='pay-bls-box'><span class='val' style='font-size:0.78rem;font-weight:500;color:#888'>" +
      escapeHtml(bls.source || "BLS OES") + "</span><span class='lbl'>Public wage context</span></div>";
  exEl.innerHTML = "<strong>Example high-pay-proxy titles:</strong> " +
    (info.example_high_titles || []).slice(0, 8).map(function(t) { return escapeHtml(t); }).join(" \u00b7 ");
  colsEl.innerHTML = "";
  colsEl.appendChild(makePayColumn(
    "All postings",
    info.n_all.toLocaleString() + " jobs \u00b7 baseline top 20",
    (info.top_all || []).map(function(e, i) { return Object.assign({ rank: i + 1 }, e); }),
    false
  ));
  colsEl.appendChild(makePayColumn(
    "High-pay proxy (top 5%)",
    info.n_high_proxy.toLocaleString() + " jobs \u00b7 title seniority score",
    info.top_high_proxy,
    true
  ));
  colsEl.appendChild(makePayColumn(
    "Random 100",
    "noise check vs high-pay differences",
    info.top_sample100,
    true
  ));
}

function renderEscoTop() {
  document.getElementById("esco-top-controls").querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentEscoTopOcc);
  });
  document.getElementById("esco-top-year").querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", parseInt(b.dataset.year, 10) === escoTopYear);
  });
  var metaEl = document.getElementById("esco-top-meta");
  var chartEl = document.getElementById("esco-top-bump");
  var contentEl = document.getElementById("esco-top-content");
  if (!hasEscoData()) { metaEl.textContent = "ESCO group data not loaded."; chartEl.innerHTML = ""; contentEl.innerHTML = ""; return; }
  var lists = getEscoRankLists(currentEscoTopOcc, BUMP_N);
  metaEl.textContent = currentEscoTopOcc + " | top " + BUMP_N + " ESCO groups by posting penetration %";
  renderBumpChartCore(chartEl, lists.list23, lists.list26, BUMP_N,
    function(it) { return bumpLabelHtml(it[0]); },
    { rankLookup23: lists.rankLookup23, absentIn2023: lists.absentIn2023 });

  var entries = getEscoEntries(currentEscoTopOcc, "group");
  var key = escoTopYear === 2023 ? "p23" : "p26";
  var total = (ESCO_GROUP_DATA.total_jobs[currentEscoTopOcc] || {})[String(escoTopYear)] || 0;
  var top = entries.slice().sort(function(a, b) { return b[key] - a[key]; }).slice(0, 15);
  var html = "<div class='escotop-header'><span>#</span><span>ESCO group</span><span>Mechanism</span>" +
    "<span class='num'>Exp</span><span class='num'>Jobs</span><span class='num'>%</span></div>";
  top.forEach(function(e, i) {
    var pct = e[key];
    var q = mechQuadrant(e.exposure, e.change, mechExposureThreshold);
    var meta = MECH_META[q];
    html += "<div class='escotop-row'>" +
      "<span class='rank-num'>" + (i + 1) + "</span>" +
      "<span class='esco-name' title='" + escapeHtml(e.group) + "'>" + escapeHtml(e.group) + "</span>" +
      "<span class='esco-mech'><span class='mech-tag' style='color:" + meta.color + ";border-color:" + meta.color + "44'><span class='mech-tag-dot' style='background:" + meta.color + "'></span>" + meta.title + "</span></span>" +
      "<span class='num' style='color:" + expColor(e.exposure) + ";font-weight:600'>" + e.exposure.toFixed(2) + "</span>" +
      "<span class='num'>" + Math.round(pct / 100 * total).toLocaleString() + "</span>" +
      "<span class='num'>" + pct.toFixed(1) + "%</span></div>";
  });
  contentEl.innerHTML = html;
}

function renderTeaching() {
  var controlsEl = document.getElementById("teach-controls");
  controlsEl.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentTeachOcc);
  });
  var jobs = getJobCounts(currentTeachOcc);
  document.getElementById("teach-job-counts").textContent =
    currentTeachOcc + " \u2014 AI-exposure threshold " + mechExposureThreshold.toFixed(2) +
    " (tune in AI Mechanisms) \u2014 2023: " + jobs.jobs23.toLocaleString() +
    " | 2026: " + jobs.jobs26.toLocaleString() + " jobs";
  var entries = getMatrixMechEntries(currentTeachOcc);
  var groups = { transform: [], premium: [], displace: [], shift: [] };
  entries.forEach(function(e) { groups[mechQuadrant(e.exposure, e.change, mechExposureThreshold)].push(e); });
  var wrap = document.getElementById("teach-modes");
  wrap.innerHTML = "";
  TEACH_MODES.forEach(function(mode) {
    var rising = (mode.key === "transform" || mode.key === "premium");
    var list = groups[mode.key].slice().sort(function(a, b) {
      return rising ? (b.change - a.change) : (a.change - b.change);
    });
    var chips = list.length ? list.map(function(e) {
      var cls = e.change >= 0 ? "up" : "down";
      return "<span class='teach-chip' title='AI-exposure " + e.exposure.toFixed(2) + "'>" +
        escapeHtml(e.node) + " <span class='chg " + cls + "'>" + fmtChg(e.change) + "</span></span>";
    }).join("") : "<div class='teach-empty'>No skills in this group for " + escapeHtml(currentTeachOcc) + ".</div>";
    var card = document.createElement("div");
    card.className = "teach-card";
    card.style.borderLeftColor = mode.color;
    card.innerHTML =
      "<div class='teach-card-head'>" +
        "<div class='teach-title'><span class='mech-card-swatch' style='background:" + mode.color + "'></span>" +
          mode.label + " <span style='color:#666;font-weight:400;font-size:0.8rem'>(" + list.length + ")</span></div>" +
        "<div class='teach-tagline'>" + mode.tagline + "</div>" +
        "<div class='teach-lines'><b>How:</b> " + mode.how + "<br><b>Assess:</b> " + mode.assess + "<br><b>Why:</b> " + mode.why + "</div>" +
      "</div>" +
      "<div class='teach-nodes'>" + chips + "</div>";
    wrap.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════════════
   Student Focus — "What to learn": short ranked checklist per role
   from mechanism nodes + top ESCO domains (no new scatter).
   ═══════════════════════════════════════════════════════════════ */
let currentStudentOcc = ALL_OCC;

const STUDENT_BUCKETS = [
  {
    key: "must",
    label: "Must master",
    blurb: "High demand, still growing, and the market treats them as human premium or AI-transformed.",
    color: "#4ade80",
    emphasize: true
  },
  {
    key: "recommended",
    label: "Recommended",
    blurb: "Rising or above-median growth at lower share, or solid share with milder growth — strong next bets.",
    color: "#60a5fa",
    emphasize: false
  },
  {
    key: "maintain",
    label: "Maintain",
    blurb: "Still common in postings but flat or falling — keep coverage; do not over-invest.",
    color: "#94a3b8",
    emphasize: false
  },
  {
    key: "skip",
    label: "Skip for now",
    blurb: "Displacement or low-share and falling — deprioritize until the market turns.",
    color: "#f87171",
    emphasize: false
  }
];

function studentMedian(vals) {
  if (!vals.length) return 0;
  var s = vals.slice().sort(function(a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function studentWhyLine(e, mechTitle) {
  return "In " + e.p26.toFixed(1) + "% of 2026 postings, " + fmtChg(e.change) + ", " + mechTitle;
}

function getStudentFocusLists(occ) {
  var entries = getMatrixMechEntries(occ);
  var medShare = studentMedian(entries.map(function(e) { return e.p26; }));
  var medGrowth = studentMedian(entries.map(function(e) { return e.change; }));
  var buckets = { must: [], recommended: [], maintain: [], skip: [] };

  entries.forEach(function(e) {
    var mech = mechQuadrant(e.exposure, e.change, mechExposureThreshold);
    var meta = MECH_META[mech];
    var highShare = e.p26 >= medShare;
    var highGrowth = e.change >= medGrowth;
    var row = {
      node: e.node,
      p23: e.p23,
      p26: e.p26,
      change: e.change,
      exposure: e.exposure,
      mech: mech,
      mechTitle: meta.title,
      why: studentWhyLine(e, meta.title),
      score: e.p26 + Math.max(0, e.change) * 2
    };
    if ((mech === "premium" || mech === "transform") && highShare && e.change >= 0) {
      buckets.must.push(row);
    } else if (mech === "displace" || (!highShare && e.change < 0)) {
      buckets.skip.push(row);
    } else if (highShare && (e.change < 0 || !highGrowth)) {
      buckets.maintain.push(row);
    } else {
      buckets.recommended.push(row);
    }
  });

  buckets.must.sort(function(a, b) { return b.score - a.score || b.p26 - a.p26; });
  buckets.recommended.sort(function(a, b) { return b.change - a.change || b.p26 - a.p26; });
  buckets.maintain.sort(function(a, b) { return b.p26 - a.p26; });
  buckets.skip.sort(function(a, b) {
    if (a.mech === "displace" && b.mech !== "displace") return -1;
    if (b.mech === "displace" && a.mech !== "displace") return 1;
    return a.change - b.change || a.p26 - b.p26;
  });

  buckets.must = buckets.must.slice(0, 8);
  buckets.recommended = buckets.recommended.slice(0, 8);
  buckets.maintain = buckets.maintain.slice(0, 6);
  buckets.skip = buckets.skip.slice(0, 6);

  var domains = [];
  if (typeof hasEscoDomainData === "function" && hasEscoDomainData()) {
    domains = getEscoEntries(occ, "domain").slice()
      .sort(function(a, b) { return b.p26 - a.p26; })
      .slice(0, 5)
      .map(function(d) {
        return { name: d.group, p26: d.p26, change: d.change };
      });
  }

  return {
    buckets: buckets,
    domains: domains,
    medShare: medShare,
    medGrowth: medGrowth,
    nKept: entries.length
  };
}

function renderStudentFocus() {
  var controlsEl = document.getElementById("student-controls");
  if (!controlsEl) return;
  controlsEl.querySelectorAll("button").forEach(function(b) {
    b.classList.toggle("active", b.dataset.occ === currentStudentOcc);
  });
  var jobs = getJobCounts(currentStudentOcc);
  var data = getStudentFocusLists(currentStudentOcc);
  document.getElementById("student-job-counts").textContent =
    currentStudentOcc + " \u2014 " + data.nKept + " skills in scope" +
    penetrationFilterNote() +
    " | median share " + data.medShare.toFixed(1) + "% | median \u0394 " + fmtChg(data.medGrowth) +
    " | 2023: " + jobs.jobs23.toLocaleString() + " | 2026: " + jobs.jobs26.toLocaleString() + " jobs";

  var domainsEl = document.getElementById("student-domains");
  if (data.domains.length) {
    domainsEl.innerHTML =
      "<div class='student-domains-label'>Broad capability areas hiring for</div>" +
      "<div class='student-domains-row'>" + data.domains.map(function(d) {
        var cls = d.change >= 0 ? "up" : "down";
        return "<span class='student-domain-chip'>" +
          "<span class='student-domain-name'>" + escapeHtml(d.name) + "</span>" +
          "<span class='student-domain-meta'>" + d.p26.toFixed(1) + "% " +
          "<span class='chg " + cls + "'>" + fmtChg(d.change) + "</span></span></span>";
      }).join("") + "</div>";
  } else {
    domainsEl.innerHTML = "<div class='teach-empty'>ESCO domain data not loaded.</div>";
  }

  var listsEl = document.getElementById("student-lists");
  listsEl.innerHTML = "";
  STUDENT_BUCKETS.forEach(function(bucket) {
    var list = data.buckets[bucket.key];
    var rows = list.length ? list.map(function(e) {
      var cls = e.change >= 0 ? "up" : "down";
      return "<div class='student-row'>" +
        "<div class='student-row-main'>" +
          "<div class='student-row-name'>" + escapeHtml(e.node) + "</div>" +
          "<div class='student-row-why'>" + escapeHtml(e.why) + "</div>" +
        "</div>" +
        "<div class='student-row-meta'>" +
          mechTagHtml(e.node, e.change) +
          "<span class='student-stat'>" + e.p26.toFixed(1) + "%</span>" +
          "<span class='student-stat chg " + cls + "'>" + fmtChg(e.change) + "</span>" +
        "</div>" +
      "</div>";
    }).join("") : "<div class='teach-empty'>Nothing in this bucket for " + escapeHtml(currentStudentOcc) + ".</div>";

    var sec = document.createElement("section");
    sec.className = "student-section" + (bucket.emphasize ? " student-section-must" : "");
    sec.style.borderLeftColor = bucket.color;
    sec.innerHTML =
      "<div class='student-section-head'>" +
        "<div class='student-section-title'><span class='mech-card-swatch' style='background:" + bucket.color + "'></span>" +
          bucket.label + " <span class='student-count'>(" + list.length + ")</span></div>" +
        "<div class='student-section-blurb'>" + bucket.blurb + "</div>" +
      "</div>" +
      "<div class='student-rows'>" + rows + "</div>";
    listsEl.appendChild(sec);
  });
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
  renderTeaching();
  renderStudentFocus();
  renderEsco();
  renderPortfolio();
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
    if (typeof renderPortfolio === "function") renderPortfolio();
    if (typeof renderSkillDeltas === "function") renderSkillDeltas();
    if (typeof renderEsco === "function") renderEsco();
    if (typeof renderEscoTop === "function") renderEscoTop();
  });
}

const teachControls = document.getElementById("teach-controls");
addOccButtons(teachControls, function(occ) { currentTeachOcc = occ; renderTeaching(); });

const studentControls = document.getElementById("student-controls");
if (studentControls) {
  addOccButtons(studentControls, function(occ) { currentStudentOcc = occ; renderStudentFocus(); });
}
const escoControls = document.getElementById("esco-controls");
addOccButtons(escoControls, function(occ) { currentEscoOcc = occ; renderEsco(); });
const escoLevelEl = document.getElementById("esco-level");
if (escoLevelEl) {
  [
    { id: "domain", label: "ESCO domains" },
    { id: "pillar", label: "ESCO pillars" },
    { id: "group", label: "ESCO groups" }
  ].forEach(function(opt) {
    var btn = document.createElement("button");
    btn.textContent = opt.label;
    btn.dataset.level = opt.id;
    btn.onclick = function() { currentEscoLevel = opt.id; renderEsco(); };
    escoLevelEl.appendChild(btn);
  });
}

const escoTopControls = document.getElementById("esco-top-controls");
addOccButtons(escoTopControls, function(occ) { currentEscoTopOcc = occ; renderEscoTop(); });
const escoTopYearEl = document.getElementById("esco-top-year");
[2023, 2026].forEach(function(yr) {
  var btn = document.createElement("button");
  btn.textContent = yr;
  btn.dataset.year = yr;
  btn.onclick = function() { escoTopYear = yr; renderEscoTop(); };
  escoTopYearEl.appendChild(btn);
});

const payControls = document.getElementById("pay-controls");
if (typeof SALARY_PROXY_DATA !== "undefined" && SALARY_PROXY_DATA && SALARY_PROXY_DATA.occupations) {
  Object.keys(SALARY_PROXY_DATA.occupations).forEach(function(name) {
    var btn = document.createElement("button");
    btn.textContent = name;
    btn.dataset.occ = name;
    btn.onclick = function() { currentPayOcc = name; renderPayProxy(); };
    payControls.appendChild(btn);
  });
  currentPayOcc = Object.keys(SALARY_PROXY_DATA.occupations)[0] || currentPayOcc;
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

const portControls = document.getElementById("port-controls");
["All", "Marketing Managers", "Human Resources Managers", "Financial Managers"].forEach(function(name) {
  var btn = document.createElement("button");
  btn.textContent = name;
  btn.dataset.occ = name;
  btn.onclick = function() { currentPortOcc = name; renderPortfolio(); };
  portControls.appendChild(btn);
});
const portLevelEl = document.getElementById("port-level");
[
  { id: "skills", label: "Lightcast skills" },
  { id: "esco", label: "ESCO groups" },
  { id: "pillar", label: "ESCO pillars" },
  { id: "domain", label: "ESCO domains" }
].forEach(function(opt) {
  var btn = document.createElement("button");
  btn.textContent = opt.label;
  btn.dataset.level = opt.id;
  btn.onclick = function() { currentPortLevel = opt.id; renderPortfolio(); };
  portLevelEl.appendChild(btn);
});
const portMetricEl = document.getElementById("port-metric");
[
  { id: "pp", label: "\u0394pp" },
  { id: "rank", label: "\u0394rank vs 2023" }
].forEach(function(opt) {
  var btn = document.createElement("button");
  btn.textContent = opt.label;
  btn.dataset.metric = opt.id;
  btn.onclick = function() { currentPortMetric = opt.id; renderPortfolio(); };
  portMetricEl.appendChild(btn);
});
document.getElementById("port-labels").addEventListener("change", function() {
  portShowLabels = this.checked;
  renderPortfolio();
});

const minPenFilterEl = document.getElementById("min-pen-filter");
if (minPenFilterEl) {
  minPenFilterEl.checked = minPenetrationPct >= MIN_PENETRATION_CUT;
  minPenFilterEl.addEventListener("change", function() {
    minPenetrationPct = this.checked ? MIN_PENETRATION_CUT : 0;
    refreshPenetrationDependentViews();
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
renderTeaching();
renderStudentFocus();
renderEsco();
renderEscoTop();
renderPayProxy();
renderSkillDeltas();
renderPortfolio();
