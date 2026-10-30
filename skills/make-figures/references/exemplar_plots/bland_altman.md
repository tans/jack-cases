# Exemplar anatomy — Bland–Altman agreement plot (two continuous methods)

A worked **anatomy model** for a Bland–Altman figure — the agreement counterpart to a method-
comparison scatter. Complements the `critic_rubrics/data_plot.md` §C *Bland–Altman* checklist
(this composes; the rubric scores). Synthetic — describes *what each element must show* and the
errors to avoid; not an image to copy. Pairs with `analyze-stats`
`table-standards/table-types/agreement.md` (the LoA / ICC reliability table).

## Elements
- **Difference (y) vs mean of the two methods (x)** — y = (method A − method B), x = (A + B)/2.
  Plotting the difference against *one* method (e.g., the reference) induces a spurious slope; the
  mean of the two is the correct abscissa.
- **Bias line** = the mean difference, drawn horizontally, with its value and **95% CI** printed.
- **95% limits of agreement (LoA)** = bias ± 1.96·SD of the differences, drawn as two horizontal
  lines, with **a confidence interval on each limit** (the LoA are themselves estimates and are
  wide at small n) — show the CI as a footnote value or a shaded band around each LoA.
- **The a-priori clinically acceptable difference band** overlaid, so the reader can see at a glance
  whether the LoA fall inside the margin that was defined *before* the analysis.
- **Proportional-bias check**: a regression of the difference on the mean; if the slope is non-zero
  (the cloud fans out or tilts), state it and model the SD or log-transform rather than quoting a
  single constant LoA.
- **% of points within the LoA** annotated (≈95% expected) and **scatter points not clipped** at the
  plot edges — outliers beyond the LoA are the most informative points and must remain visible.
- **Units stated on both axes** (the difference is in measurement units, not %), and n pairs given.

## Discipline (what the figure must not do)
- **It is not a correlation/regression plot** — do not report Pearson r or R² as evidence of
  agreement. High correlation is fully compatible with large systematic bias; correlation measures
  association along a line, not closeness to identity.
- **Do not quote a single constant LoA when bias is proportional** — if the differences widen with
  magnitude (heteroscedasticity), constant ±1.96·SD limits are wrong across the range; log-transform
  or model the SD as a function of the mean.
- **Do not omit the CI on the LoA** — at small n the limits are imprecise, and an LoA that looks
  inside the acceptability margin may not be once its upper CI is shown.
- **Handle repeated measures correctly** — with multiple pairs per subject, the naïve SD of all
  differences understates variability; use a repeated-measures Bland–Altman (variance-components)
  method and report the number of replicates per subject.
- **Clinical acceptability is a pre-specified judgement**, not read off the plot after the fact —
  state the margin and its source, and conclude agreement only if the LoA (with CI) fall inside it.

## Common omission
- The **CI on the limits of agreement**, the **proportional-bias check**, and the **pre-defined
  clinical-acceptability band** — the elements Bland–Altman figures most often drop, and the ones
  that decide whether two methods are interchangeable rather than merely correlated. Cross-reference
  `critic_rubrics/data_plot.md` §C (Bland–Altman) and `analyze-stats`
  `table-standards/table-types/agreement.md`.
