# Doctoral Consortium Application Plan (SIGCSE Virtual 2026)

A simple, plain-language plan for putting together the doctoral consortium
application. No jargon.

## What we are submitting

- **Where:** SIGCSE Virtual 2026, submitted on EasyChair
  (https://easychair.org/conferences/?conf=sigcsev2026)
- **Category:** Doctoral consortium
- **Deadline:** Friday, 17 July 2026 (end of day, anywhere on earth)
- **Who:** Scott Davis, UC Santa Cruz (only author on the main write-up)
- **First time:** Yes, this is a first application to this consortium
- **Format:** One PDF with two parts:
  1. A 2-page research summary (using the required ACM template)
  2. A few appendices (a CV, a feedback request, and a timeline diagram)

## The research, in one paragraph

Students now use AI tools (like ChatGPT and Cursor) all the time when they
write software. But most studies treat "using AI" as one single thing. This
research looks more closely: it separates *how often* students use AI from
*how well* they use it, and it does this across the different stages of a
project (planning, building, testing, and so on). We also look at the actual
student code and project history to see whether AI-era projects look different
from projects built before these tools existed.

**Working title:** *How Students Use AI Well (Not Just Often) Across the
Stages of a Software Project.*

## What is already done vs. still to do

**Already done (safe to describe as finished):**
- A survey that measures how often and how well students use AI at each stage
- The survey ran twice and gave consistent results
- A tool that reads student code and project history and produces numbers we
  can compare
- Two sets of student projects picked and matched up: one from 2021 (before
  these AI tools) and one from 2026 (with AI tools)

**Still to do (describe as expected/future work):**
- The actual side-by-side comparison of the 2021 and 2026 projects
- Connecting the survey answers to what we see in the code
- Turning the findings into concrete advice for teachers

## Step 1: Decide what to compare (do this first)

Before writing anything about the code comparison, pick a short list of things
to measure (about a dozen, not fifty). Group them by the question they answer:

| Question | What we measure | What we expect to find |
|---|---|---|
| How do work habits differ? | How often students commit code, and how big those commits are | AI-era work may come in bigger, less frequent chunks |
| Do students check their work? | How much testing is present in the project | AI-era projects may have less checking |
| Is the code harder to follow? | How complex and readable the code is | AI code can look short but still be hard to follow |
| Are there warning signs? | Errors that get silently ignored, or files that do too much | AI-era projects may show more of these |

**One thing to fix first:** the tool did not fully read the 2021 projects the
last time it ran (it reported zero files). That needs to be fixed and re-run
before any comparison is trustworthy.

Write this decision down in a short file (`research/dc/COMPARISON_METRICS.md`)
so the plan is clear and repeatable.

## Step 2: Write the 2-page research summary

Use the official ACM template (the two-column conference format, US Letter
size). The summary is limited to **2 pages**, with references allowed on a
third page. Only Scott is listed as the author.

Use these section headings (they are recommended by the consortium):

| Section | About how long | What goes here |
|---|---|---|
| Abstract | ~250 words | A short preview of the whole thing |
| Context and motivation | short | Why this matters and what's missing today |
| Background | short | A few key related studies |
| Problem statement | short | The gap this work fills |
| Research goals | short | What we're trying to learn |
| Research methods | medium | How we do it (survey + reading code) |
| Current contributions | medium | What's already done and shown |
| Expected contributions | short | What's coming next |
| References | (page 3) | About 15–20 sources |

Keep the finished survey results as the strongest part. Describe the code
comparison as "coming next" unless the numbers are solid before July 14.

## Step 3: Write the appendices

These do not use any template and are not published.

- **Appendix A — CV (1–2 pages):** education, research focus, any papers or
  submissions, teaching, tools built, and service.
- **Appendix B — Feedback request (one paragraph):** a few questions asking the
  mentors for advice, plus a note that this is a first doctoral consortium.
  Sample questions:
  1. Does the overall story of the dissertation hold together?
  2. With only a small number of projects to compare, which measurements are
     most convincing?
  3. How should the survey results and the code results be presented together
     without confusing them?
  4. How should the work be split into dissertation chapters?
  5. The study is at one school with AI-savvy students — how could it be made
     more general?
- **Appendix C — Timeline diagram (1 page max):** a simple timeline showing the
  research activities, roughly when each happens, and which ones depend on
  others. Also note which parts are *not* part of the dissertation (for
  example, tool-building done with students, or ideas left for future work).

## Step 4: Put it together and submit

1. Build the 2-page summary and confirm it really is 2 pages.
2. Add the CV, feedback request, and timeline pages after it.
3. Double-check only Scott is named on the main summary.
4. Confirm the ACM SIGCSE membership needed to take part.
5. Upload the single PDF to EasyChair under "Doctoral consortium."
6. Keep the editable source, since accepted applicants revise with feedback.

## Timeline (July 6 to July 17)

Because there are only about eleven days, writing and analysis happen at the
same time. The submission does **not** depend on finishing the code
comparison.

| Days | What to do |
|---|---|
| Jul 6–8 | Decide what to compare; start the ACM template |
| Jul 8–10 | Draft the 2-page summary from the finished survey work |
| Jul 10–12 | Best effort on the code comparison; use results only if solid |
| Jul 12–14 | Write the appendices; trim the summary to exactly 2 pages |
| Jul 15 | Build the full PDF; get advisor review |
| Jul 16 | Make fixes; recheck page limits and author name |
| By Jul 17 | Upload to EasyChair |

## Things to watch out for

- **Page limit is strict.** The full research paper will not fit. Use it as a
  source to pull from, not something to paste in.
- **Don't overclaim.** Only present the code comparison as finished if the
  numbers are ready. Otherwise call it future work.
- **Keep the two kinds of results separate.** Survey answers and code
  measurements are different things and should not be mixed up.
- **One author on the main summary.** Co-authors and advisors can be mentioned
  in the CV, not on the 2-page research summary.
