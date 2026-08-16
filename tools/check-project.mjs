#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

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
  'CHANGELOG.md',
  'docs/PROJECT.md',
  'docs/STATUS.md',
  'docs/ARCHITECTURE.md',
  'docs/WORKFLOW.md',
  'docs/QA.md'
];

const LEGACY_ACTIVE_PATHS = [
  'docs/PROJECT-BRIEF.md',
  'docs/PROJECT-STATUS.md',
  'docs/CHATGPT-CONTROL.md',
  'docs/DEBT.md',
  'docs/README.md',
  'docs/AI-COLLABORATION.md',
  'docs/plans/STATUS.md',
  'docs/plans/README.md',
  'docs/audio/AUDIO-BIBLE.md',
  'docs/audio/SKILL-AUDIO-GUIDE.md',
  'docs/design/SKILL-VFX-GUIDE.md',
  'snake55/docs/AUDIO_SYSTEM_SPEC.md',
  'snake55/docs/AUDIO_EVENT_MATRIX.md',
  'snake55/AGENTS.md',
  'snake55/docs/balance'
];

const ACTIVE_MARKDOWN_ROOTS = [
  path.join(ROOT_DIR, 'docs'),
  path.join(ROOT_DIR, '.agents', 'skills')
];

const ACTIVE_MARKDOWN_EXCLUDES = [
  `${path.sep}docs${path.sep}archive${path.sep}`,
  `${path.sep}docs${path.sep}plans${path.sep}archive${path.sep}`,
  `${path.sep}docs${path.sep}plans${path.sep}deprecated${path.sep}`,
  `${path.sep}docs${path.sep}plans${path.sep}diagnosis${path.sep}`
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

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function parsePcmWav(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let offset = 12;
  let fmt = null;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > buffer.length) throw new Error(`truncated WAV chunk ${id}`);
    if (id === 'fmt ' && size >= 16) {
      fmt = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      dataBytes += size;
    }
    offset = body + size + (size % 2);
  }
  if (!fmt) throw new Error('missing fmt chunk');
  if (!dataBytes) throw new Error('missing data chunk');
  return { ...fmt, dataBytes };
}

function checkAudioAssets() {
  const bankDir = path.join(SNAKE_DIR, 'assets', 'audio', 'combat', 'audio-next-v1');
  const manifestFile = path.join(bankDir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    report('audio assets', 'missing Combat Bank manifest.json', manifestFile);
    return;
  }
  const manifest = JSON.parse(readText(manifestFile));
  const expected = manifest.combatFiles || {};
  let totalBytes = 0;
  let decodedBytes = 0;
  for (const [name, entry] of Object.entries(expected)) {
    const file = path.join(bankDir, name);
    if (!fs.existsSync(file)) {
      report('audio assets', `missing Combat WAV ${name}`, file);
      continue;
    }
    if (sha256File(file) !== entry.sha256) report('audio assets', `SHA mismatch for ${name}`, file);
    try {
      const wav = parsePcmWav(file);
      if (wav.audioFormat !== 1) report('audio assets', `${name} must be PCM (format=1), got ${wav.audioFormat}`, file);
      if (wav.channels !== 1) report('audio assets', `${name} must be mono, got ${wav.channels} channels`, file);
      if (wav.sampleRate !== 44100) report('audio assets', `${name} must be 44100Hz, got ${wav.sampleRate}`, file);
      if (wav.bitsPerSample !== 16) report('audio assets', `${name} must be PCM16, got ${wav.bitsPerSample}-bit`, file);
      decodedBytes += (wav.dataBytes / Math.max(1, wav.bitsPerSample / 8)) * 4;
    } catch (error) {
      report('audio assets', `${name}: ${error.message}`, file);
    }
    totalBytes += fs.statSync(file).size;
  }
  const runtimeBudget = Number(manifest.budgets && manifest.budgets.runtimeBytesMax) || 2.5 * 1024 * 1024;
  const decodedBudget = Number(manifest.budgets && manifest.budgets.decodedBytesMax) || 8 * 1024 * 1024;
  if (totalBytes > runtimeBudget) report('audio assets', `Combat Bank exceeds runtime budget: ${totalBytes} bytes`, manifestFile);
  if (decodedBytes > decodedBudget) report('audio assets', `decoded Combat Bank exceeds budget: ${Math.round(decodedBytes)} bytes`, manifestFile);
  if (Number(manifest.runtimeBytes) !== totalBytes) report('audio assets', `manifest runtimeBytes=${manifest.runtimeBytes} but actual=${totalBytes}`, manifestFile);
  if (Number(manifest.runtimeFiles) !== Object.keys(expected).length) report('audio assets', 'manifest runtimeFiles does not match combatFiles count', manifestFile);

  const bgmDir = path.join(SNAKE_DIR, 'assets', 'audio', 'bgm', 'golden_modular');
  for (const [name, entry] of Object.entries(manifest.frozenBgm || {})) {
    const file = path.join(bgmDir, name);
    if (!fs.existsSync(file)) {
      report('audio assets', `missing frozen BGM ${name}`, file);
      continue;
    }
    if (sha256File(file) !== entry.sha256) report('audio assets', `frozen BGM SHA changed: ${name}`, file);
  }
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
  const files = new Set([
    ...MARKDOWN_ENTRIES.map((relativeFile) => path.join(ROOT_DIR, relativeFile)),
    ...enumerateActiveMarkdown()
  ]);
  for (const file of [...files].sort((a, b) => a.localeCompare(b))) {
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

function enumerateActiveMarkdown() {
  const files = new Set();
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (ACTIVE_MARKDOWN_EXCLUDES.some((fragment) => file.includes(fragment))) continue;
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith('.md')) files.add(file);
    }
  }
  for (const root of ACTIVE_MARKDOWN_ROOTS) visit(root);
  return [...files].sort((a, b) => a.localeCompare(b));
}

function resolveInstructionPath(reference) {
  const normalized = reference.replaceAll('\\', '/').replace(/^\.\//, '');
  const candidates = [
    path.resolve(ROOT_DIR, normalized),
    path.resolve(SNAKE_DIR, normalized)
  ];
  return candidates.find((candidate) => {
    const relative = path.relative(ROOT_DIR, candidate);
    return !relative.startsWith('..') && !path.isAbsolute(relative) && fs.existsSync(candidate);
  });
}

function checkInstructionReferences() {
  const files = [path.join(ROOT_DIR, 'AGENTS.md'), ...enumerateSkillFiles()];
  const referencePattern = /`([^`]+)`/g;
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const source = readText(file);
    let match;
    while ((match = referencePattern.exec(source)) !== null) {
      const reference = match[1].trim();
      const looksLikePath = /\.(?:md|mjs|js|html|json|yaml|yml|png|wav|ogg)$/i.test(reference)
        || /^(?:docs|snake55|tools|\.agents)[\\/]/.test(reference);
      if (!looksLikePath) continue;
      if (/^(?:https?:|mailto:)/i.test(reference) || /[()<>{}]/.test(reference)) continue;
      const line = source.slice(0, match.index).split('\n').length;
      if (!resolveInstructionPath(reference)) report('instruction paths', `referenced path does not exist: ${reference}`, file, line);
    }
  }
}

function enumerateSkillFiles() {
  const root = path.join(ROOT_DIR, '.agents', 'skills');
  if (!fs.existsSync(root)) return [];
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name === 'SKILL.md') files.push(file);
    }
  }
  visit(root);
  return files;
}

function checkLegacyActiveTree() {
  for (const relativePath of LEGACY_ACTIVE_PATHS) {
    const file = path.join(ROOT_DIR, relativePath);
    if (fs.existsSync(file)) report('active tree regression', `legacy active entry still exists: ${relativePath}`, file);
  }
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
runCheck('instruction paths', checkInstructionReferences);
runCheck('active tree', checkLegacyActiveTree);
runCheck('audio assets', checkAudioAssets);

if (errors.length === 0) {
  console.log('Project static check passed: JavaScript, module syntax, script loading contract, cache stamps, Markdown governance, and audio asset integrity.');
} else {
  console.error(`Project static check failed with ${errors.length} error(s):`);
  for (const error of errors) {
    const location = error.location ? ` [${error.location}]` : '';
    console.error(`- ${error.category}${location}: ${error.message}`);
  }
}

process.exitCode = errors.length === 0 ? 0 : 1;
