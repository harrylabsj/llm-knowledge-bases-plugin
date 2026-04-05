#!/usr/bin/env node

import process from "node:process";

import { runStandaloneKnowledgeBaseCli } from "./cli.js";

runStandaloneKnowledgeBaseCli(process.argv.slice(2))
  .then((exitCode) => {
    if (exitCode !== 0) {
      process.exit(exitCode);
    }
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
