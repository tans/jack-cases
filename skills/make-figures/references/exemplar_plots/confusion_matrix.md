# Exemplar anatomy — confusion matrix (classifier error structure)

A worked **anatomy model** for a confusion-matrix figure — the per-class error breakdown behind a
single accuracy number. Complements the `critic_rubrics/data_plot.md` §C *confusion matrix*
checklist (this composes; the rubric scores). Synthetic — describes *what each element must show*
and the errors to avoid; not an image to copy. Pairs with `exemplar_plots/roc_pr.md` (the
threshold-free discrimination side) and `analyze-stats`
`table-standards/table-types/diagnostic_accuracy.md`.

## Elements
- **TP / FP / FN / TN laid out as a 2×2 grid** (binary case) with **explicit axis labels**: one
  axis **Predicted (model)**, the other **Actual / Reference (truth)** — never leave the reader to
  guess which axis is which, and state the positive class.
- **Raw counts in every cell**, so totals and prevalence are recoverable; a percentage-only matrix
  hides the n behind each rate.
- **Row-normalized (recall / sensitivity) and column-normalized (precision / PPV)** views shown
  alongside the counts — recall normalizes over true class (rows), precision over predicted class
  (columns); the two answer different questions and must not be conflated.
- **The operating threshold stated** — a confusion matrix is a single point on the ROC/PR curve;
  give the probability cut-off used and how it was chosen (and on which data, not the test set).
- **Per-class metrics derivable and reported** (sensitivity, specificity, PPV, NPV, F1) with their
  CIs, rather than one global accuracy.
- **Diagonal emphasized** (heavier stroke or luminosity) only as a reading aid — correct predictions
  on the diagonal, errors off it.

## Discipline (what the figure must not do)
- **Do not let a high overall accuracy stand in for performance** — under class imbalance a
  classifier that always predicts the majority class scores high accuracy while the minority class
  fails completely; the off-diagonal recall for the rare class is the load-bearing number, and a
  class-imbalance caveat belongs in the caption.
- **Do not normalize ambiguously** — label whether percentages are over rows (recall), columns
  (precision), or the grand total; an unlabeled "%" cell is uninterpretable.
- **Do not present the matrix as threshold-free** — it is threshold-dependent; pair it with the
  ROC/PR curve (`roc_pr.md`) so the reader sees the whole operating range, not one chosen point.
- **Do not report the matrix on the data used to pick the threshold** — fix the threshold on
  derivation data and report the matrix on the held-out/test set.

## Multi-class extension
- For K classes, show the **K×K matrix** with the same Predicted/Actual axes; report **per-class**
  recall and precision plus a **macro-average** (unweighted over classes, so rare classes are not
  drowned out) alongside any micro/weighted average, and name which average each headline number is.

## Common omission
- The **dual row/column normalization (recall vs precision)**, the **stated operating threshold**,
  and the **class-imbalance caveat** — the elements confusion-matrix figures most often drop, and
  the ones that stop a high accuracy from hiding a failing minority class. Cross-reference
  `critic_rubrics/data_plot.md` §C (confusion matrix), `exemplar_plots/roc_pr.md`, and
  `analyze-stats` `table-standards/table-types/diagnostic_accuracy.md`.
