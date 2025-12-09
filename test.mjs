#!/usr/bin/env node

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const testsDir = path.join(__dirname, "test");

const TEST_TIMEOUT = 1000; // 1 second max per test

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
  ]);
}

async function runTest(browser, file) {
  let page;
  try {
    page = await withTimeout(browser.newPage(), 500);
  } catch {
    return { file, result: null, timedOut: true };
  }

  const fileUrl = "file://" + path.join(testsDir, file);
  let result = null;

  page.on("console", msg => {
    const text = msg.text();
    if (text.startsWith("TEST_RESULT:")) {
      try {
        result = JSON.parse(text.slice("TEST_RESULT:".length));
      } catch (e) {}
    } else {
      console.log(`  [console] ${text}`);
    }
  });

  page.on("pageerror", err => {
    console.error(`Page error in ${file}:`, err.message);
  });

  try {
    await withTimeout(page.goto(fileUrl), TEST_TIMEOUT);
    await withTimeout(
      page.waitForFunction(() => !!window.__TEST_RESULT__),
      500
    );
  } catch {
    // timed out
  }

  // Force close - don't wait forever
  page.close().catch(() => {});

  return { file, result };
}

(async () => {
  const filter = process.argv[2] || "";

  const browser = await chromium.launch();
  const files = fs.readdirSync(testsDir)
    .filter(f => f.endsWith(".test.html"))
    .filter(f => f.includes(filter));

  if (files.length === 0) {
    console.log(filter ? `No tests matching "${filter}"` : "No tests found");
    await browser.close();
    process.exit(1);
  }

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
