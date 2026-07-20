# LLM Adjudication Protocol — Skill→Matrix Mapping and AI-Exposure Scoring

**Version 1.0 · 2026-07-20 · Rater: Claude Fable 5 (Anthropic), single documented pass**

This protocol governs the construction of the two measurement layers behind the
dashboard and the working paper:

1. the assignment of Lightcast standardized skills to **AI Skill Matrix** nodes
   (the "skill dictionary"), and
2. the **AI-exposure score** attached to each skill.

It replaces the previous fully automatic pipeline (sentence-embedding
winner-take-all mapping; keyword-rubric exposure), which is retained as a
candidate-generation and robustness layer.

---

## 1. Universe

The adjudicated universe is the union of:

- all skills previously mapped to a matrix node by the embedding stage
  (all-MiniLM-L6-v2 cosine ≥ 0.45, winner-take-all), and
- all skills passing the analysis high-pass filter (≥ 5 % penetration in 2023
  or 2026 in at least one focal occupation: Marketing Managers, HR Managers,
  Financial Managers).

N = 1,170 skills. Skills outside this universe (low-frequency, unmapped) do not
enter any figure or table; this restriction is reported as a limitation.

## 2. Mapping rules

- **Targets are the 40 leaf nodes only.** The 15 parent nodes are aggregates
  (union of children at the job level, per `apply_dict.py`); mapping a skill
  directly to a parent would silently exclude it from matrix penetration. Any
  parent-level assignment from the legacy pipeline is re-assigned to a leaf or
  to *null*.
- **Single best leaf, or null.** Each skill is assigned the one leaf node whose
  construct contains the skill's primary meaning. If no node covers the primary
  meaning (the matrix is a business-curriculum framework, not an exhaustive
  taxonomy — e.g. clinical, hospitality or trade skills), the skill is left
  unmapped (*null*) rather than force-fitted.
- **Context rule.** Labels are interpreted as used in job postings for the
  three focal managerial occupations. Example: "modeling" reads as
  business/financial modeling, not fashion.
- **Confidence** is recorded per mapping:
  - **3** — clear construct containment; label is a direct instance of the node.
  - **2** — reasonable fit; the node is the best available home but the label
    is broader/narrower than the construct.
  - **1** — borderline; defensible but arguable. Retained, flagged in the
    dashboard, and excluded in a robustness variant.

## 3. AI-exposure rubric

Exposure = the degree to which **current generative-AI systems** can perform
the core task implied by the skill label, following the task-level exposure
logic of Eloundou et al. (2023) and Felten et al. (AIOE). Scored on [0.05,
0.95] with anchors:

| Anchor | Interpretation | Examples |
|---|---|---|
| **0.9** | AI performs the core task end-to-end with minimal oversight | drafting routine text, translation, summarization, data entry, boilerplate code, formatting |
| **0.7** | AI does most of the work; human validates | reporting, standard quantitative analysis, documentation, research synthesis, non-trivial code |
| **0.5** | Genuinely mixed; AI assists, human judgment integral | planning, budgeting, campaign design, vendor evaluation |
| **0.3** | Mostly human; AI peripheral | leadership, negotiation, coaching, original strategy, relationship management |
| **0.1** | Human bottleneck | embodied/physical work, deep relational trust, accountability-bearing roles |

Intermediate values are permitted. The score reflects the *task*, not current
adoption levels or the matrix category of the node the skill maps to
(**matrix-independence is preserved**: exposure is scored per skill label,
never inherited from the node).

## 4. Robustness layers

- The legacy **keyword rubric** (neutral 0.5 base ± 0.13 per HIGH/LOW keyword
  hit, clamped) is recomputed unchanged and reported as an independent second
  measure; skill-level agreement (Pearson/Spearman correlation, share within
  ±0.15) is reported in the dashboard Methodology tab.
- The legacy **embedding mapping** is retained in `skill_node_matches.csv`;
  the share of adjudicated mappings that agree with the embedding stage is
  reported, as is the distribution of confidence grades.
- The mechanisms analysis exposes the high/low exposure threshold as a slider
  (0.20–0.80); headline classifications use 0.50.
- Node-level exposure = mean of member-skill exposures (unchanged aggregation).

## 5. Outputs

Adjudications are stored as reviewable batch files
(`llm_review/batches/batch_*.json`), each entry
`[skill, leaf_node_or_null, confidence, exposure]`. The merge script
(`build_llm_review.py`) validates completeness and node-name integrity, then
regenerates: `node_skill_dictionary.json`, `skill_ai_exposure.json`,
`skill_exposure.js`, `node_ai_exposure.json`, and (via `apply_dict.py`)
`node_presence_2023_2026.csv`.

## 6. Known limitations

- Single-rater LLM adjudication; no second independent human rater. The
  keyword and embedding layers serve as partial cross-checks.
- Exposure is scored on skill *labels*, not firm-level task measurements.
- Skills below the frequency floor and unmapped by the embedding stage are not
  reviewed; their contribution to node penetration is bounded by their rarity.
