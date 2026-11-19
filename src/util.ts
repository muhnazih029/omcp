export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

export function uniqBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(value);
  }
  return out;
}

/** Short, human readable one-liner describing how a server is started. */
export function describeCommand(command: string[] | undefined): string {
  if (!command || command.length === 0) return "(no command)";
  const [bin, ...rest] = command;
  const base = (bin ?? "").split("/").pop() ?? bin ?? "";
  if (rest.length === 0) return base;
  const tail = rest.slice(-2).join(" ");
  return `${base} … ${tail}`.trim();
}

export function padEnd(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length);
}

export function guessTags(name: string): string[] {
  const n = name.toLowerCase();
  const tags: string[] = [];
  if (/design|pencil|figma|sketch|image|svg|ui/.test(n)) tags.push("design");
  if (/git|github|gitlab|issue|pr|repo/.test(n)) tags.push("code");
  if (/doc|context|search|fetch|browser|playwright|web/.test(n)) tags.push("research");
  if (/mem|memory|note|brain|knowledge/.test(n)) tags.push("memory");
  if (/todo|task|plan|project/.test(n)) tags.push("tasks");
  if (/db|sql|postgres|sqlite|mongo/.test(n)) tags.push("data");
  if (/deploy|docker|kube|cloud|aws|gcp|azure/.test(n)) tags.push("infra");
  return tags;
}

export function slugifyProfileName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function shortPath(input: string): string {
  const home = process.env.HOME ?? "";
  return home && input.startsWith(home) ? `~${input.slice(home.length)}` : input;
}

/** Split a shell-ish command line into argv, honouring single and double quotes. */
export function splitCommand(input: string): string[] {
  const out: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let hasContent = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;

    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }
      if (char === "\\" && quote === '"' && i + 1 < input.length) {
        current += input[i + 1]!;
        i++;
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      hasContent = true;
      continue;
    }

    if (/\s/.test(char)) {
      if (hasContent) {
        out.push(current);
        current = "";
        hasContent = false;
      }
      continue;
    }

    current += char;
    hasContent = true;
  }

  if (hasContent) out.push(current);
  return out;
}
