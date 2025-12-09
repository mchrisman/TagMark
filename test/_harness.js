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
    const results = { name, assertions: [], passed: 0, failed: 0, done: false };

    function record(ok, message, extra) {
      if (results.done) {
        console.warn("Assertion after done():", message);
        return;
      }
      results.assertions.push({ ok, message, extra });
      ok ? results.passed++ : results.failed++;
    }

    function finish() {
      if (results.done) return; // Prevent double-done
      results.done = true;
      window.__TEST_RESULT__ = results;

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
      done: finish,
      _finish: finish,
      _results: results
    };
  }

  window.Test = {
    run(name, fn) {
      const t = makeTester(name);

      // Timeout failsafe - if test doesn't complete in 200ms, force done
      const timeout = setTimeout(() => {
        if (!t._results.done) {
          t.fail("Test timed out (200ms)");
          t._finish();
        }
      }, 200);

      // Wrap to handle both sync and async, and trap errors
      Promise.resolve()
        .then(() => fn(t))
        .catch(e => {
          console.error("Uncaught error in test:", name, e);
          t.fail("Uncaught: " + e.message);
          t._finish();
        })
        .finally(() => clearTimeout(timeout));
    }
  };

  // Inject default styles
  const style = document.createElement("style");
  style.textContent = `
    #test-results { font-family: monospace; margin-top: 2em; padding: 1em; }
    #test-results[data-status="pass"] { border-left: 4px solid green; }
    #test-results[data-status="fail"] { border-left: 4px solid red; }
    .test.pass { color: green; }
    .test.fail { color: red; font-weight: bold; }
    .summary { margin-top: 1em; font-weight: bold; }
  `;
  document.head.appendChild(style);
})();
