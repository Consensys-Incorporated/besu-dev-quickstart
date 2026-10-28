#!/usr/bin/env node
// Publishes the current build to npm. If this version is already on npm the
// publish is skipped, so a failed release can simply be rerun.
import { execFileSync } from "child_process";
import fs from "fs";

const { name, version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
const dryRun = process.argv.includes("--dry-run");

const isPublished = () => {
  try {
    return execFileSync("npm", ["view", `${name}@${version}`, "version"], { encoding: "utf8" }).trim() === version;
  } catch {
    return false; // npm view fails when the package or version doesn't exist yet
  }
};

if (isPublished()) {
  console.log(`\nSkipping ${name}@${version}, it's already on npm.`);
} else {
  console.log(`\nPublishing ${name}@${version}${dryRun ? " (dry run)" : ""} ...`);
  // The build is done once by `npm run release`, so skip the prepare script here.
  execFileSync("npm", ["publish", "--tag=latest", "--ignore-scripts", ...(dryRun ? ["--dry-run"] : [])], {
    stdio: "inherit",
  });
}
