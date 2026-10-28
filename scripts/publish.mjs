#!/usr/bin/env node
// Publishes the current build to npm under each package name below. package.json
// only holds one name, so it's rewritten for each publish and always restored
// afterwards, byte for byte, even if a publish fails. Names that already have
// this version on npm are skipped, so a failed release can simply be rerun.
import { execFileSync } from "child_process";
import fs from "fs";

const NAMES = ["@consensys-software/besu-dev-quickstart", "@consensys/besu-dev-quickstart"];
const FILES = ["package.json", "npm-shrinkwrap.json"];
const dryRun = process.argv.includes("--dry-run");

const originals = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(f, "utf8")]));
const version = JSON.parse(originals["package.json"]).version;

const isPublished = (name) => {
  try {
    return execFileSync("npm", ["view", `${name}@${version}`, "version"], { encoding: "utf8" }).trim() === version;
  } catch {
    return false; // npm view fails when the package or version doesn't exist yet
  }
};

const setName = (name) => {
  const pkg = JSON.parse(originals["package.json"]);
  pkg.name = name;
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

  const shrinkwrap = JSON.parse(originals["npm-shrinkwrap.json"]);
  shrinkwrap.name = name;
  shrinkwrap.packages[""].name = name;
  fs.writeFileSync("npm-shrinkwrap.json", JSON.stringify(shrinkwrap, null, 2) + "\n");
};

try {
  for (const name of NAMES) {
    if (isPublished(name)) {
      console.log(`\nSkipping ${name}@${version}, it's already on npm.`);
      continue;
    }
    setName(name);
    console.log(`\nPublishing ${name}@${version}${dryRun ? " (dry run)" : ""} ...`);
    // The build is done once by `npm run release`, so skip the prepare script here.
    execFileSync("npm", ["publish", "--tag=latest", "--ignore-scripts", ...(dryRun ? ["--dry-run"] : [])], {
      stdio: "inherit",
    });
  }
} finally {
  for (const [f, content] of Object.entries(originals)) fs.writeFileSync(f, content);
}
