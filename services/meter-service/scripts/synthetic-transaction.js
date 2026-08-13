#!/usr/bin/env node
const { main } = require("../src/synthetic-transaction");
main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ success: false, failureStage: "ingress", error: error && error.message ? error.message : "unknown_error" })}\n`);
  process.exitCode = 1;
});
