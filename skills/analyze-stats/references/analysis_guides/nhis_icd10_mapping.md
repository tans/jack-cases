# NHIS Claims-Based Disease Definition Guide

Methodological patterns for defining exposures, outcomes, and comorbidities
using ICD-10 codes in Korean NHIS claims data. This guide covers the validated
algorithm patterns -- NOT specific code lists for individual diseases.

---

## When to Use

- Defining study populations, exposures, or outcomes in NHIS cohort studies
- Building claims-based algorithms for disease ascertainment
- Validating disease definitions using multiple data sources within NHIS
- NOT for: survey data (KNHANES/NHANES), clinical registry data

---

## Core Principle: Claims-Based Algorithms

A single ICD-10 claim is insufficient for disease ascertainment due to rule-out
diagnoses, coding errors, and provisional codes. Validated algorithms combine
multiple data elements to improve positive predictive value.

### Algorithm Components

| Component | Source in NHIS | Purpose |
|-----------|---------------|---------|
| **ICD-10 diagnostic codes** | Inpatient + outpatient claims | Primary disease identification |
| **Medication prescriptions** | Pharmacy dispensing records | Confirms active treatment |
| **Procedure codes** | Claims procedure fields | Confirms diagnostic workup or treatment |
| **Health examination results** | National health exam data | Objective measurement (lab values, vitals) |
| **Visit frequency** | Claim count within time window | Distinguishes incident from rule-out |

---

## Validated Algorithm Patterns

### Pattern 1: N-Claim Rule (Most Common)

Require N or more claims with the target ICD-10 code within a defined time
window to establish a diagnosis.

```
Disease = (ICD-10 code X appears >= N times within T months)
```

| Stringency | Claims | Window | PPV | Use case |
|------------|--------|--------|-----|----------|
| Lenient | >= 1 claim | Any | Lower | Screening, sensitivity-focused |
| Standard | >= 2 claims | 12 months | Moderate | Most cohort studies |
| Strict | >= 3 claims | 12 months | Higher | Sensitivity analysis |

**Reporting template**:
"[DISEASE] was identified by at least [N] claims with ICD-10 codes [CODE
RANGE] within [T] months during the observation period."

### Pattern 2: Claim + Medication (Recommended for Chronic Diseases)

Combine diagnostic codes with disease-specific medication prescriptions.

```
Disease = (ICD-10 code X >= 1 time) AND (related medication dispensed >= 1 time)
```

**Reporting template**:
"[DISEASE] was defined as at least one claim with ICD-10 codes [CODE RANGE]
combined with a prescription for [MEDICATION CLASS] (ATC codes [RANGE])."

**Common medication validation pairs**:

| Disease category | ICD-10 pattern | Medication confirmation |
|-----------------|----------------|----------------------|
| Hypertension | I10-I15 | Antihypertensive agents (ATC C02-C09) |
| Diabetes mellitus | E10-E14 | Antidiabetic agents (ATC A10) |
| Hyperlipidemia | E78 | Lipid-modifying agents (ATC C10) |
| Coronary artery disease | I20-I25 | Antiplatelet + statin combination |
| Depressive disorders | F32-F33 | Antidepressants (ATC N06A) |
| Asthma | J45 | Inhaled corticosteroids / bronchodilators |

### Pattern 3: Look-Back Period for Incident Cases

To identify **incident** (new-onset) cases, require a disease-free washout
period before the index date.

```
Incident case = (ICD-10 code X after index date)
              AND (NO claims with code X during look-back period)
```

| Look-back | Strength | Trade-off |
|-----------|----------|-----------|
| 1 year | Minimum acceptable | May misclassify prevalent cases as incident |
| 3 years | Recommended | Better incident case identification |
| 5+ years | Strongest | Reduces sample size due to data availability |

**Reporting template**:
"To ensure the identification of incident cases, we applied a minimum [N]-year
look-back period and excluded individuals with any diagnostic claims for
[DISEASE] during this period."

### Pattern 4: Outcome Validation with Time Windows

For complications or sequelae, require temporal proximity to the index event.

```
Complication = (ICD-10 code Y within T1-T2 days after event X)
```

**Examples of time-window patterns**:

| Complication type | Window | Rationale |
|------------------|--------|-----------|
| Post-procedural complication | 0-30 days | Immediate perioperative period |
| Delayed complication | 30-90 days | Sub-acute period |
| Chronic sequela | 90 days - 1 year | Excludes acute phase, captures chronicity |
| Hospital admission for condition | Within 30 days of onset | Links admission to the triggering event |

### Pattern 5: Hierarchical Disease Classification

When exposure or outcome categories overlap, use a hierarchical scheme.

```
Level 1 (broadest): Any code in ICD-10 block (e.g., E10-E14 for all diabetes)
Level 2: Specific subcategory (e.g., E11 for type 2 diabetes only)
Level 3 (strictest): Subcategory + medication + lab confirmation
```

Sensitivity analyses should test multiple levels to assess robustness.

---

## ICD-10-KM vs ICD-10 Differences

Korean NHIS uses ICD-10-KM (Korean Modification), which is based on ICD-10
but includes Korea-specific extensions:

| Feature | ICD-10 (WHO) | ICD-10-KM |
|---------|-------------|-----------|
| Base structure | Same alphanumeric codes | Same base + Korean extensions |
| Additional codes | -- | U-codes for Korean-specific conditions |
| Version alignment | WHO updates | HIRA publishes annual Korean versions |
| Medication mapping | ATC codes | ATC codes (same international standard) |

For most major disease categories (cardiovascular, metabolic, respiratory,
neurological), the ICD-10-KM codes are identical to international ICD-10.
Country-specific extensions primarily affect rare or culture-bound conditions.

---

## Charlson Comorbidity Index in NHIS

The CCI is computed from claims using the Quan adaptation for ICD-10:

| CCI Category | Standard grouping |
|-------------|-------------------|
| 0 | No comorbidities |
| 1 | Single comorbidity point |
| >= 2 | Multiple comorbidities |

Always specify which CCI adaptation was used (Quan 2005 is standard for
ICD-10 claims data).

---

## Covariate Definitions from NHIS Data Sources

NHIS integrates three data sources, each providing different covariate types:

### Source 1: Claims Database
- Comorbidities (via ICD-10 codes)
- Medication history (via dispensing records)
- Healthcare utilization (visit counts, hospitalization days)

### Source 2: National Health Examination
- BMI, blood pressure, fasting glucose, GFR
- Liver enzymes (AST, ALT, gamma-GTP)
- Hemoglobin, total cholesterol
- Urinalysis

### Source 3: Health Interview / Questionnaire
- Smoking status (never / former / current)
- Alcohol consumption (frequency categories)
- Physical activity (MET-based sufficiency)
- Region of residence, household income level

**Baseline alignment**: Covariates must be anchored to the most recent data
available **prior to** the index date. Do not use post-index measurements.

---

## Sensitivity Analysis Patterns

### Stricter Disease Definition
Run the primary analysis with the standard algorithm, then repeat with a
more stringent definition (e.g., 2-claim → 3-claim, or adding medication
confirmation).

### Negative Control Outcomes
Select outcomes with no plausible biological link to the exposure (e.g.,
neuromuscular junction disorders, self-harm) to detect residual confounding
or coding artifacts.

### Negative Control Exposures
Use an exposure with no expected effect on the outcome as a falsification test.

### Multiple Look-Back Periods
Test 1-year, 3-year, and 5-year look-back periods and compare incidence rates
to assess the impact of prevalent case misclassification.

---

## Reporting Checklist

When reporting NHIS claims-based definitions in a manuscript:

- [ ] ICD-10 code ranges specified (main text or supplementary table)
- [ ] Number of claims required (1 vs 2+ vs with medication)
- [ ] Time window for claims (within 12 months, any time, etc.)
- [ ] Look-back period for incident case definition
- [ ] Medication confirmation specified with ATC codes (if used)
- [ ] Data source specified (claims vs exam vs questionnaire)
- [ ] CCI adaptation cited (Quan 2005 or other)
- [ ] Sensitivity analysis with alternative definition included

---

## Common Reviewer Flags

1. Single-claim definition without justification (low PPV concern)
2. No look-back period for "incident" cases
3. Mixing ICD-10 and ICD-9 codes without noting transition dates
4. Not specifying whether inpatient, outpatient, or both claims were used
5. CCI version not cited
6. Covariate timing not anchored to index date
7. Missing sensitivity analysis with stricter/looser definitions
8. Rule-out diagnoses not addressed (diagnostic codes without treatment)

---

## References (Methodological)

- Quan H et al. Coding algorithms for defining comorbidities in ICD-9-CM
  and ICD-10 administrative data. Med Care. 2005;43(11):1130-9.
- Choi JY et al. Validation of administrative data for the identification
  of chronic diseases in South Korea. J Korean Med Sci. (methodology reference)
- NHIS data user guide: nhiss.nhis.or.kr (Korean National Health Insurance
  Sharing Service)
