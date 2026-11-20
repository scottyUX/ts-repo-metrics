// How many tasks a sprint can hold, and the slot rules every check and page share (#412).

/**
 * The most tasks a student may submit in one sprint. Every submitted task is graded and the sprint score is the
 * average of all of them. The database's `task_slot between 1 and 6` checks
 * (20261120010000_cse115a_extra_tasks.sql) hold the same number.
 */
export const MAX_TASKS_PER_SPRINT = 6;

/**
 * The usual sprint: two tasks (or one big task). Slots 1 to USUAL_TASKS_PER_SPRINT are always shown on the
 * student page and as instructor table columns; further slots are optional extras.
 */
export const USUAL_TASKS_PER_SPRINT = 2;

/**
 * The most tasks one PR can hold for one student, each with its own task file: two, as before #412 (more than two
 * from one PR is not offered). Checked when a task is added (duplicateTask.ts) and again at submit.
 */
export const MAX_TASKS_PER_PR = 2;

/** Every slot a sprint can hold, 1 to MAX_TASKS_PER_SPRINT. */
export const TASK_SLOTS: readonly number[] = Array.from({ length: MAX_TASKS_PER_SPRINT }, (_, index) => index + 1);

/** Shown next to Add another task, and in the submit dialog for three or more tasks. */
export const EXTRA_TASK_WARNING = "Every task you submit is graded, and your sprint score is the average of all of them. An extra task can raise your score or lower it.";

/** Whether `value` is a task slot: a whole number from 1 to MAX_TASKS_PER_SPRINT. Strings are not slots. */
export function isTaskSlot(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_TASKS_PER_SPRINT;
}

/** The slot in a URL path segment ("3"), or null when it is not one. As before, `Number` reads the text. */
export function taskSlotFromPath(text: string): number | null {
  const slot = Number(text);
  return isTaskSlot(slot) ? slot : null;
}

/** The refusal for a slot outside 1 to MAX_TASKS_PER_SPRINT. */
export const TASK_SLOT_ERROR = `Choose a task from 1 to ${MAX_TASKS_PER_SPRINT}.`;

/**
 * The task cards the student page shows: the usual slots, every slot with a saved task, and slots the student
 * opened with Add another task (ignored once the sprint is submitted). Sorted, within the cap.
 */
export function shownTaskSlots(savedSlots: number[], openedSlots: number[], submitted: boolean): number[] {
  const usual = TASK_SLOTS.slice(0, USUAL_TASKS_PER_SPRINT);
  const all = new Set([...usual, ...savedSlots, ...(submitted ? [] : openedSlots)]);
  return [...all].filter(isTaskSlot).sort((a, b) => a - b);
}

/** The slot Add another task opens: the lowest slot not shown yet, or null when every slot is shown. */
export function nextTaskSlot(shownSlots: number[]): number | null {
  return TASK_SLOTS.find((slot) => !shownSlots.includes(slot)) ?? null;
}

/** Whether to offer Add another task: before the sprint is submitted, while a slot is left. */
export function canAddTask(shownSlots: number[], submitted: boolean): boolean {
  return !submitted && nextTaskSlot(shownSlots) !== null;
}
