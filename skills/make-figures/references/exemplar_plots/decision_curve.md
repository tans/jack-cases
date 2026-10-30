# Exemplar anatomy — decision curve (net-benefit / DCA)

A worked **anatomy model** for a decision-curve (net-benefit) figure — the clinical-utility
counterpart to the ROC/PR discrimination plot and the calibration probability plot. A model can
discriminate and calibrate well yet still add no *decision* value over treating everyone or no one;
the decision curve is what shows whether acting on the model helps across a clinically plausible
range of thresholds. Complements `critic_rubrics/data_plot.md` §C/§G (this composes; the rubric
scores) and pairs with `analyze-stats` `references/templates/dca_plot.R` and the
`analyze-stats` `table-standards/table-types/incremental_value.md` added-value table. Synthetic —
describes *what each element must show* and the errors to avoid; not an image to copy, no real
citations.

## Elements
- **Threshold probability (x) vs net benefit (y)**. The x-axis is the risk threshold at which a
  patient/clinician would opt for the action (treat, biopsy, admit); the y-axis is net benefit, in
  units of *true positives per patient*, already penalised for false positives at that threshold.
- The **two reference strategies on every panel**: **treat-all** (a sloping line that crosses zero
  at the prevalence) and **treat-none** (the horizontal line at net benefit = 0). The model is
  useful only over the threshold range where its curve sits **above both** references.
- The **model curve(s)** across a stated, clinically justified **threshold range** (e.g. 5–40%),
  not a single point — the whole point is to show utility across the plausible decision region, and
  to name where that region comes from.
- When models are compared, **each model as its own curve** on the same axes (and, if shown, the
  same external data), so the reader sees over which thresholds one strategy dominates.
- The **operating threshold** the paper actually proposes, annotated on the curve, with the net
  benefit there — tying the figure back to the deployment decision.
- Built on the **validation/external** data with the model **calibrated** (see below), at a single
  stated horizon for time-to-event outcomes.

## Discipline (what the figure must not do)
- **Do not read net benefit as accuracy** — it is true positives minus weighted false positives;
  a curve only marginally above treat-all means little added utility even if AUROC looks strong.
- **Do not omit the treat-all and treat-none references** — a model curve alone is uninterpretable;
  utility is defined *relative* to acting on everyone or no one.
- **Do not show an uncalibrated model** — net benefit depends on the predicted probabilities, so a
  miscalibrated model gives a misleading curve; pair with `calibration_plot.md` and recalibrate
  first if needed.
- **Do not extend the threshold range past where decisions are actually made**, and do not let the
  curve wander into thresholds with no patients (cross-reference the predicted-risk distribution).
- **Do not quote a single "the model is better" threshold** without showing the range; report the
  interval over which the model dominates and name the proposed operating threshold.
- For time-to-event outcomes, **state the horizon** and use a censoring-aware net benefit; a naïve
  complete-case DCA over a censored cohort is biased.

## Common omission
- The **treat-all/treat-none references**, the **justified threshold range** (where the
  probabilities come from clinically), and **calibration before the curve** — the elements decision
  curves most often drop, and the ones that decide whether the figure supports a real
  *use-the-model* claim rather than a discrimination claim. Cross-reference
  `critic_rubrics/data_plot.md` §C/§G, the `peer-review/references/exemplar_reviews/calibration_missing.md`
  finding, `analyze-stats` `references/templates/dca_plot.R`, and the added-value table standard
  `analyze-stats` `references/table-standards/table-types/incremental_value.md`.
