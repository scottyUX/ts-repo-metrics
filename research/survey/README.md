# Survey replication pipeline (SIP Sprint 1 — Objective 2)

Reproduce paper statistics (Friedman, Pearson, Cronbach's α) for the new Qualtrics cohort.

## Layout

```
research/survey/
├── README.md                 # this file
├── requirements.txt          # added by Student B in Sprint 1
├── data/
│   ├── raw/                  # gitignored — instructor Qualtrics export
│   └── processed/            # gitignored — cleaned responses
├── outputs/                  # gitignored — replication_report.md, tables
├── clean_qualtrics.py
├── stats_reliability.py
├── stats_friedman.py
├── stats_correlations.py
└── run_all.sh                # one-command reproducibility
```

## Getting started

1. Wait for instructor kickoff packet (see [`../KICKOFF_CHECKLIST.md`](../KICKOFF_CHECKLIST.md)).
2. Place de-identified export in `data/raw/`.
3. Follow story **SIP-1.2** on GitHub for task checklist.

## Column reference

The export has 72 columns; meanings grouped below.

### Linkage and demographics

- `ResponseId` — unique Qualtrics response key
- `Finished` / `Progress` — completion flags (`Finished == True` / `Progress == 100`)
- `Consent` — IRB consent
- `GitHub Handle` — GitHub username
- `Team Repo URL` — team project repository URL
- `YearsProgExperience` — prior programming experience
- `GenAI_Tools` — GenAI tools used on the project (multi-select)
- `GenAI_Tools_6_TEXT` — "Other" GenAI tools (textbox)
- `GenAI_Frequency` — project-level GenAI usage frequency
- `Q22` — paid/premium GenAI subscription status

### Global constructs (`Literacy_FC_1` … `Literacy_FC_5`)

Five global Likert items (1 = Strongly Disagree, 5 = Strongly Agree) asked once per respondent, not repeated by SDLC phase. Items `_1`–`_3` are **AI literacy**; `_4`–`_5` are **facilitating conditions**.

- `Literacy_FC_1` (**AI literacy**) — *"I can evaluate the accuracy and reliability of GenAI responses."* Measures whether students critically judge whether AI output is trustworthy before acting on it.
- `Literacy_FC_2` (**AI literacy**) — *"I can identify errors, bias, or privacy issues in GenAI outputs."* Measures awareness of quality, fairness, and safety risks—not just whether the answer "looks right."
- `Literacy_FC_3` (**AI literacy**) — *"I can integrate GenAI responses with other technical sources."* Measures ability to combine AI suggestions with docs, code, teammates, or other references rather than treating AI as the sole authority.
- `Literacy_FC_4` (**Facilitating conditions**) — *"I have the resources and IDE setup needed to use GenAI tools effectively."* Measures whether the student's environment (tools, access, workflow) supports effective GenAI use—not skill or attitude alone.
- `Literacy_FC_5` (**Facilitating conditions**) — *"I can easily find help or documentation if I encounter issues with GenAI tools."* Measures access to support when stuck (docs, forums, course resources).

Column name uses `Literacy_FC_` because items `_1`–`_3` map to literacy and `_4`–`_5` map to facilitating conditions in one Qualtrics block.

### Per-phase TAM (`{Phase}_TAM_1` … `_4`)

Same construct meaning at every stage; survey wording is stage-specific. Phase prefixes: `Planning_`, `Design_`, `Impl_`, `Testing_`, `Deployment_`, `Maintenance_` (Implementation uses abbreviated prefix `Impl_`).

- `_TAM_1` (**PEOU**) — learning to use GenAI for this phase was easy
- `_TAM_2` (**PU**) — GenAI improved performance/efficiency in this phase
- `_TAM_3` (**BI**) — intention to use GenAI for future work in this phase
- `_TAM_4` (**AU**) — frequency/intensity of GenAI use in this phase

### Per-phase AUM (`{Phase}_AUM_1` … `_3`)

- Composite of iterative refinement, verification, and contextual grounding
- Planning example: structured goals (`_AUM_1`), iteratively refined plans (`_AUM_2`), checked against requirements (`_AUM_3`)
- Other phases reuse the same three dimensions with stage-specific wording (see row 2 of the CSV)

### Qualtrics metadata

- `StartDate`, `EndDate`, `RecordedDate` — response start, end, and record timestamps
- `Duration (in seconds)` — time spent on the survey
- `Status` — Qualtrics response status (e.g. IP Address)
- `DistributionChannel` — how the survey was accessed (e.g. anonymous link)
- `UserLanguage` — survey display language
- `IPAddress` — respondent IP address from Qualtrics
- `RecipientLastName`, `RecipientFirstName`, `RecipientEmail` — recipient fields (empty for anonymous links)
- `ExternalReference` — external data reference field
- `LocationLatitude`, `LocationLongitude` — approximate geolocation from IP