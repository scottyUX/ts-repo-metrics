export interface RubricDefinition {
  keys: string[];
  prompt: string;
}

export const RUBRICS: Record<string, RubricDefinition> = {
  release_plan: {
    keys: [
      "heading_complete",
      "high_level_goals_present",
      "user_stories_present",
      "user_stories_format",
      "story_points_present",
      "sprint_assignment_present",
      "unique_story_ids",
      "priority_indicated",
      "product_backlog_present",
      "capacity_check_present",
    ],
    prompt: `
Checklist criteria — evaluate each independently:
- heading_complete: Heading contains all of: document name, product name, team name,
  release name, release date, revision number, revision date (6+ fields)
- high_level_goals_present: At least one concrete high-level goal is described
- user_stories_present: At least one user story is listed
- user_stories_format: User stories follow "As a {role}, I want {goal}" format
- story_points_present: Each user story has a story point estimate
- sprint_assignment_present: Each user story is assigned to a specific sprint (Sprint 1, Sprint 2, etc.)
- unique_story_ids: User stories have unique labels or identifiers (US-1, 1.1, etc.)
- priority_indicated: Priority is shown either by ordering or explicit label
- product_backlog_present: A product backlog section exists listing stories not in this release
- capacity_check_present: There is mention of team capacity, velocity estimate, or sanity
  check of total story points against team capacity
    `.trim(),
  },

  sprint_plan: {
    keys: [
      "heading_complete",
      "sprint_goal_present",
      "user_stories_present",
      "user_stories_format",
      "tasks_under_stories",
      "time_estimates_present",
      "estimates_within_6h",
      "story_totals_present",
      "team_roles_listed",
      "initial_task_assignment",
      "scrum_times_listed",
      "ta_visit_indicated",
      "capacity_reserved",
      "acceptance_criteria_present",
      "user_stories_valuable",
      "no_epic_stories",
      "task_descriptions_specific",
    ],
    prompt: `
Checklist criteria — evaluate each independently. For each key return true (pass) or false (fail).

Also count the total number of user stories in the document and return it as user_story_count.

- heading_complete: Heading contains document name ("Sprint N Plan"), product name, team name, sprint completion date, revision number, revision date. PASS: "Sprint 1 Plan | Team Rocket | Due: May 15 | Rev 1.0 | 2026-04-01". FAIL: Just a title with no metadata.
- sprint_goal_present: A sprint goal section exists with 1–2 sentences describing the objective. PASS: "Sprint Goal: Deliver user login and profile creation." FAIL: No sprint goal section, or goal is missing.
- user_stories_present: At least one user story is listed. PASS: Any story in "As a / I want" format. FAIL: No stories at all.
- user_stories_format: Every story follows "As a {role}, I want {goal} [so that {reason}]" format. PASS: All stories match this template. FAIL: Any story is written as a plain requirement or task description.
- user_stories_valuable: Every story describes a user-facing action with clear benefit. PASS: "As a player, I want to save my progress so that I can resume later." FAIL: "As a developer, I want to set up the database schema." Technical tasks disguised as stories fail this check.
- no_epic_stories: No single story is so large it would consume the entire sprint. PASS: Stories are scoped to discrete features completable in days. FAIL: "As a user, I want a fully functional e-commerce system" — obvious epic not broken down.
- acceptance_criteria_present: Each user story has at least 2 specific, testable acceptance criteria. PASS: Story followed by "AC: 1) Login redirects to dashboard. 2) Invalid credentials show error message." FAIL: No acceptance criteria, or only vague statements like "feature works correctly."
- tasks_under_stories: Each user story has at least one task listed beneath it. PASS: Story followed by indented task list. FAIL: Stories with no tasks under them.
- task_descriptions_specific: Tasks use an action verb and name a specific deliverable. PASS: "Code login API endpoint (4h)", "Write unit tests for user model (3h)", "Design database schema (2h)". FAIL: "Backend work", "Do testing", "Help with feature", "Work on sprint."
- time_estimates_present: Hour estimates are provided for individual tasks. PASS: Each task has "(Xh)" or "X hours" notation. FAIL: Tasks with no time estimates.
- estimates_within_6h: All individual task time estimates are 6 ideal hours or less. PASS: Largest task is 6h. FAIL: Any single task estimate exceeds 6 hours (e.g. "Implement entire backend (16h)").
- story_totals_present: Total hours per user story are summed and shown. PASS: "Total: 14h" at the end of a story's task list. FAIL: No story-level totals.
- capacity_reserved: Team capacity calculation reserves approximately 15% buffer — total committed hours are less than 100% of available hours. PASS: "Team capacity: 80h, committed: 68h (15% buffer)". FAIL: 100% of available hours committed with no buffer mentioned.
- team_roles_listed: All team members are listed with at least one Scrum role each (PO, SM, Dev). PASS: "Alice – Scrum Master, Bob – Product Owner, Carol – Dev". FAIL: Names listed with no roles, or roles missing entirely.
- initial_task_assignment: Each team member is assigned an initial user story and task. PASS: Each person has at least one task assigned to them by name. FAIL: Tasks listed with no assignees.
- scrum_times_listed: At least 3 scheduled scrum meeting days and times are listed. PASS: "Mon/Wed/Fri 10am, Thu 2pm TA visit". FAIL: No meeting schedule, or fewer than 3 times listed.
- ta_visit_indicated: One of the scrum times is identified as the TA/tutor visit. PASS: One meeting labeled "TA visit" or "tutor check-in". FAIL: No TA visit identified in the schedule.
    `.trim(),
  },

  sprint_report: {
    keys: [
      "heading_complete",
      "stop_section_present",
      "stop_has_explanations",
      "start_section_present",
      "start_has_explanations",
      "keep_section_present",
      "keep_has_explanations",
      "completed_stories_listed",
      "incomplete_stories_listed",
      "velocity_metrics_present",
      "velocity_rates_present",
      "cumulative_velocity_present",
      "burnup_chart_present",
      "burnup_data_present",
    ],
    prompt: `
Checklist criteria:
- heading_complete: Heading contains document name ("Sprint N Report"), product name,
  team name, date
- stop_section_present: An "actions to stop doing" section exists
- stop_has_explanations: Each stop item has both a description AND a reason/explanation
- start_section_present: An "actions to start doing" section exists
- start_has_explanations: Each start item has both a description AND a reason/explanation
- keep_section_present: An "actions to keep doing" section exists
- keep_has_explanations: Each keep item has both a description AND a reason/explanation
- completed_stories_listed: A list of user stories completed during the sprint is present
- incomplete_stories_listed: Stories that were planned but not completed are listed,
  OR there is an explicit statement that all planned stories were completed
- velocity_metrics_present: total stories completed, total ideal hours completed, total sprint days
- velocity_rates_present: Stories/day and hours/day rates are explicitly stated
- cumulative_velocity_present: For sprint 2+ cumulative averages reported; true for sprint 1
- burnup_chart_present: A burnup or burndown chart image is included or referenced (e.g. ![burnup](burnup.png)). The AI cannot evaluate image quality — presence of a chart reference is sufficient to pass. PASS: Any image reference for a chart. FAIL: No chart image or reference anywhere.
- burnup_data_present: A day-by-day data table of completed hours per sprint day is present in the document. This is independent of burnup_chart_present — a student may have the chart without the table or vice versa. PASS: Table showing sprint day vs completed hours. FAIL: No data table present. When true, provide coach feedback on: whether the table covers all sprint days, whether data was recorded daily (after each Scrum meeting), whether an ideal trend line or total is referenced, and whether the completion trajectory is plausible.
    `.trim(),
  },

  test_plan: {
    keys: [
      "heading_complete",
      "scenarios_present",
      "scenarios_reference_stories",
      "scenarios_have_steps",
      "scenarios_have_inputs",
      "scenarios_have_expected_output",
      "scenarios_have_pass_fail",
      "unit_tests_referenced",
      "unit_test_results_noted",
    ],
    prompt: `
Checklist criteria:
- heading_complete: Heading contains "Test Plan and Report", product name, team name, date
- scenarios_present: At least one system test scenario is described
- scenarios_reference_stories: Scenarios linked to user stories
- scenarios_have_steps: Each scenario has numbered step-by-step interactions
- scenarios_have_inputs: Steps include specific inputs or placeholders like <username>
- scenarios_have_expected_output: Each scenario states expected system behavior
- scenarios_have_pass_fail: Each scenario marked Pass or Fail
- unit_tests_referenced: Unit test section references directory, file, or framework
- unit_test_results_noted: Pass/fail status of unit tests is noted
    `.trim(),
  },
};

export const STRUCTURED_DOC_TYPES = new Set([
  "release_plan",
  "sprint_plan",
  "sprint_report",
  "test_plan",
]);

export const HOLISTIC_DOC_TYPES = new Set([
  "definition_of_done",
  "code_standards",
]);

export const DOD_CONTEXT = `
This is a Definition of Done document. Evaluate it holistically and provide strengths and coach feedback.

A good Definition of Done has TWO required sections:

1. TASK-LEVEL DoD ("Did you build the thing right?" — engineering perspective)
   Required categories: code checked into repository, code reviewed by a team member, unit tests defined and passing, non-functional tests (usability/performance) considered.
   GOOD criterion: "Code reviewed by at least one team member before merge into main"
   BAD criterion: "Code is clean", "Quality is good" (vague, not verifiable)

2. USER STORY-LEVEL DoD ("Did you build the right thing?" — user perspective)
   Required categories: all tasks for the story are done, acceptance criteria tests passed, inspected and accepted by Product Owner.
   GOOD criterion: "All acceptance criteria tests pass and are documented"
   BAD criterion: "Feature works correctly" (not testable)

Evaluate on these dimensions and call out specific issues by name:
- Coverage: does it have both task-level and story-level sections?
- Specificity: are criteria specific and verifiable, or vague?
- Simplicity: 5–10 meaningful items per section is ideal; flag if too sparse (<3) or too long (>12 total)
- Consistent applicability: criteria should apply to all work items, not be story-specific
- Missing categories: flag if code review, testing, or repo check-in are absent from task DoD; flag if PO acceptance is absent from story DoD

Return strengths (what is specific and enforceable) and improvements (what is vague, missing, or not consistently applicable).
`.trim();

export function codeStandardsContext(detectedLanguages: string[]): string {
  return `
This is a coding standards document for a repository using: ${detectedLanguages.join(", ") || "unknown languages"}.
Evaluate it holistically and provide strengths and coach feedback.

A good coding standards document:
1. References an established style guide rather than inventing rules from scratch.
   GOOD: "We follow Google Java Style Guide" or "We use ESLint with Airbnb config"
   BAD: Entirely custom rules with no established standard cited

2. Addresses naming conventions specifically for the languages used.
   - Variable names: accurate, purposeful, pronounceable, length matches scope
   - Function names: describe what they do — flag vague verbs like handleCalcs(), processInput(), doStuff()
   - No magic numbers — named constants required
   GOOD: "All boolean variables use is/has prefix (isLoggedIn, hasPermission)"
   BAD: "Use good variable names"

3. Specifies formatting rules.
   Must address: indentation (spaces vs tabs, how many), whitespace usage, brace/parenthesis placement.
   GOOD: "Use 2-space indentation, opening brace on same line as declaration"
   BAD: No formatting rules at all

4. Encourages best practices.
   Look for: DRY (Don't Repeat Yourself), single responsibility, clarity over cleverness.
   Slides: "Ease of reading and understanding is more important than ease of writing/clever coding"

5. Is language-appropriate.
   Standards should reference the actual languages in this repo (${detectedLanguages.join(", ") || "unknown"}).
   Flag if standards are completely generic and don't mention the actual stack.

Evaluate on all five dimensions. Return strengths (what is specific and enforceable) and improvements (what is vague, generic, missing, or not matched to the repo's languages).
`.trim();
}
