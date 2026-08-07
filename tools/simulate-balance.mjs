import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_FILE = path.join(ROOT_DIR, 'snake55', '02_config.js');
const RUNS = 20000;
const RUN_SECONDS = 420;

function loadConfig() {
  const source = fs.readFileSync(CONFIG_FILE, 'utf8');
  const sandbox = { window: {} };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: CONFIG_FILE });
  return sandbox.window.CONFIG;
}

function makeRng(seed) {
  let state = seed >>> 0;
  return function random() {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function segmentAt(segments, second) {
  for (const segment of segments) {
    if (second >= segment.startSec && second < segment.endSec) return segment;
  }
  return segments[segments.length - 1];
}

function candidates(config, owned, starterOnly) {
  const out = [];
  for (const id of config.SKILL.list) {
    const level = owned[id] || 0;
    if (level === 0 && (!starterOnly || config.SKILL.starterEligible[id])) out.push({ id, level: 1, isNew: true });
    else if (level < config.SKILL.maxLevel) out.push({ id, level: level + 1, isNew: false });
  }
  return out;
}

function buildOffer(config, owned, upgrades, random) {
  const all = candidates(config, owned, upgrades === 0);
  const attacks = all.filter((entry) => config.SKILL.attackSkills.includes(entry.id));
  const survival = all.filter((entry) => config.SKILL.survivalSkills.includes(entry.id));
  const picks = [];
  const used = new Set();
  const take = (pool) => {
    const available = pool.filter((entry) => !used.has(entry.id));
    if (!available.length) return;
    const entry = available[Math.floor(random() * available.length)];
    used.add(entry.id);
    picks.push(entry);
  };
  for (let i = 0; i < config.ECON.guaranteeAttack; i++) take(attacks);
  for (let i = 0; i < config.ECON.guaranteeSurvival; i++) take(survival);
  while (picks.length < config.ECON.choiceCount) {
    const remaining = all.filter((entry) => !used.has(entry.id));
    if (!remaining.length) break;
    const sum = remaining.reduce((total, entry) => total + (entry.isNew ? config.ECON.newSkillWeight : config.ECON.upgradeWeight), 0);
    let roll = random() * sum;
    let picked = remaining[remaining.length - 1];
    for (const entry of remaining) {
      roll -= entry.isNew ? config.ECON.newSkillWeight : config.ECON.upgradeWeight;
      if (roll <= 0) { picked = entry; break; }
    }
    used.add(picked.id);
    picks.push(picked);
  }
  return picks;
}

function chooseDualFireCombo(offer, owned) {
  const focus = ['fire', 'bolt', 'ice'];
  const offeredFocus = offer.filter((entry) => focus.includes(entry.id) && (owned[entry.id] || 0) < 5);
  if (offeredFocus.length) {
    offeredFocus.sort((a, b) => (owned[a.id] || 0) - (owned[b.id] || 0));
    return offeredFocus[0].id;
  }
  const available = offer.filter((entry) => (owned[entry.id] || 0) < 5);
  available.sort((a, b) => (owned[a.id] || 0) - (owned[b.id] || 0));
  return available.length ? available[0].id : offer[0].id;
}

function fullComboCount(config, owned) {
  let count = 0;
  for (const combo of Object.values(config.COMBO)) {
    if (combo.parts.every((id) => (owned[id] || 0) >= config.SKILL.maxLevel)) count++;
  }
  return count;
}

function simulateRun(config, seed) {
  const random = makeRng(seed);
  const owned = {};
  const pickup = config.PICKUP;
  let upgrades = 0;
  let killsSinceSkill = 0;
  let lastSkillBall = 0;
  let gotFirst = false;
  let killCarry = 0;
  let drops = 0;
  let fullAtBoss = 0;
  const dropsByStage = [0, 0, 0, 0, 0];

  for (let second = 0; second < RUN_SECONDS; second++) {
    const segment = segmentAt(config.STAGE.segments, second);
    const stageIndex = segment.id - 1;
    // 保守模型：清场率按当前波次的 90% 估计；它只驱动掉落概率/保底，不替代真实战斗模拟。
    killCarry += segment.spawnRate * 0.9;
    let kills = Math.floor(killCarry);
    killCarry -= kills;
    if (!gotFirst && second >= pickup.skillPity.firstSkillGuaranteeSec) {
      gotFirst = true;
      lastSkillBall = second;
      drops++;
      dropsByStage[stageIndex]++;
      const offer = buildOffer(config, owned, upgrades, random);
      const picked = chooseDualFireCombo(offer, owned);
      owned[picked] = (owned[picked] || 0) + 1;
      upgrades++;
    }
    while (kills-- > 0) {
      killsSinceSkill++;
      if (!gotFirst) continue;
      const ownedKinds = Object.values(owned).filter((level) => level > 0).length;
      const chance = Math.max(pickup.skill.floorRate, pickup.skill.baseDropRate - pickup.skill.perOwnedPenalty * ownedKinds);
      const pity = segment.id !== 1 && killsSinceSkill >= pickup.skillPity.killStreakGuarantee;
      if (!pity && random() >= chance) continue;
      const gap = pickup.upgradeMinGapSecBySeg[stageIndex] || 0;
      if (gap > 0 && second - lastSkillBall < gap) continue;
      if (Object.values(owned).every((level) => level >= config.SKILL.maxLevel)) continue;
      lastSkillBall = second;
      killsSinceSkill = 0;
      drops++;
      dropsByStage[stageIndex]++;
      const offer = buildOffer(config, owned, upgrades, random);
      const picked = chooseDualFireCombo(offer, owned);
      owned[picked] = (owned[picked] || 0) + 1;
      upgrades++;
    }
    if (second === config.STAGE.segments[4].startSec) fullAtBoss = fullComboCount(config, owned);
  }
  return { upgrades, drops, fullAtBoss, fullAtEnd: fullComboCount(config, owned), owned, dropsByStage };
}

function percentile(values, p) {
  const index = Math.min(values.length - 1, Math.max(0, Math.floor((values.length - 1) * p)));
  return values[index];
}

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

function stageHealthIngress(config) {
  return config.STAGE.segments.map((segment) => {
    const meanHp = mean(segment.pool.map((id) => config.ENEMIES[id].hp));
    return `${segment.id}:${(meanHp * segment.spawnRate).toFixed(1)}`;
  });
}

function main() {
  const config = loadConfig();
  const runs = [];
  for (let i = 1; i <= RUNS; i++) runs.push(simulateRun(config, i));
  const upgradeValues = runs.map((run) => run.upgrades).sort((a, b) => a - b);
  const bossComboValues = runs.map((run) => run.fullAtBoss).sort((a, b) => a - b);
  const endComboValues = runs.map((run) => run.fullAtEnd).sort((a, b) => a - b);
  const stageDrops = [0, 1, 2, 3, 4].map((index) => mean(runs.map((run) => run.dropsByStage[index])));
  const twoComboChance = runs.filter((run) => run.fullAtEnd >= 2).length / RUNS;
  const allComboChance = runs.filter((run) => run.fullAtEnd >= 3).length / RUNS;

  console.log('Balance economy simulation (dual-fire focused strategy)');
  console.log(`runs=${RUNS}; horizon=${RUN_SECONDS}s; clear-rate assumption=90% of current spawn rate`);
  console.log(`mean HP ingress per second by stage: ${stageHealthIngress(config).join(' / ')}`);
  console.log(`skill upgrades: mean=${mean(upgradeValues).toFixed(2)} p10=${percentile(upgradeValues, 0.10)} p50=${percentile(upgradeValues, 0.50)} p90=${percentile(upgradeValues, 0.90)}`);
  console.log(`drops by stage mean: ${stageDrops.map((value) => value.toFixed(2)).join(' / ')}`);
  console.log(`full combos at boss start: mean=${mean(bossComboValues).toFixed(2)} p50=${percentile(bossComboValues, 0.50)}; at 420s: mean=${mean(endComboValues).toFixed(2)} p50=${percentile(endComboValues, 0.50)}`);
  console.log(`chance of >=2 full combos by 420s=${(twoComboChance * 100).toFixed(1)}%; chance of all 3=${(allComboChance * 100).toFixed(1)}%`);
}

main();
