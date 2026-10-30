# METRICS — radiomics methodological-quality appraisal

**METhodological RadiomICs Score (METRICS)** · EuSoMII-endorsed quality-scoring tool
Reference: Kocak B, et al. Insights Imaging 2024;15:8. doi:10.1186/s13244-023-01572-w (CC BY 4.0)
Tool / calculator: https://metricsscore.github.io/metrics/METRICS.html

> **This is an appraisal (methodological-quality) tool, NOT a reporting guideline.** It answers
> "was the radiomics study *done well* (low risk of bias)?", which is distinct from "was it
> *reported*?" (that is CLEAR — a reporting checklist). It therefore lives under `appraisal_tools/`
> and does **not** count toward the reporting-guideline catalog. Use it alongside, not instead of,
> the reporting checklist. Educational summary in our own words from the CC BY 4.0 source; complete
> the official weighted calculator for a submission-ready score and cite Kocak et al. 2024.

## Scope and how it scores

- Covers radiomics research from **handcrafted** features to **fully deep-learning** pipelines.
- **30 items across 9 categories.** Items carry **condition-dependent weights** and some categories
  are **conditional** (apply only when that step is present — e.g., manual segmentation, explicit
  feature selection); the official tool produces a weighted **percentage** with quality bands.
- Pair with the reporting checklist (CLEAR) and, for prediction-model risk of bias, PROBAST+AI —
  a fully *reported* radiomics paper can still be at high methodological risk of bias.

## Categories (9) and the concerns each covers

| # | Category (items) | Key methodological concerns |
|---|---|---|
| 1 | Study design (3) | Adherence to radiomics/ML guidance; eligibility describing a representative population; a high-quality reference standard. |
| 2 | Imaging data (4) | Multi-centre data; clinical translatability of the setting; imaging-protocol parameters reported; relevant temporal intervals documented. |
| 3 | Segmentation (3, *conditional*) | Transparent segmentation methodology; evaluation of automated segmentation; segmentation/masks available for the test set. |
| 4 | Image processing & feature extraction (3) | Preprocessing described; standardised/validated extraction software; transparent extraction parameters. |
| 5 | Feature processing (4, *conditional*) | Removal of non-robust features; removal of redundant features; dimensionality appropriate to sample size; robustness assessment for deep-learning features. |
| 6 | Preparation for modeling (2) | Proper data partitioning (no leakage between train/tune/test); handling of confounding factors. |
| 7 | Metrics & comparison (6) | Appropriate performance metrics; uncertainty (CIs); **calibration**; comparison against uni-parametric imaging, against non-radiomic predictors, and against classical/clinical models. |
| 8 | Testing (2) | Internal validation **and** external (independent) validation. |
| 9 | Open science (3) | Availability of data, code, and the trained model. |

## Non-waivable concerns (surface as a Critical gap if absent)

Consistent with the critical-item floor's appraisal note, the highest-yield METRICS concerns are:

- **Feature reproducibility / stability** — test–retest, inter-observer/segmentation stability, ICC-based filtering (category 5; segmentation, category 3).
- **Internal *and* external validation, with multiplicity control** — a single internal split is not
  enough for a generalisation claim (categories 6–8).
- **Calibration, not discrimination only** — a probability that drives a decision must be calibrated
  (category 7).
- **Leakage-controlled partitioning** — feature selection / preprocessing fit on pooled data, or the
  same data used for tuning and testing, inflates performance (category 6).

## How to use in the report

- This note backs the **Step 4f** appraisal cross-check (`critical_item_floor.md`, METRICS/RQS row).
  After the reporting item-by-item table, confirm the manuscript's chosen methodological-quality
  instrument and whether the non-waivable concerns above are met.
- Do **not** fold the METRICS score into the reporting compliance percentage — keep appraisal
  (risk of bias / quality) and reporting (completeness) separate, and do not assert a journal
  desk-reject threshold from either.
- For the exact item wording, weights, and quality bands, use the official EuSoMII calculator.
