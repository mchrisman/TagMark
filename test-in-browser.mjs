#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { exec } from "node:child_process";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const testsDir = path.join(__dirname, "test");

const filter = process.argv[2] || "";

const files = fs.readdirSync(testsDir)
  .filter(f => f.endsWith(".test.html"))
  .filter(f => f.includes(filter));

if (files.length === 0) {
  console.log(filter ? `No tests matching "${filter}"` : "No tests found");
  process.exit(1);
}

// Generate an index page with iframes for each test
const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test Runner</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 1em; }
    h1 { margin-top: 0; }
    .test-frame {
      width: 100%;
      height: 300px;
      border: 1px solid #ccc;
      margin-bottom: 1em;
    }
    .test-name {
      font-weight: bold;
      margin-bottom: 0.5em;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <h1>Tests${filter ? ` matching "${filter}"` : ""}</h1>
  ${files.map(f => `
    <div class="test-name">${f}</div>
    <iframe class="test-frame" src="${f}"></iframe>
  `).join("\n")}
</body>
</html>`;

const indexPath = path.join(testsDir, "_runner.html");
fs.writeFileSync(indexPath, html);

// Open in default browser
const openCmd = process.platform === "darwin" ? "open"
              : process.platform === "win32" ? "start"
              : "xdg-open";

exec(`${openCmd} "${indexPath}"`, (err) => {
  if (err) {
    console.log(`Open ${indexPath} in your browser`);
  }
});
