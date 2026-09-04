/**
 * Side-effect-only module: pins env vars the test suite needs to be
 * deterministic, regardless of what a developer's local .env has configured
 * for live use. Must be imported (not just executed as a plain statement)
 * before `../src/config/env` — ES import declarations are hoisted above all
 * other top-level code in a module, so a bare `process.env.X = ...` statement
 * placed "before" an import in source order can still run after that import's
 * side effects. A separate imported module doesn't have that problem: two
 * imports execute in their declared order.
 *
 * dotenv's default `loadEnv()` never overwrites a process.env value that's
 * already set, so setting these here pins them ahead of .env's contents.
 */
process.env.WHATSAPP_PROVIDER = 'mock';
