# Contributing to omcp

Thanks for wanting to help improve `omcp`! Contributions of all kinds are welcome: reporting bugs, improving documentation, submitting feature ideas, and opening pull requests.

## Development Setup

`omcp` is written in TypeScript and uses [Bun](https://bun.sh) for its development loop and test runner.

1. **Clone the repository:**
   ```sh
   git clone https://github.com/muhnazih029/omcp.git
   cd omcp
   ```

2. **Install dependencies:**
   ```sh
   bun install
   ```

3. **Run the local dev command:**
   ```sh
   bun run dev
   # or test specific commands:
   bun run dev status
   bun run dev doctor
   ```

## Quality Checks

Before submitting a Pull Request, please ensure all checks pass:

```sh
# 1. Typecheck with TypeScript compiler
bun run typecheck

# 2. Run test suite
bun test

# 3. Verify build
bun run build
```

Tests use sandboxed temporary directories under `/tmp/opencode` to ensure they never touch or corrupt your personal `~/.config/opencode` files.

## Submitting a Pull Request

1. Fork the repo and create a topic branch from `master` (e.g. `feat/profile-export` or `fix/wrapper-path`).
2. Keep your changes focused. If introducing new logic, add corresponding unit tests in `test/`.
3. Follow the existing coding style:
   - Prefer small, pure functions where possible.
   - Respect user configurations (preserve comments and formatting in configs).
   - Never overwrite user files without validation.
4. Open a Pull Request with a clear summary of what changed and how you verified it.
