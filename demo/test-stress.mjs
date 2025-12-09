import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') errors.push(msg.text());
  console.log('PAGE:', msg.text());
});
page.on('pageerror', err => {
  errors.push(err.message);
  console.log('PAGE ERROR:', err.message);
});

const filePath = 'file://' + path.resolve(__dirname, 'stress-tagmark.html');
await page.goto(filePath, { waitUntil: 'networkidle' });

// Wait a bit for initial render
await new Promise(r => setTimeout(r, 500));

// Click the Start Benchmark button
await page.click('button');
console.log('Clicked Start Benchmark');

// Wait for cells to render (the setInterval populates sensors array)
await new Promise(r => setTimeout(r, 1000));

// Check if grid rendered
const cellCount = await page.evaluate(() => document.querySelectorAll('.cell').length);
console.log('Cell count:', cellCount);

// Check stats
const tick = await page.evaluate(() => document.body.innerText.match(/Tick:\s*(\d+)/)?.[1]);
console.log('Tick:', tick);

await browser.close();

if (errors.length > 0) {
  console.log('\nERRORS:', errors);
  process.exit(1);
} else {
  console.log('\nStress demo loaded successfully!');
}
