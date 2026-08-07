#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(TOOLS_DIR, '..');
const SNAKE_DIR = path.join(ROOT_DIR, 'snake55');

const EXPECTED_SCRIPTS = [
  '02_config.js',
  '03_core.js',
  '04_collision.js',
  '05_particle.js',
  '06_snake.js',
  '07_enemy.js',
  '08_skill.js',
  '09_wave.js',
  '10_audio.js',
  '11_render.js',
  '12_ui.js',
  '13_editor.js',
  '14_main.js',
  '15_profiler.js',
  '16_skill_econ.js'
];

const MARKDOWN_ENTRIES = [
  'AGENTS.md',
  'README.md',
  'docs/README.md',
  'docs/PROJECT-BRIEF.md',
  'docs/PROJECT-STATUS.md',
  'docs/DEBT.md',
  'docs/ARCHITECTURE.md',
  'docs/plans/STATUS.md'
];

const errors = [];

function report(category, message, file, line, column) {
  const location = file
    ? `${path.relative(ROOT_DIR, file)}${line ? `:${line}${column ? `:${column}` : ''}` : ''}`
    : '';
  errors.push({ category, message, location });
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function enumerateBusinessScripts() {
  if (!fs.existsSync(SNAKE_DIR)) {
    report('files', 'missing snake55 directory', SNAKE_DIR);
    return [];
  }

  return fs.readdirSync(SNAKE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(SNAKE_DIR, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function checkJavaScriptSyntax(files) {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
      shell: false,
      windowsHide: true
    });

    if (result.error) {
      report('javascript syntax', result.error.message, file);
      continue;
    }

    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout || `exit code ${result.status}`).trim();
      report('javascript syntax', detail, file);
    }
  }
}

function isIdentifierStart(character) {
  return Boolean(character) && /[A-Za-z_$]/.test(character);
}

function isIdentifierPart(character) {
  return Boolean(character) && /[A-Za-z0-9_$]/.test(character);
}

function previousNonWhitespace(source, index) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(source[cursor])) return source[cursor];
  }
  return '';
}

function nextNonWhitespace(source, index) {
  for (let cursor = index; cursor < source.length; cursor += 1) {
    if (!/\s/.test(source[cursor])) return source[cursor];
  }
  return '';
}

function isRegexStart(previousCharacter, previousToken) {
  if (!previousCharacter) return true;
  if ('=([{!&|?:;,~+-*%^<>'.includes(previousCharacter)) return true;
  return new Set([
    'case', 'delete', 'do', 'else', 'in', 'instanceof', 'new', 'return',
    'throw', 'typeof', 'void', 'while', 'with', 'yield', 'await'
  ]).has(previousToken);
}

function scanForbiddenModuleSyntax(source, file) {
  let state = 'code';
  let escaped = false;
  let regexCharacterClass = false;
  let line = 1;
  let column = 1;
  let token = '';
  let previousToken = '';
  let previousCharacter = '';

  function advance(character) {
    if (character === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  function recordModuleToken(value, tokenLine, tokenColumn, tokenStart, tokenEnd) {
    if (value !== 'import' && value !== 'export') return;

    const before = previousNonWhitespace(source, tokenStart);
    const after = nextNonWhitespace(source, tokenEnd);
    const propertyKey = before === '.' || after === ':';
    if (propertyKey) return;

    report(
      'module syntax',
      `forbidden ${value} token (also covers ${value === 'import' ? 'import(), import.meta, and side-effect imports' : 'module exports'})`,
      file,
      tokenLine,
      tokenColumn
    );
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === 'line-comment') {
      if (character === '\n') state = 'code';
      advance(character);
      continue;
    }

    if (state === 'block-comment') {
      if (character === '*' && next === '/') {
        advance(character);
        index += 1;
        advance('/');
        state = 'code';
      } else {
        advance(character);
      }
      continue;
    }

    if (state === 'single-quote' || state === 'double-quote') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if ((state === 'single-quote' && character === "'") || (state === 'double-quote' && character === '"')) {
        state = 'code';
      }
      advance(character);
      continue;
    }

    if (state === 'template') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '`') {
        state = 'code';
      }
      advance(character);
      continue;
    }

    if (state === 'regex') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '[') {
        regexCharacterClass = true;
      } else if (character === ']' && regexCharacterClass) {
        regexCharacterClass = false;
      } else if (character === '/' && !regexCharacterClass) {
        state = 'code';
      }
      advance(character);
      continue;
    }

    if (character === '/' && next === '/') {
      state = 'line-comment';
      advance(character);
      index += 1;
      advance('/');
      continue;
    }

    if (character === '/' && next === '*') {
      state = 'block-comment';
      advance(character);
      index += 1;
      advance('*');
      continue;
    }

    if (character === "'") {
      state = 'single-quote';
      escaped = false;
      advance(character);
      continue;
    }

    if (character === '"') {
      state = 'double-quote';
      escaped = false;
      advance(character);
      continue;
    }

    if (character === '`') {
      state = 'template';
      escaped = false;
      advance(character);
      continue;
    }

    if (character === '/') {
      if (isRegexStart(previousCharacter, previousToken)) {
        state = 'regex';
        escaped = false;
        regexCharacterClass = false;
      } else {
        previousCharacter = character;
      }
      advance(character);
      continue;
    }

    if (isIdentifierStart(character)) {
      const tokenLine = line;
      const tokenColumn = column;
      const tokenStart = index;
      let end = index + 1;
      while (end < source.length && isIdentifierPart(source[end])) end += 1;
      const value = source.slice(index, end);
      recordModuleToken(value, tokenLine, tokenColumn, tokenStart, end);
      previousToken = value;
      previousCharacter = value[value.length - 1];
      while (index < end) {
        advance(source[index]);
        index += 1;
      }
      index -= 1;
      token = value;
      continue;
    }

    if (!/\s/.test(character)) previousCharacter = character;
    if (!/\s/.test(character)) token = '';
    advance(character);
  }
}

function checkForbiddenModuleSyntax(files) {
  for (const file of files) scanForbiddenModuleSyntax(readText(file), file);
}

function stripScriptQueryAndHash(value) {
  return value.split(/[?#]/, 1)[0].replaceAll('\\', '/');
}

function checkHtmlScripts() {
  const file = path.join(SNAKE_DIR, 'index.html');
  if (!fs.existsSync(file)) {
    report('index.html scripts', 'missing snake55/index.html', file);
    return;
  }

  const source = readText(file);
  const actual = [];
  const scriptPattern = /<script\b[^>]*>/gi;
  let match;

  while ((match = scriptPattern.exec(source)) !== null) {
    const tag = match[0];
    const srcMatch = /\bsrc\s*=\s*(['"])(.*?)\1/i.exec(tag);
    if (!srcMatch) continue;

    const rawSource = srcMatch[2];
    const normalizedPath = stripScriptQueryAndHash(rawSource).replace(/^\.\//, '');
    const fileName = path.posix.basename(normalizedPath);
    const line = source.slice(0, match.index).split('\n').length;
    actual.push({ fileName, rawSource, normalizedPath, line });

    const queryStart = rawSource.indexOf('?');
    const hashStart = rawSource.indexOf('#');
    const queryEnd = hashStart >= 0 && (queryStart < 0 || hashStart < queryStart) ? hashStart : rawSource.length;
    if (queryStart < 0 || queryStart > queryEnd) {
      report('index.html scripts', `script ${rawSource} is missing ?v= cache stamp`, file, line);
      continue;
    }

    const query = rawSource.slice(queryStart + 1, queryEnd);
    const params = new URLSearchParams(query);
    if (!params.has('v') || !params.get('v')) {
      report('index.html scripts', `script ${rawSource} has an empty or missing ?v= cache stamp`, file, line);
    }
  }

  if (actual.length !== EXPECTED_SCRIPTS.length) {
    report('index.html scripts', `expected ${EXPECTED_SCRIPTS.length} external scripts, found ${actual.length}`, file);
  }

  const actualNames = actual.map((script) => script.fileName);
  const expectedSet = new Set(EXPECTED_SCRIPTS);
  const actualCounts = new Map();
  for (const script of actual) actualCounts.set(script.fileName, (actualCounts.get(script.fileName) || 0) + 1);

  for (const expected of EXPECTED_SCRIPTS) {
    if (!actualNames.includes(expected)) report('index.html scripts', `missing expected script ${expected}`, file);
  }
  for (const actualName of new Set(actualNames)) {
    if (!expectedSet.has(actualName)) report('index.html scripts', `unexpected script ${actualName}`, file);
  }
  for (const [name, count] of actualCounts) {
    if (count > 1) report('index.html scripts', `duplicate script ${name} appears ${count} times`, file);
  }

  for (let index = 0; index < Math.max(actualNames.length, EXPECTED_SCRIPTS.length); index += 1) {
    if (actualNames[index] !== EXPECTED_SCRIPTS[index]) {
      report(
        'index.html scripts',
        `order mismatch at position ${index + 1}: expected ${EXPECTED_SCRIPTS[index] || '<none>'}, found ${actualNames[index] || '<none>'}`,
        file
      );
    }
  }

  const cacheStamps = actual
    .map((script) => {
      const queryStart = script.rawSource.indexOf('?');
      const query = queryStart >= 0 ? script.rawSource.slice(queryStart + 1).split('#', 1)[0] : '';
      return new URLSearchParams(query).get('v');
    })
    .filter((stamp) => stamp !== null && stamp !== '');
  const uniqueStamps = new Set(cacheStamps);
  if (uniqueStamps.size > 1) {
    report('index.html scripts', `cache stamps are inconsistent: ${[...uniqueStamps].join(', ')}`, file);
  }
}

function maskMarkdownCode(source) {
  const lines = source.split(/(?<=\n)/);
  let inFence = false;
  let inlineCode = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return ' '.repeat(line.length);
    }
    if (inFence) return ' '.repeat(line.length);

    let masked = '';
    for (const character of line) {
      if (character === '`') {
        inlineCode = !inlineCode;
        masked += ' ';
      } else {
        masked += inlineCode ? ' ' : character;
      }
    }
    return masked;
  }).join('');
}

function checkMarkdownLinks() {
  for (const relativeFile of MARKDOWN_ENTRIES) {
    const file = path.join(ROOT_DIR, relativeFile);
    if (!fs.existsSync(file)) {
      report('markdown links', 'missing formal Markdown entry', file);
      continue;
    }

    const source = readText(file);
    const masked = maskMarkdownCode(source);
    const linkPattern = /!?\[[^\]]*\]\(([^\n]*?)\)/g;
    let match;
    while ((match = linkPattern.exec(masked)) !== null) {
      const line = masked.slice(0, match.index).split('\n').length;
      let target = match[1].trim();
      if (target.startsWith('<')) {
        const end = target.indexOf('>');
        target = end >= 0 ? target.slice(1, end) : target;
      } else {
        target = target.split(/\s+/, 1)[0];
      }

      if (!target || target.startsWith('#') || target.startsWith('//') || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) continue;

      const pathOnly = target.split(/[?#]/, 1)[0];
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(pathOnly);
      } catch (error) {
        report('markdown links', `URL decode failed for ${target}: ${error.message}`, file, line);
        continue;
      }

      const resolved = decodedPath.startsWith('/')
        ? path.resolve(ROOT_DIR, decodedPath.slice(1))
        : path.resolve(path.dirname(file), decodedPath);
      const relativeResolved = path.relative(ROOT_DIR, resolved);
      if (relativeResolved.startsWith('..') || path.isAbsolute(relativeResolved)) {
        report('markdown links', `local link resolves outside repository: ${target}`, file, line);
        continue;
      }
      if (!fs.existsSync(resolved)) report('markdown links', `broken local link: ${target}`, file, line);
    }
  }
}

function checkPresentationFoundation() {
  const configFile = path.join(SNAKE_DIR, '02_config.js');
  const particleFile = path.join(SNAKE_DIR, '05_particle.js');
  const renderFile = path.join(SNAKE_DIR, '11_render.js');
  const config = readText(configFile);
  const particle = readText(particleFile);
  const render = readText(renderFile);
  const requiredTokens = ['dot:', 'normal:', 'crit:', 'combo:', 'playerHurt:', 'status:', 'debugSource:'];

  for (const token of requiredTokens) {
    if (!config.includes(token)) report('presentation foundation', `missing combat text token ${token}`, configFile);
  }
  if (!config.includes('normalMode: \'recent-hit\'')) report('presentation foundation', 'missing normal enemy recent-hit HP bar policy', configFile);
  if (!particle.includes('function resolveCombatText(') || !particle.includes('function emitCombatText(')) {
    report('presentation foundation', 'missing unified combat text resolver', particleFile);
  }
  if (!render.includes('function shouldDrawHpBar(')) report('presentation foundation', 'missing HP bar presentation policy resolver', renderFile);
}

function runCheck(label, callback) {
  try {
    callback();
  } catch (error) {
    report(label, error instanceof Error ? error.message : String(error));
  }
}

const scripts = enumerateBusinessScripts();
runCheck('javascript syntax', () => checkJavaScriptSyntax(scripts));
runCheck('module syntax', () => checkForbiddenModuleSyntax(scripts));
runCheck('index.html scripts', checkHtmlScripts);
runCheck('markdown links', checkMarkdownLinks);
runCheck('presentation foundation', checkPresentationFoundation);

if (errors.length === 0) {
  console.log('Project static check passed: JavaScript, module syntax, script loading contract, cache stamps, and Markdown links.');
} else {
  console.error(`Project static check failed with ${errors.length} error(s):`);
  for (const error of errors) {
    const location = error.location ? ` [${error.location}]` : '';
    console.error(`- ${error.category}${location}: ${error.message}`);
  }
}

process.exitCode = errors.length === 0 ? 0 : 1;
