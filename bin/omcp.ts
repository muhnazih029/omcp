#!/usr/bin/env bun
import { main, reportError } from "../src/cli.ts";

try {
  const code = await main(Bun.argv.slice(2));
  process.exit(code);
} catch (error) {
  process.exit(reportError(error));
}
