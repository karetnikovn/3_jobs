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
}

const ALL_OCC = "All";
const OCCS = [...new Set(DATA.map(function(d) { return d.occupation; }))].filter(function(o) { return o !== ALL_OCC; });
const OCC_OPTIONS = [ALL_OCC].concat(OCCS);

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
  return Object.keys(nodes).map(function(node) {
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
  c.innerHTML = "";
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

function appendSkillTags(container, className, skills) {
  var el = document.createElement("div");
  el.className = className + " dict-skills";
  el.innerHTML = skills.length ?
    skills.map(function(s) { return "<span class='skill-tag'>" + escapeHtml(s) + "</span>"; }).join("") :
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
  nameEl.innerHTML = escapeHtml(nodeName) + "<span class='dict-node-meta'>" + displaySkills.length + " skills</span>";
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
  statsEl.textContent = query ?
    "Showing " + counts.nodes + " of " + totalNodes + " nodes (" + counts.skills + " skills)" :
    totalNodes + " nodes, " + totalSkills + " mapped skills (cosine similarity \u2265 0.45)";
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

render();
renderDict();
renderRankBumpCharts();
renderRankings();
renderBumpChart();
renderTopSkills();
renderOnetData();
renderCoverage();
renderTitles();
