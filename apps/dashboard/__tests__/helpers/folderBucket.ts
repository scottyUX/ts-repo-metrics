// A storage-js bucket kept in a local folder, answering the calls bucketSnapshotStore makes the way
// Supabase Storage does (an upload onto an existing object is statusCode "409", a missing object on
// download is status 400). No network; tests and the local live check hand it to bucketSnapshotStore.
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BucketFiles } from "@/lib/cse115a/benchmark/validation/snapshotStore";

export type FolderBucket = BucketFiles & { dir: string; names(): Promise<string[]>; calls: string[] };

export function folderBucket(dir: string): FolderBucket {
  const calls: string[] = [];
  const present = async (path: string) => access(join(dir, path)).then(() => true, () => false);
  return {
    dir,
    calls,
    async names() {
      return (await readdir(dir)).sort();
    },
    async exists(path) {
      calls.push(`exists ${path}`);
      return { data: await present(path), error: null };
    },
    async upload(path, body, options) {
      calls.push(`upload ${path}`);
      if (!options.upsert && (await present(path))) {
        return { data: null, error: { message: "The resource already exists", status: 400, statusCode: "409" } };
      }
      await writeFile(join(dir, path), body);
      return { data: { path }, error: null };
    },
    async download(path) {
      calls.push(`download ${path}`);
      if (!(await present(path))) return { data: null, error: { message: "Object not found", originalError: { status: 400 } } };
      return { data: new Blob([await readFile(join(dir, path))]), error: null };
    },
  };
}
