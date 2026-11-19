import {
  COMPLETE_COPY_DONE, DOWNLOAD_LABEL, downloadStepRest, FROM_COPY_TITLE, FROM_GITHUB_TITLE, GET_CODE_TITLE, GITHUB_NOTE,
  githubCommands, NO_COPY, NO_COPY_NOTE, OLDER_COPY_DONE, OTHER_POINTS, OTHER_POINTS_TITLE, PASTE_STEP, repoCopyDownloadPath,
  RUN_RECIPE_LABEL, RUN_RECIPE_TITLE, runRecipeText, storedCopyCommands, STUDENT_CODE_WARNING, type TaskCode,
} from "@/lib/cse115a/getTheCode";

const block = "overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-3 font-mono text-xs select-all";

/** A task's "Get the code" section on the staff review page (closed until opened). */
export function GetTheCode({ submissionId, slot, repoFullName, mergeCommit, code }: {
  submissionId: string; slot: number; repoFullName: string; mergeCommit: string | null | undefined; code: TaskCode | undefined;
}) {
  const copy = code?.repoCopy ?? NO_COPY;
  const instanceId = code?.instanceId ?? null;
  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{GET_CODE_TITLE}</summary>
      <div className="space-y-4 border-t border-border p-3 text-sm">
        <p className="text-amber-700 dark:text-amber-300">{STUDENT_CODE_WARNING}</p>
        <div className="space-y-2">
          <h4 className="font-semibold">{FROM_GITHUB_TITLE}</h4>
          <p>{PASTE_STEP}</p>
          <pre className={block}>{githubCommands(repoFullName, mergeCommit)}</pre>
          <p className="text-muted-foreground">{GITHUB_NOTE}</p>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold">{FROM_COPY_TITLE}</h4>
          {copy.stored && instanceId ? (
            <>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Click <a href={repoCopyDownloadPath(submissionId, slot)} className="text-primary underline">{DOWNLOAD_LABEL}</a>.{downloadStepRest(instanceId)}</li>
                <li>{PASTE_STEP}<pre className={`${block} mt-2`}>{storedCopyCommands(instanceId, copy.complete)}</pre></li>
                <li>{copy.complete ? COMPLETE_COPY_DONE : OLDER_COPY_DONE}</li>
              </ol>
              {copy.complete ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground">{OTHER_POINTS_TITLE}</p>
                  <ul className="space-y-1">
                    {OTHER_POINTS.map((point) => (
                      <li key={point.command}><code className="select-all rounded bg-muted px-1 font-mono text-xs">{point.command}</code> <span className="text-muted-foreground">{point.what}</span></li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : <p className="text-muted-foreground">{NO_COPY_NOTE}</p>}
        </div>
        {code?.runRecipe ? (
          <div className="space-y-2">
            <h4 className="font-semibold">{RUN_RECIPE_TITLE}</h4>
            <p className="text-muted-foreground">{RUN_RECIPE_LABEL}</p>
            <pre className={block}>{runRecipeText(code.runRecipe)}</pre>
          </div>
        ) : null}
      </div>
    </details>
  );
}
