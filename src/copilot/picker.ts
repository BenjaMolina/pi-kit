import type { CLIProxyModel } from "../cliproxyapi/models";

export type CopilotPickerTerminal = {
  stdin?: NodeJS.ReadableStream & {
    isTTY?: boolean;
    setRawMode?: (mode: boolean) => void;
    setEncoding?: (encoding: BufferEncoding) => void;
    resume?: () => void;
    pause?: () => void;
    on?: (event: string, listener: (...args: any[]) => void) => any;
    removeListener?: (event: string, listener: (...args: any[]) => void) => any;
  };
  stdout?: NodeJS.WritableStream & {
    isTTY?: boolean;
    write?: (chunk: string) => boolean | void;
    columns?: number;
    rows?: number;
  };
  isTTY?: boolean;
};

export type CopilotPickerOptions = {
  terminal?: CopilotPickerTerminal;
  maxVisible?: number;
  escapeTimeoutMs?: number;
  onEscapePending?: (flush: () => void) => void;
};

export type CopilotEffortPickerOptions = CopilotPickerOptions & {
  defaultLevel?: string;
  modelId?: string;
};

export function matchSubsequence(query: string, text: string): { start: number; end: number } | undefined {
  if (!query) return { start: 0, end: 0 };
  let qIdx = 0;
  let start = -1;
  let end = -1;
  for (let tIdx = 0; tIdx < text.length; tIdx++) {
    if (text[tIdx] === query[qIdx]) {
      if (qIdx === 0) start = tIdx;
      qIdx++;
      if (qIdx === query.length) {
        end = tIdx;
        return { start, end };
      }
    }
  }
  return undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreField(query: string, text: string, allowSubsequence = true): number {
  if (text === query) return 10_000;
  if (text.startsWith(query)) return 8_000 + Math.min(1000, (query.length / text.length) * 1000);
  const wordBoundary = text.search(new RegExp(`(?:^|[\\s/_-])${escapeRegex(query)}`));
  if (wordBoundary !== -1) return 6_000 + Math.min(1000, (query.length / text.length) * 1000);
  const substringIndex = text.indexOf(query);
  if (substringIndex !== -1) return 4_000 - Math.min(substringIndex * 10, 1000);
  if (!allowSubsequence) return 0;
  const sub = matchSubsequence(query, text);
  if (sub) {
    const span = sub.end - sub.start + 1;
    const maxSpan = Math.max(query.length + 6, Math.floor(query.length * 2.5));
    if (span <= maxSpan) {
      const penalty = (span - query.length) * 15;
      return Math.max(1, 2_000 - penalty);
    }
  }
  return 0;
}

function scoreModelSingleTerm(model: CLIProxyModel, term: string): number {
  const name = model.displayName.toLowerCase();
  const id = model.id.toLowerCase();
  const owner = model.owner.toLowerCase();
  const combined = `${name} ${id} ${owner}`;

  const scoreName = scoreField(term, name, true);
  const scoreId = scoreField(term, id, true);
  const scoreOwner = scoreField(term, owner, true);
  const scoreCombined = scoreField(term, combined, false);

  return Math.max(
    scoreName * 1.5,
    scoreId * 1.3,
    scoreOwner * 1.0,
    scoreCombined * 0.9,
  );
}

export function scoreModel(model: CLIProxyModel, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;

  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    let totalScore = 0;
    for (const word of words) {
      const wordScore = scoreModelSingleTerm(model, word);
      if (wordScore <= 0) return 0;
      totalScore += wordScore;
    }
    return totalScore;
  }

  return scoreModelSingleTerm(model, q);
}

export function filterAndRankModels(models: CLIProxyModel[], query: string): CLIProxyModel[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [...models].sort((a, b) => a.id.localeCompare(b.id));
  }

  const scored: Array<{ model: CLIProxyModel; score: number }> = [];
  for (const model of models) {
    const score = scoreModel(model, q);
    if (score > 0) {
      scored.push({ model, score });
    }
  }

  scored.sort((a, b) => {
    const diff = b.score - a.score;
    if (diff !== 0) return diff;
    return a.model.id.localeCompare(b.model.id);
  });

  return scored.map((item) => item.model);
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) {
    const m = count / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}m`;
  }
  if (count >= 1000) {
    const k = count / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return String(count);
}

export function formatModelLine(model: CLIProxyModel, isSelected: boolean): string {
  const pointer = isSelected ? "❯ " : "  ";
  const name = model.displayName !== model.id ? `${model.displayName} (${model.id})` : model.id;
  const ctx = formatTokens(model.contextWindow);
  const max = formatTokens(model.maxTokens);
  const tags = [`${ctx} ctx`, `${max} max`];
  if (model.reasoning) tags.push("reasoning");
  if (model.input.includes("image")) tags.push("vision");
  tags.push(model.owner);
  return `${pointer}${name} [${tags.join(", ")}]`;
}

export function renderPickerLines(
  models: CLIProxyModel[],
  query: string,
  selectedIndex: number,
  windowStart: number,
  maxVisible = 8,
): string[] {
  const lines: string[] = [];
  lines.push(`? Select a Copilot model (type to filter): ${query}`);

  if (models.length === 0) {
    lines.push(`  No models match "${query}"`);
    return lines;
  }

  const visibleEnd = Math.min(windowStart + maxVisible, models.length);
  const total = models.length;
  lines.push(`  Showing ${windowStart + 1}–${visibleEnd} of ${total} models (↑/↓ to navigate, Enter to select, Esc to cancel)`);

  for (let i = windowStart; i < visibleEnd; i++) {
    lines.push(formatModelLine(models[i], i === selectedIndex));
  }

  return lines;
}

export function formatEffortLine(level: string, isSelected: boolean): string {
  const pointer = isSelected ? "❯ " : "  ";
  return `${pointer}${level}`;
}

export function renderEffortPickerLines(
  levels: string[],
  query: string,
  selectedIndex: number,
  windowStart: number,
  maxVisible = 8,
  modelId?: string,
): string[] {
  const lines: string[] = [];
  const title = modelId ? `? Select reasoning effort for ${modelId}` : `? Select reasoning effort`;
  lines.push(`${title} (type to filter): ${query}`);

  if (levels.length === 0) {
    lines.push(`  No reasoning levels match "${query}"`);
    return lines;
  }

  const visibleEnd = Math.min(windowStart + maxVisible, levels.length);
  const total = levels.length;
  lines.push(`  Showing ${windowStart + 1}–${visibleEnd} of ${total} levels (↑/↓ to navigate, Enter to select, Esc to cancel)`);

  for (let i = windowStart; i < visibleEnd; i++) {
    lines.push(formatEffortLine(levels[i], i === selectedIndex));
  }

  return lines;
}

export function filterEffortLevels(levels: string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...levels];
  return levels.filter((level) => {
    const lower = level.toLowerCase();
    return lower.includes(q) || Boolean(matchSubsequence(q, lower));
  });
}

function isEscapePrefix(s: string): boolean {
  if (s === "\x1b" || s === "\x1bO") return true;
  if (s.startsWith("\x1b[")) {
    return /^\x1b\[[0-9;?]*$/.test(s);
  }
  return false;
}

type InteractivePickerConfig<T> = {
  items: T[];
  filter: (items: T[], query: string) => T[];
  renderLines: (filtered: T[], query: string, selectedIndex: number, windowStart: number, maxVisible: number) => string[];
  initialIndex?: number;
  emptyError: string;
  options?: CopilotPickerOptions;
};

async function runInteractivePicker<T>(config: InteractivePickerConfig<T>): Promise<T | undefined> {
  const options = config.options ?? {};
  const terminal = options.terminal ?? {};
  const stdin = (terminal.stdin ?? process.stdin) as any;
  const stdout = (terminal.stdout ?? process.stdout) as any;

  const isTTY = terminal.isTTY !== undefined ? terminal.isTTY : Boolean(stdin?.isTTY && stdout?.isTTY);
  if (!isTTY) {
    throw new Error(
      "pi-kit-copilot pick requires an interactive terminal (TTY). Use 'pi-kit-copilot use <model-id>' or 'pi-kit-copilot models' for non-interactive environments.",
    );
  }

  if (config.items.length === 0) {
    throw new Error(config.emptyError);
  }

  const maxVisible = options.maxVisible ?? 8;
  const escapeTimeoutMs = options.escapeTimeoutMs ?? 30;

  return new Promise<T | undefined>((resolve, reject) => {
    let settled = false;
    let escapeTimer: any = null;
    let buffer = "";

    let query = "";
    let filtered = config.filter(config.items, query);
    let selectedIndex = config.initialIndex ?? 0;
    if (selectedIndex < 0 || selectedIndex >= filtered.length) {
      selectedIndex = 0;
    }
    let windowStart = 0;
    if (selectedIndex >= maxVisible) {
      windowStart = selectedIndex - maxVisible + 1;
    }
    let lastRenderedLineCount = 0;

    function render(): void {
      if (lastRenderedLineCount > 0) {
        try {
          if (lastRenderedLineCount === 1) {
            stdout.write?.("\r\x1b[2K");
          } else {
            stdout.write?.(`\r\x1b[${lastRenderedLineCount - 1}A\x1b[0J`);
          }
        } catch {
          // ignore
        }
      }
      const lines = config.renderLines(filtered, query, selectedIndex, windowStart, maxVisible);
      stdout.write?.(lines.join("\n"));
      lastRenderedLineCount = lines.length;
    }

    function clearEscapeTimer(): void {
      if (escapeTimer !== null) {
        clearTimeout(escapeTimer);
        escapeTimer = null;
      }
    }

    function cleanup(): void {
      if (lastRenderedLineCount > 0) {
        try {
          if (lastRenderedLineCount === 1) {
            stdout.write?.("\r\x1b[2K");
          } else {
            stdout.write?.(`\r\x1b[${lastRenderedLineCount - 1}A\x1b[0J`);
          }
        } catch {
          // ignore
        }
        lastRenderedLineCount = 0;
      }
      try {
        stdout.write?.("\x1b[?25h");
      } catch {
        // ignore
      }
    }

    function teardown(): void {
      clearEscapeTimer();
      if (typeof stdin?.removeListener === "function") {
        try {
          stdin.removeListener("data", onData);
          stdin.removeListener("end", onEnd);
          stdin.removeListener("error", onError);
        } catch {
          // ignore
        }
      }
      if (typeof stdin?.setRawMode === "function") {
        try {
          stdin.setRawMode(false);
        } catch {
          // ignore
        }
      }
      if (typeof stdin?.pause === "function") {
        try {
          stdin.pause();
        } catch {
          // ignore
        }
      }
    }

    function finish(result: T | undefined): void {
      if (settled) return;
      settled = true;
      teardown();
      cleanup();
      resolve(result);
    }

    function fail(error: unknown): void {
      if (settled) return;
      settled = true;
      teardown();
      cleanup();
      reject(error);
    }

    function onEscapeTimeout(): void {
      try {
        clearEscapeTimer();
        if (settled) return;

        if (buffer === "\x1b") {
          buffer = "";
          finish(undefined);
          return;
        }

        if (buffer.startsWith("\x1b")) {
          buffer = "";
          processBuffer();
        }
      } catch (err) {
        fail(err);
      }
    }

    function processBuffer(): void {
      while (buffer.length > 0 && !settled) {
        // Ctrl+C
        if (buffer.startsWith("\x03")) {
          buffer = buffer.slice(1);
          clearEscapeTimer();
          finish(undefined);
          return;
        }

        // Enter
        if (buffer.startsWith("\r\n")) {
          buffer = buffer.slice(2);
          clearEscapeTimer();
          if (filtered.length > 0 && selectedIndex >= 0 && selectedIndex < filtered.length) {
            finish(filtered[selectedIndex]);
          }
          return;
        }
        if (buffer.startsWith("\r") || buffer.startsWith("\n")) {
          buffer = buffer.slice(1);
          clearEscapeTimer();
          if (filtered.length > 0 && selectedIndex >= 0 && selectedIndex < filtered.length) {
            finish(filtered[selectedIndex]);
          }
          return;
        }

        // Escape sequences
        if (buffer.startsWith("\x1b")) {
          // Up arrow: \x1b[A or \x1bOA
          if (buffer.startsWith("\x1b[A") || buffer.startsWith("\x1bOA")) {
            buffer = buffer.slice(3);
            clearEscapeTimer();
            if (filtered.length > 0) {
              selectedIndex = Math.max(0, selectedIndex - 1);
              if (selectedIndex < windowStart) {
                windowStart = selectedIndex;
              }
              render();
            }
            continue;
          }

          // Down arrow: \x1b[B or \x1bOB
          if (buffer.startsWith("\x1b[B") || buffer.startsWith("\x1bOB")) {
            buffer = buffer.slice(3);
            clearEscapeTimer();
            if (filtered.length > 0) {
              selectedIndex = Math.min(filtered.length - 1, selectedIndex + 1);
              if (selectedIndex >= windowStart + maxVisible) {
                windowStart = selectedIndex - maxVisible + 1;
              }
              render();
            }
            continue;
          }

          // Page Up: \x1b[5~
          if (buffer.startsWith("\x1b[5~")) {
            buffer = buffer.slice(4);
            clearEscapeTimer();
            if (filtered.length > 0) {
              selectedIndex = Math.max(0, selectedIndex - maxVisible);
              windowStart = Math.max(0, selectedIndex);
              render();
            }
            continue;
          }

          // Page Down: \x1b[6~
          if (buffer.startsWith("\x1b[6~")) {
            buffer = buffer.slice(4);
            clearEscapeTimer();
            if (filtered.length > 0) {
              selectedIndex = Math.min(filtered.length - 1, selectedIndex + maxVisible);
              if (selectedIndex >= windowStart + maxVisible) {
                windowStart = selectedIndex - maxVisible + 1;
              }
              render();
            }
            continue;
          }

          // Home: \x1b[H or \x1b[1~
          if (buffer.startsWith("\x1b[H")) {
            buffer = buffer.slice(3);
            clearEscapeTimer();
            if (filtered.length > 0) {
              selectedIndex = 0;
              windowStart = 0;
              render();
            }
            continue;
          }
          if (buffer.startsWith("\x1b[1~")) {
            buffer = buffer.slice(4);
            clearEscapeTimer();
            if (filtered.length > 0) {
              selectedIndex = 0;
              windowStart = 0;
              render();
            }
            continue;
          }

          // End: \x1b[F or \x1b[4~
          if (buffer.startsWith("\x1b[F")) {
            buffer = buffer.slice(3);
            clearEscapeTimer();
            if (filtered.length > 0) {
              selectedIndex = filtered.length - 1;
              windowStart = Math.max(0, selectedIndex - maxVisible + 1);
              render();
            }
            continue;
          }
          if (buffer.startsWith("\x1b[4~")) {
            buffer = buffer.slice(4);
            clearEscapeTimer();
            if (filtered.length > 0) {
              selectedIndex = filtered.length - 1;
              windowStart = Math.max(0, selectedIndex - maxVisible + 1);
              render();
            }
            continue;
          }

          // Any other complete CSI or SS3 sequence (e.g. \x1b[C, \x1b[D)
          const otherCsi = buffer.match(/^(\x1b\[[0-9;?]*[A-Za-z~]|\x1bO[A-Za-z])/);
          if (otherCsi) {
            buffer = buffer.slice(otherCsi[0].length);
            clearEscapeTimer();
            continue;
          }

          // Incomplete escape sequence prefix
          if (isEscapePrefix(buffer)) {
            if (escapeTimer === null) {
              escapeTimer = setTimeout(onEscapeTimeout, escapeTimeoutMs);
              (escapeTimer as any)?.unref?.();
            }
            options.onEscapePending?.(onEscapeTimeout);
            break;
          }

          // Not a recognized prefix or sequence -> treat leading \x1b as standalone Escape
          buffer = buffer.slice(1);
          clearEscapeTimer();
          finish(undefined);
          return;
        }

        // Non-escape keys:
        clearEscapeTimer();

        // Ctrl+P (Up)
        if (buffer.startsWith("\x10")) {
          buffer = buffer.slice(1);
          if (filtered.length > 0) {
            selectedIndex = Math.max(0, selectedIndex - 1);
            if (selectedIndex < windowStart) {
              windowStart = selectedIndex;
            }
            render();
          }
          continue;
        }

        // Ctrl+N (Down)
        if (buffer.startsWith("\x0e")) {
          buffer = buffer.slice(1);
          if (filtered.length > 0) {
            selectedIndex = Math.min(filtered.length - 1, selectedIndex + 1);
            if (selectedIndex >= windowStart + maxVisible) {
              windowStart = selectedIndex - maxVisible + 1;
            }
            render();
          }
          continue;
        }

        // Backspace
        if (buffer.startsWith("\x7f") || buffer.startsWith("\x08") || buffer.startsWith("\b")) {
          buffer = buffer.slice(1);
          if (query.length > 0) {
            query = query.slice(0, -1);
            filtered = config.filter(config.items, query);
            selectedIndex = 0;
            windowStart = 0;
            render();
          }
          continue;
        }

        // Ctrl+U
        if (buffer.startsWith("\x15")) {
          buffer = buffer.slice(1);
          if (query.length > 0) {
            query = "";
            filtered = config.filter(config.items, query);
            selectedIndex = 0;
            windowStart = 0;
            render();
          }
          continue;
        }

        // Ctrl+W
        if (buffer.startsWith("\x17")) {
          buffer = buffer.slice(1);
          if (query.length > 0) {
            query = query.replace(/\S+\s*$/, "");
            filtered = config.filter(config.items, query);
            selectedIndex = 0;
            windowStart = 0;
            render();
          }
          continue;
        }

        // Regular character input (printable, not control sequence)
        const printableMatch = buffer.match(/^[^\x00-\x1f\x7f\x1b]+/);
        if (printableMatch) {
          const text = printableMatch[0];
          buffer = buffer.slice(text.length);
          query += text;
          filtered = config.filter(config.items, query);
          selectedIndex = 0;
          windowStart = 0;
          render();
          continue;
        }

        // Skip unknown control character
        buffer = buffer.slice(1);
      }
    }

    function onEnd(): void {
      finish(undefined);
    }

    function onError(err: unknown): void {
      fail(err);
    }

    function onData(chunk: string | Buffer): void {
      try {
        const input = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        buffer += input;
        processBuffer();
      } catch (err) {
        fail(err);
      }
    }

    try {
      stdout.write?.("\x1b[?25l");

      if (typeof stdin?.setRawMode === "function") {
        stdin.setRawMode(true);
      }
      if (typeof stdin?.resume === "function") {
        stdin.resume();
      }
      if (typeof stdin?.setEncoding === "function") {
        stdin.setEncoding("utf8");
      }

      if (typeof stdin?.on === "function") {
        stdin.on("data", onData);
        stdin.on("end", onEnd);
        stdin.on("error", onError);
      }

      render();
    } catch (err) {
      fail(err);
    }
  });
}

export async function selectCopilotModel(
  models: CLIProxyModel[],
  options: CopilotPickerOptions = {},
): Promise<CLIProxyModel | undefined> {
  return runInteractivePicker<CLIProxyModel>({
    items: models,
    filter: filterAndRankModels,
    renderLines: renderPickerLines,
    emptyError: "No models are currently available from CLIProxyAPI.",
    options,
  });
}

export function resolveInitialEffortIndex(levels: string[], defaultLevel?: string): number {
  if (!defaultLevel) return 0;
  const exact = levels.findIndex((l) => l === defaultLevel);
  if (exact !== -1) return exact;

  const lower = defaultLevel.toLowerCase();
  const ciMatches = levels
    .map((level, idx) => ({ level, idx }))
    .filter(({ level }) => level.toLowerCase() === lower);

  return ciMatches.length === 1 ? ciMatches[0].idx : 0;
}

export async function selectCopilotReasoningEffort(
  levels: string[],
  options: CopilotEffortPickerOptions = {},
): Promise<string | undefined> {
  const initialIndex = resolveInitialEffortIndex(levels, options.defaultLevel);

  return runInteractivePicker<string>({
    items: levels,
    filter: filterEffortLevels,
    renderLines: (filtered, query, selectedIndex, windowStart, maxVisible) =>
      renderEffortPickerLines(filtered, query, selectedIndex, windowStart, maxVisible, options.modelId),
    initialIndex,
    emptyError: "No reasoning levels are available.",
    options,
  });
}
