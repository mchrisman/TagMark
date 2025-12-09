# Test Architecture

## Overview

Each test is a standalone HTML file that:
1. Can be opened directly in a browser for human inspection
2. Runs automatically in a headless browser for CI/automation
3. Reports results via DOM (for humans) and console JSON (for machines)

## Directory Structure

```
tagmark/
  build*
  test*                    # Run all tests or named tests (substring match) in playwright
  test-in-browser*         # Open browser window and run all tests or named tests in frames
  doc/
  dist/
    tagmark.js              # stable snapshot, updated only with manual build, not CI build
  src/
    tagmark.js              # tests reference src/
  test/
    _harness.js            # Shared test utilities (~50 lines)
    feature-name.test.html
    other-feature.test.html
    ...
  package.json            # Single devDep: playwright
```

Adding a new test = create `tests/something.test.html`. No other wiring.

## Test File Contract

Every test file:

1. Includes the code being tested
2. Includes `harness.js`
3. Calls `TagMarkTest.run(name, fn)` with assertions
4. Ends with `t.done()`

### Example Test

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test: Basic Loop</title>
  <script src="../src/tagmark.js"></script>
  <script src="harness.js"></script>
</head>
<body>

<h1>Basic Loop</h1>

<!-- The example being tested -->
<tag-mark id="root">
  <div def="@nums := [1, 2, 3]">
    <Loop each="$n of {@nums}">
      <span class="num">{$n}</span>
    </Loop>
  </div>
</tag-mark>

<!-- Results rendered here -->
<div id="test-results" data-status="pending"></div>

<script>
TagMark.ready(() => {
  TagMarkTest.run("basic-loop", t => {
    const nums = [...document.querySelectorAll(".num")]
                 .map(el => Number(el.textContent.trim()));

    t.eq(nums, [1, 2, 3], "Loop renders numbers in order");
    t.ok(nums.length === 3, "Three elements rendered");

    t.done();
  });
});
</script>

</body>
</html>
```

## Assertion API

```javascript
t.ok(condition, "description")     // Pass if truthy
t.eq(actual, expected, "description")  // Pass if equal (deep for arrays)
t.fail("description")              // Always fails
t.done()                           // Required: signals test complete
```

## harness.js

```javascript
(() => {
  function deepEqual(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((v, i) => deepEqual(v, b[i]));
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
      const keysA = Object.keys(a), keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(k => deepEqual(a[k], b[k]));
    }
    return false;
  }

  function makeTester(name) {
    const results = { name, assertions: [], passed: 0, failed: 0 };

    function record(ok, message, extra) {
      results.assertions.push({ ok, message, extra });
      ok ? results.passed++ : results.failed++;
    }

    return {
      ok(cond, msg = "ok") {
        record(!!cond, msg, { cond });
      },
      eq(actual, expected, msg = "eq") {
        record(deepEqual(actual, expected), msg, { actual, expected });
      },
      fail(msg = "fail") {
        record(false, msg, {});
      },
      done() {
        results.done = true;
        window.__TAGMARK_TEST_RESULT__ = results;

        // Render to DOM for humans
        const container = document.getElementById("test-results");
        if (container) {
          container.dataset.status = results.failed === 0 ? "pass" : "fail";
          container.innerHTML = results.assertions.map(a =>
            `<div class="test ${a.ok ? "pass" : "fail"}">${a.ok ? "✓" : "✗"} ${a.message}</div>`
          ).join("") + `<div class="summary">${results.passed} passed, ${results.failed} failed</div>`;
        }

        // Emit for headless runner
        console.log("TEST_RESULT:" + JSON.stringify(results));
      }
    };
  }

  window.TagMarkTest = {
    run(name, fn) {
      const t = makeTester(name);
      try {
        fn(t);
      } catch (e) {
        console.error("Uncaught error in test:", name, e);
        t.fail("Uncaught: " + e.message);
        t.done();
      }
    }
  };
})();
```

## Optional Styling

Add to test files or a shared CSS file:

```css
#test-results { font-family: monospace; margin-top: 2em; padding: 1em; }
#test-results[data-status="pass"] { border-left: 4px solid green; }
#test-results[data-status="fail"] { border-left: 4px solid red; }
.test.pass { color: green; }
.test.fail { color: red; font-weight: bold; }
.summary { margin-top: 1em; font-weight: bold; }
```

## Headless Runner

`run-tests.mjs`:

```javascript
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const testsDir = path.join(__dirname, "tests");

async function runTest(browser, file) {
  const page = await browser.newPage();
  const fileUrl = "file://" + path.join(testsDir, file);

  let result = null;

  page.on("console", msg => {
    const text = msg.text();
    if (text.startsWith("TEST_RESULT:")) {
      try {
        result = JSON.parse(text.slice("TEST_RESULT:".length));
      } catch (e) {
        console.error("Failed to parse result for", file);
      }
    }
  });

  page.on("pageerror", err => {
    console.error(`Page error in ${file}:`, err.message);
  });

  await page.goto(fileUrl);

  await page.waitForFunction(
    () => !!window.__TAGMARK_TEST_RESULT__,
    { timeout: 5000 }
  ).catch(() => {});

  await page.close();
  return { file, result };
}

(async () => {
  const browser = await chromium.launch();
  const files = fs.readdirSync(testsDir).filter(f => f.endsWith(".test.html"));

  let totalPassed = 0, totalFailed = 0;

  for (const file of files) {
    const { result } = await runTest(browser, file);

    if (!result) {
      console.log(`✗ ${file}: no result (timeout or error)`);
      totalFailed++;
      continue;
    }

    if (result.failed === 0) {
      console.log(`✓ ${file} (${result.passed} assertions)`);
      totalPassed += result.passed;
    } else {
      console.log(`✗ ${file} (${result.passed} passed, ${result.failed} failed)`);
      result.assertions.filter(a => !a.ok).forEach(a => {
        console.log(`    ${a.message}: expected ${JSON.stringify(a.extra?.expected)}, got ${JSON.stringify(a.extra?.actual)}`);
      });
      totalPassed += result.passed;
      totalFailed += result.failed;
    }
  }

  await browser.close();

  console.log(`\n${totalPassed} passed, ${totalFailed} failed`);
  process.exit(totalFailed === 0 ? 0 : 1);
})();
```

## package.json

```json
{
  "name": "tagmark",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node run-tests.mjs"
  },
  "devDependencies": {
    "playwright": "^1.48.0"
  }
}
```

## Setup

```bash
npm install
npx playwright install chromium
```

## Usage

```bash
# Run all tests
npm test

# View a test manually
open tests/feature-name.test.html
```

## Design Principles

1. **Tests are examples**: Open any test in a browser, see exactly what's being tested
2. **Single source of truth**: DOM results match automation results
3. **Copy to create**: New test = copy existing `.test.html`, modify
4. **Minimal API**: Four methods: `ok`, `eq`, `fail`, `done`
5. **No magic**: No DSL, no config, no build step
6. **Fail-safe**: Missing `done()` = timeout = failure


# Implementor's notes

# Test Authoring Decisions

- **Harness naming mismatch**: The repository ships `test/_harness.js` exposing `Test.run` and `window.__TEST_RESULT__`, which differs from `doc/test-architecture.md`'s `TagMarkTest` references. Tests follow the shipped harness to stay compatible with the runner while preserving the documented structure otherwise. Alternatives included modifying the harness to match the doc, but that would violate the "harness unchanged" rule.
- **Missing TagMark implementation guard**: `src/tagmark.js` is currently a placeholder. Each test checks for `TagMark.ready` before running and records a failure if absent so results are well-formed instead of throwing. Once TagMark is implemented, these guards become no-ops. An alternative was to let tests crash, but that would prevent the runner from capturing intent.
- **Error expectation collection**: Tests that assert hard errors (e.g., illegal pure mutations, duplicate loop markers, double init) listen to `window.error` and treat any captured message as a surfaced failure signal. This keeps tests readable without depending on a particular error UI. An alternative would be to assert against specific DOM error boundaries, but those are unspecified.
- **Web component fallback base class**: `TagMarkElement` is referenced in the spec but not present in the codebase. Custom elements in tests extend `(window.TagMarkElement || HTMLElement)` so tests run today yet will exercise the intended integration once `TagMarkElement` exists. An alternative was to skip the web-component test entirely, but the plan requires it.
- **Error surfacing heuristic**: Error boundary expectations use both `window.onerror` and simple text search for "error"/"fail" inside `<tag-mark>` because the spec doesn't define the exact DOM shape of error UIs. This balances visible feedback with flexibility. An alternative would be to assert on a specific selector, risking brittleness.

