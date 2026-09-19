#!/usr/bin/env bun
import { runCopilotCLI } from "../src/copilot/cli";

process.exitCode = await runCopilotCLI(process.argv.slice(2));
