/**
 * Minimal JSONC support: strip comments and trailing commas, then parse.
 *
 * Deliberately hand written instead of pulling a dependency: OpenCode config
 * files are small, and this keeps the package install footprint at one runtime
 * dependency. String contents are respected, so `"http://host"` survives.
 */

export function stripComments(input: string): { text: string; hadComments: boolean } {
  let out = "";
  let hadComments = false;

  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    const next = i + 1 < input.length ? input[i + 1]! : "";

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        out += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i++;
        continue;
      }
      if (char === "\n") out += char;
      continue;
    }

    if (inString) {
      out += char;
      if (char === "\\" && next !== "") {
        out += next;
        i++;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      hadComments = true;
      i++;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      hadComments = true;
      i++;
      continue;
    }

    out += char;
  }

  return { text: out, hadComments };
}

export function stripTrailingCommas(input: string): string {
  let out = "";
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    const next = i + 1 < input.length ? input[i + 1]! : "";

    if (inString) {
      out += char;
      if (char === "\\" && next !== "") {
        out += next;
        i++;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }

    if (char === ",") {
      let lookahead = i + 1;
      while (lookahead < input.length && /\s/.test(input[lookahead]!)) lookahead++;
      const after = input[lookahead];
      if (after === "}" || after === "]") continue;
    }

    out += char;
  }

  return out;
}

export function stripJsonc(input: string): string {
  return stripTrailingCommas(stripComments(input).text);
}

export function parseJsonc(text: string): unknown {
  return JSON.parse(stripJsonc(text));
}

export function stringifyJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}
