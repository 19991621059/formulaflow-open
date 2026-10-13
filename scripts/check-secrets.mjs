import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /\bsk-[A-Za-z0-9_-]{24,}/,
  /\bgh[opusr]_[A-Za-z0-9]{24,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
  /\/Users\/[A-Za-z0-9_-]+\//,
];
const issues = [];
for (const file of files) {
  if (
    (/(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example") ||
    /(?:prompt-history|credentials|private-data)/.test(file)
  ) {
    issues.push(file + ": sensitive filename");
    continue;
  }
  if (/\.(?:png|gif|woff2|jpg|webp)$/.test(file)) continue;
  const content = readFileSync(file, "utf8");
  if (patterns.some((pattern) => pattern.test(content)))
    issues.push(file + ": possible credential or local private path");
}
if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `No known credential patterns, private paths or sensitive files in ${files.length} publishable files. This pattern check complements the pre-publication exact-value review.`,
  );
