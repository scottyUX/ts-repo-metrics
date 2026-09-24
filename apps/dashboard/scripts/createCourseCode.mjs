import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [slug, expiresAt] = process.argv.slice(2);
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!slug || !expiresAt || Number.isNaN(Date.parse(expiresAt)) || !url || !serviceKey) {
  console.error("Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node apps/dashboard/scripts/createCourseCode.mjs COURSE_SLUG EXPIRY_ISO");
  process.exit(1);
}
if (Date.parse(expiresAt) <= Date.now()) {
  console.error("The expiry must be in the future.");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: course, error: courseError } = await db.from("cse_courses")
  .select("id,title,term").eq("slug", slug).eq("active", true).maybeSingle();
if (courseError || !course) {
  console.error("Active course not found. Apply the course migration or check the slug.");
  process.exit(1);
}
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const bytes = randomBytes(16);
const code = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
const codeHash = createHash("sha256").update(code).digest("hex");
const { error } = await db.from("cse_course_codes").insert({
  course_id: course.id,
  code_hash: codeHash,
  expires_at: new Date(expiresAt).toISOString(),
});
if (error) {
  console.error("Could not create the course code:", error.message);
  process.exit(1);
}
console.log(`${course.title} · ${course.term}`);
console.log(`Course code: ${code}`);
console.log(`Expires: ${new Date(expiresAt).toISOString()}`);
console.log("Share the code with enrolled students. It cannot be recovered from the database.");
