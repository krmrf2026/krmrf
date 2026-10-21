#!/usr/bin/env node
/** Run the project's unmodified QA chain with progress and a complete local log. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const cache = path.join(root, '.cache');
fs.mkdirSync(cache, { recursive: true });
const logPath = path.join(cache, 'qa-last.log');
const log = fs.createWriteStream(logPath, { flags: 'w' });
const child = spawn('npm', ['run', 'qa'], { cwd: root, stdio: ['inherit', 'pipe', 'pipe'] });
let recent = [];
let partial = '';
let stage = 'запуск';
let lastActivity = Date.now();
let finished = false;
const started = Date.now();
console.log('QA запущена; полный журнал: ' + path.relative(root, logPath));
console.log('Во время длительной проверки истории карты вывод может быть кратким.');
const onLine = line => {
  recent.push(line);
  if (recent.length > 90) recent.shift();
  const match = line.match(/^> (?:krmrf-static-archive@\S+ )?(?:(?:npm run|node|python3|playwright)\s+)?([\w:.-]+)(?:\s|$)/)
    || line.match(/^npm notice run (?:krmrf-static-archive@\S+ )?([\w:.-]+)/);
  if (match && !line.includes('&&')) {
    const next = match[1];
    if (next !== stage) {
      stage = next;
      console.log('→ ' + stage);
    }
  }
  if (/Проверка не пройдена:|^✖ |^Error:|^FAIL\b|^not ok\b/i.test(line)) console.error(line);
};
const handle = chunk => {
  lastActivity = Date.now();
  log.write(chunk);
  partial += chunk.toString('utf8');
  const lines = partial.split(/\r?\n/);
  partial = lines.pop() ?? '';
  for (const line of lines) onLine(line);
};
child.stdout.on('data', handle);
child.stderr.on('data', handle);
const heartbeat = setInterval(() => {
  const time = Math.round((Date.now() - started) / 1000);
  const quiet = Math.round((Date.now() - lastActivity) / 1000);
  console.log(`… QA выполняется: ${time} с; этап: ${stage}; нет нового вывода: ${quiet} с`);
}, 20000);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
const end = code => {
  if (finished) return;
  finished = true;
  clearInterval(heartbeat);
  if (partial) onLine(partial);
  log.end();
  if (code === 0) console.log('PASS: полная QA завершена без ошибок. Журнал: ' + path.relative(root, logPath));
  else {
    console.error(`FAIL: QA EXIT ${code}; полный журнал: ${path.relative(root, logPath)}`);
    console.error('Последние строки журнала:');
    for (const line of recent.slice(-35)) console.error(line);
  }
  process.exitCode = code;
};
child.on('error', error => {
  console.error('Не удалось запустить npm: ' + error.message);
  end(1);
});
child.on('close', (code, signal) => {
  end(code ?? (signal ? 130 : 1));
});
