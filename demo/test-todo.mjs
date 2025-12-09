import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', msg => console.log('PAGE:', msg.text()));
page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

const filePath = 'file://' + path.resolve(__dirname, 'todo.html');
await page.goto(filePath, { waitUntil: 'networkidle' });

// Check initial render
const todos = await page.evaluate(() => {
  return [...document.querySelectorAll('.todo-item')].map(el => ({
    text: el.querySelector('.todo-text')?.textContent,
    done: el.classList.contains('done')
  }));
});
console.log('Initial todos:', JSON.stringify(todos));

// Check stats
const stats = await page.evaluate(() => document.querySelector('.stats')?.textContent);
console.log('Stats:', stats);

// Add a new todo
await page.fill('input[name=text]', 'Test new todo');
await page.click('.add-form button');
await new Promise(r => setTimeout(r, 100));

const afterAdd = await page.evaluate(() => document.querySelectorAll('.todo-item').length);
console.log('After adding todo:', afterAdd, 'items');

// Toggle first todo (uncheck it)
await page.click('.todo-item input[type=checkbox]');
await new Promise(r => setTimeout(r, 100));

const firstDone = await page.evaluate(() => document.querySelector('.todo-item')?.classList.contains('done'));
console.log('First todo done after toggle:', firstDone);

// Filter to active only
await page.evaluate(() => document.querySelectorAll('.filters button')[1].click());
await new Promise(r => setTimeout(r, 100));

const activeCount = await page.evaluate(() => document.querySelectorAll('.todo-item').length);
console.log('Active filter shows:', activeCount, 'items');

await browser.close();
console.log('\nDemo works!');
