import Link from "next/link";

const HANDOUT = "https://github.com/scottyUX/AI-Augmented-Software-Engineering/blob/main/resources/cse115a-sprint-task-specifications.md";

const STEPS = [
  { href: "#sign-in", label: "Sign in" },
  { href: "#install", label: "Install the app" },
  { href: "#another-repo", label: "Another repository" },
  { href: "#task-file", label: "Task file" },
  { href: "#pull-request", label: "Pull request" },
  { href: "#submit", label: "Submit" },
  { href: "#faq", label: "FAQ" },
] as const;

const FAQS = [
  {
    q: "Why is the install box still on the page after I installed the app?",
    a: "The box is the way to install the app on a repository. It stays so you can add a second repository later. It is not asking again. The popup opens only when a pull request check cannot read the repository you pasted.",
  },
  {
    q: "Does every teammate install the GitHub App?",
    a: "No. One teammate installs AIAugmentedSWE on the team repository. After that, anyone with write access can add a pull request. Each person still connects their own GitHub account so the site knows which pull requests are theirs.",
  },
  {
    q: "I installed it on my personal account, and my team repository still fails.",
    a: "The app is installed per account, on the repositories you select. On the GitHub screen, choose the account that owns the team repository. Configure means it is already installed on that account. A row with an arrow is not installed yet.",
  },
  {
    q: "Can I submit from a different repository than the one I used before?",
    a: "Yes. Install the app on the new repository, then click Change PR and paste the new merged pull request. You can do that until you submit the sprint.",
  },
  {
    q: "I got a 404.",
    a: "A red message that says GitHub could not load this pull request (404) means GitHub could not see that pull request or a file in it. Check the URL, and check that the app is installed on that repository. When the app is missing, the page says so in words and does not show the number 404.",
  },
  {
    q: "The page says my GitHub account cannot push.",
    a: "The account you connected needs write access on that repository. Ask the repository owner to add you, then click Re-check. A personal install of the app does not grant you write access.",
  },
  {
    q: "Do I need a Tests section in the task file?",
    a: "No. The task file needs a title plus Description, Specs, Requirements, and Acceptance criteria. Test quality is scored from the test files in the pull request.",
  },
  {
    q: "Where does the task file go?",
    a: "docs/tasks/sprint-N/YOUR-ID.md, and N must match the sprint number in the file. The filename, without .md, must match the id in the front matter.",
  },
  {
    q: "The first check says the task file was not committed first.",
    a: "The first commit on the branch has to be the task file alone, tagged YOUR-ID-base. That cannot be repaired on the same pull request. Start a new task.",
  },
  {
    q: "Can I fix a wrong branch name?",
    a: "No. The task ID has to be in the branch name when you open the pull request. Edit the pull request title if only the title is wrong, then click Re-check. A wrong branch needs a new pull request.",
  },
  {
    q: "Who has to open the pull request?",
    a: "You do, from the GitHub account you connected. A teammate can review it. If someone else opened it, that check cannot be fixed on this pull request.",
  },
  {
    q: "What are the two tags?",
    a: "YOUR-ID-base points at the first commit, the one that adds only the task file. YOUR-ID-done points at the merge commit on the default branch. Push the done tag before you paste the pull request.",
  },
  {
    q: "I added a pull request. Can I replace it?",
    a: "Yes, until you submit the sprint. Click Change PR and paste a merged pull request. It can be from the same repository or a different one.",
  },
  {
    q: "I already submitted. Can I change a task?",
    a: "Click Change submission before the sprint deadline, and before a grade is released. That withdraws the sprint so you can edit. Submit again when both tasks are ready.",
  },
  {
    q: "Why are Sprint 1 and Sprint 5 missing?",
    a: "This term you submit Sprint 2, Sprint 3, and Sprint 4. The buttons use those numbers. They are not renamed.",
  },
  {
    q: "How is the sprint score calculated?",
    a: "Each task is out of 10: Scope 1, Specs 2, Acceptance criteria 2, Test quality 2, Tests pass 2, and Process 1. The sprint score is the average of your two tasks.",
  },
  {
    q: "Does the research question affect my grade?",
    a: "No. Yes or no only decides whether your tasks may be included in a research dataset. You can change the answer later.",
  },
  {
    q: "What does the Scrum board checkbox do?",
    a: "It records that you put a card on your team’s board. The site cannot see the board, so the check is yours to confirm.",
  },
] as const;

const SignInFigure = () => (
  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-hidden>
    <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
      <span className="size-2 rounded-full bg-slate-300" />
      <span className="size-2 rounded-full bg-slate-300" />
      <span className="size-2 rounded-full bg-slate-300" />
      <span className="ml-2 text-xs text-slate-500">tasks.grepthink2.com</span>
    </div>
    <div className="space-y-3 p-4">
      <p className="text-sm font-semibold text-slate-900">CSE 115A · Fall 2026</p>
      <div className="flex gap-2">
        <span className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white">Sprint 2</span>
        <span className="rounded-md border border-slate-300 px-3 py-1 text-xs">Sprint 3</span>
        <span className="rounded-md border border-slate-300 px-3 py-1 text-xs">Sprint 4</span>
      </div>
      <div className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600">Paste a merged pull request for Task 1 and Task 2.</div>
    </div>
  </div>
);

const InstallFigure = () => (
  <div className="space-y-3" aria-hidden>
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white">
      <p className="text-xs">One teammate installs the course GitHub App on your repository.</p>
      <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-slate-900">Install the GitHub App</span>
    </div>
    <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-slate-100">
      <p className="border-b border-slate-800 px-4 py-3 text-sm font-semibold">Install AIAugmentedSWE</p>
      <ul className="divide-y divide-slate-800 text-sm">
        <li className="flex items-center justify-between px-4 py-2"><span>your-name</span><span className="text-xs text-slate-400">Configure</span></li>
        <li className="flex items-center justify-between px-4 py-2"><span>team-org</span><span className="text-slate-400">›</span></li>
      </ul>
    </div>
  </div>
);

const TaskFileFigure = () => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 font-mono text-xs leading-6 text-slate-800" aria-hidden>
    <p className="text-slate-500">docs/tasks/sprint-2/US-2-T-1.md</p>
    <p>id: US-2-T-1</p>
    <p>sprint: 2</p>
    <p>estimate_hours: 3</p>
    <p className="mt-2 text-slate-500"># Short title</p>
    <p>## Description</p>
    <p>## Specs</p>
    <p>## Requirements</p>
    <p>## Acceptance criteria</p>
  </div>
);

const PullRequestFigure = () => (
  <div className="rounded-xl border border-slate-200 bg-white p-4" aria-hidden>
    <ol className="space-y-2 text-sm">
      {[
        ["1", "Commit only the task file", "tag US-2-T-1-base"],
        ["2", "Add code and tests, then merge", "teammate reviews"],
        ["3", "Tag the merge commit", "US-2-T-1-done"],
        ["4", "Paste the merged PR", "Add PR, then Re-check"],
      ].map(([n, title, detail]) => (
        <li key={n} className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{n}</span>
          <span><span className="font-medium text-slate-900">{title}</span> <span className="text-slate-500">{detail}</span></span>
        </li>
      ))}
    </ol>
  </div>
);

const CourseHelp = () => (
  <article className="w-full max-w-5xl space-y-10 py-8 text-slate-900">
    <header className="space-y-3">
      <p className="text-sm"><Link href="/cse115a/dashboard" className="font-medium underline">Back to sprints</Link></p>
      <h1 className="text-3xl font-semibold tracking-tight">How to submit a sprint</h1>
      <p className="max-w-3xl text-slate-600">This term you submit Sprint 2, Sprint 3, and Sprint 4. Each sprint is two merged pull requests. The full task specification is in the <a href={HANDOUT} className="font-medium text-slate-900 underline" target="_blank" rel="noreferrer">course handout</a>.</p>
      <nav className="flex flex-wrap gap-2" aria-label="On this page">
        {STEPS.map((step) => (
          <a key={step.href} href={step.href} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm font-medium">{step.label}</a>
        ))}
      </nav>
    </header>

    <section id="sign-in" className="grid gap-6 md:grid-cols-2 md:items-center">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">1. Sign in and open your sprint</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>From Grepthink, open Tasks - External. Sign in with your UCSC Google account.</li>
          <li>Join the course with the code from your instructor, if you have not joined yet.</li>
          <li>Connect GitHub. That shares your username only. It does not let the site read your repositories.</li>
          <li>Open Sprint 2, Sprint 3, or Sprint 4. The form is ready. No install window should pop up.</li>
        </ol>
      </div>
      <SignInFigure />
    </section>

    <section id="install" className="grid gap-6 md:grid-cols-2 md:items-center">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">2. Install the GitHub App</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>On the sprint page, click the black <strong>Install the GitHub App</strong> box. The app on GitHub is named AIAugmentedSWE.</li>
          <li>Choose the GitHub account that owns the team repository. <strong>Configure</strong> means it is already installed there. An arrow means it is not.</li>
          <li>Select that repository. The app can only read it, and it never changes the code.</li>
          <li>Come back to the sprint page and paste a merged pull request. One install covers every teammate who can push to that repository.</li>
        </ol>
      </div>
      <InstallFigure />
    </section>

    <section id="another-repo" className="space-y-3">
      <h2 className="text-xl font-semibold">3. Use a different repository</h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
        <li>Click <strong>Install the GitHub App</strong> again and choose the other account or repository.</li>
        <li>On the task card, click <strong>Change PR</strong>.</li>
        <li>Paste the merged pull request from the new repository and click <strong>Add PR</strong>.</li>
        <li>If that repository does not have the app, the install window opens once for that repository. Install it, then click <strong>Re-check</strong>.</li>
      </ol>
    </section>

    <section id="task-file" className="grid gap-6 md:grid-cols-2 md:items-start">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">4. Write the task file</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Create <code className="rounded bg-slate-100 px-1">docs/tasks/sprint-2/YOUR-ID.md</code>. Use the sprint number you are submitting.</li>
          <li>Put <code className="rounded bg-slate-100 px-1">id</code>, <code className="rounded bg-slate-100 px-1">story</code>, <code className="rounded bg-slate-100 px-1">sprint</code>, <code className="rounded bg-slate-100 px-1">assignee</code>, and <code className="rounded bg-slate-100 px-1">estimate_hours</code> at the top. The estimate must be at least 2.</li>
          <li>Add a title and the sections Description, Specs, Requirements, and Acceptance criteria.</li>
          <li>Put a card for the task on your team’s Scrum board, then tick the checkbox on the task card.</li>
        </ol>
      </div>
      <TaskFileFigure />
    </section>

    <section id="pull-request" className="grid gap-6 md:grid-cols-2 md:items-center">
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">5. Open the pull request and add it here</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>From an up-to-date main branch, start <code className="rounded bg-slate-100 px-1">task/YOUR-ID</code>.</li>
          <li>Commit only the task file, tag it <code className="rounded bg-slate-100 px-1">YOUR-ID-base</code>, and push the branch and the tag before you write code.</li>
          <li>Add the implementation and tests on that branch. Open the pull request from your own GitHub account. Put the task ID in the title.</li>
          <li>After it merges, tag the merge commit <code className="rounded bg-slate-100 px-1">YOUR-ID-done</code> and push that tag.</li>
          <li>Paste the merged pull request URL and click <strong>Add PR</strong>. Fix any red checks, then click <strong>Re-check</strong>.</li>
        </ol>
      </div>
      <PullRequestFigure />
    </section>

    <section id="submit" className="space-y-3">
      <h2 className="text-xl font-semibold">6. Submit the sprint</h2>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
        <li>Add both tasks. Each one shows Ready when the process checks pass.</li>
        <li>Click <strong>Submit Sprint 2</strong> (or 3, or 4). Both tasks lock.</li>
        <li>Before the deadline, and before a grade is released, <strong>Change submission</strong> withdraws the sprint so you can edit.</li>
        <li>After your instructor releases the grade, the sprint score is the average of the two tasks, out of 10.</li>
      </ol>
    </section>

    <section id="faq" className="space-y-3">
      <h2 className="text-xl font-semibold">Questions students ask</h2>
      <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {FAQS.map((item) => (
          <details key={item.q} className="group px-5 py-4">
            <summary className="cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="mr-2 inline-block text-slate-400 transition-transform group-open:rotate-90">›</span>
              {item.q}
            </summary>
            <p className="mt-2 pl-5 text-sm leading-6 text-slate-600">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  </article>
);

export default CourseHelp;
