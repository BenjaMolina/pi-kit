#!/usr/bin/env bun
import { runCodexCLI } from "../src/codex/cli";

process.exitCode = await runCodexCLI(process.argv.slice(2));
