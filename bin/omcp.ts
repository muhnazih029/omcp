#!/usr/bin/env node
import { main, reportError } from "../src/cli.ts";

try {
  const code = await main(process.argv.slice(2));
  process.exit(code);
} catch (error) {
  process.exit(reportError(error));
}
