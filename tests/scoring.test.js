// Scoring-engine regression tests for the Auto Advisor.
//
// We don't run a real DOM. The strategy is:
//   1. Read auto-advisor-data.js (pure data + per-archetype score fns)
//   2. Read the inline <script> of auto-advisor.html, truncate at the
//      "wiring" section (which assumes a DOM), and concat it after the
//      data file inside an IIFE that returns the public surface we care
//      about (rankArchetypes, modelsForArchetype, MODELS, ARCHETYPES).
//   3. Stub `document.getElementById` for the few callsites the truncated
//      block reaches (TCO helpers read tcoYears / tcoKm / fuel-price inputs).
//
// Run: `npm test` (or `node --test tests/`).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadAdvisor() {
  const root = path.join(__dirname, '..');
  const data = fs.readFileSync(path.join(root, 'auto-advisor-data.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'auto-advisor.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  if (!m) throw new Error('Could not locate inline <script> in auto-advisor.html');
  // Cut everything from the wiring section onwards — that part assumes a DOM
  // and would throw at module init.
  const truncated = m[1].split(/\/\/ ---------- state persistence/)[0];
  // Stub a tiny document so the helper closures defined before "wiring"
  // (TCO etc.) can be referenced without throwing.
  const stubVals = {
    tcoYears: '5', tcoKm: '20000', tcoPurchase: '30000',
    tcoPetrol: '1.50', tcoDiesel: '1.55', tcoLpg: '0.80', tcoElec: '0.20',
  };
  global.document = {
    getElementById: (id) => ({ value: stubVals[id] || '15000', dataset: {}, addEventListener: () => {} }),
    addEventListener: () => {},
  };
  const wrapped =
    '(function(){' + data + '\n' + truncated +
    '\n; return { ARCHETYPES, MODELS, modelsForArchetype, rankArchetypes, budgetAdjustment, computeTCO };})()';
  // eslint-disable-next-line no-eval
  return eval(wrapped);
}

const advisor = loadAdvisor();

// Mirror the form defaults so tests reflect what a real first-time user sees.
const baseAns = {
  budget: 20000, condition: 'nearlyNew', years: 5, annualKm: 15000,
  drivingMix: 'mixed', seats: '4-5', climate: 'mild', towing: 'none',
  childSeats: 0, bodyPref: 'open', fuelPref: 'open', drivePref: 'open',
  transmission: 'open', charging: 'home', reliability: 'balanced',
};

function topIds(ans, n = 3) {
  return advisor.rankArchetypes(ans).slice(0, n).map((r) => r.arch.id);
}

// ---------- coverage ----------

test('every archetype has at least 3 real models attached', () => {
  for (const arch of advisor.ARCHETYPES) {
    const models = advisor.modelsForArchetype(arch.id);
    assert.ok(
      models.length >= 3,
      `archetype ${arch.id} only has ${models.length} models — expected ≥ 3`
    );
  }
});

test('every archetype declares all required fields', () => {
  const required = ['id', 'name', 'desc', 'body', 'fuels', 'examples', 'pros', 'cons',
    'priceBand', 'consumption', 'insurance', 'maintenance', 'depreciation', 'score'];
  for (const arch of advisor.ARCHETYPES) {
    for (const key of required) {
      assert.ok(arch[key] !== undefined, `archetype ${arch.id} missing ${key}`);
    }
    for (const cond of ['new', 'nearlyNew', 'used', 'old']) {
      assert.ok(Array.isArray(arch.priceBand[cond]),
        `archetype ${arch.id} missing priceBand.${cond}`);
    }
  }
});

test('every model declares a valid Euro emissions class', () => {
  const valid = new Set(['Euro 5', 'Euro 6b', 'Euro 6d-temp', 'Euro 6d', 'Euro 7', 'EV']);
  for (const m of advisor.MODELS) {
    assert.ok(valid.has(m.euroClass),
      `model ${m.id} has euroClass="${m.euroClass}", not in valid set`);
  }
});

test('LEZ access values are from the known enum', () => {
  const valid = new Set(['eu-wide', 'restricted', 'banned-major', 'ev']);
  for (const m of advisor.MODELS) {
    assert.ok(valid.has(m.lezAccess),
      `model ${m.id} has lezAccess="${m.lezAccess}", not in valid set`);
  }
});

test('NCAP is null (untested) or an integer 0..5', () => {
  for (const m of advisor.MODELS) {
    if (m.ncap == null) continue;
    assert.ok(Number.isInteger(m.ncap) && m.ncap >= 0 && m.ncap <= 5,
      `model ${m.id} has ncap=${m.ncap}`);
  }
});

// ---------- canonical user profiles ----------

test('city, < 10k km, no fuel preference → ranks Urban BEV or City Petrol Hatch top', () => {
  const ans = { ...baseAns, annualKm: 5000, drivingMix: 'city' };
  const top = topIds(ans, 3);
  assert.ok(top.includes('urban-bev') || top.includes('city-petrol-hatch'),
    'expected urban-bev or city-petrol-hatch in top 3, got: ' + top.join(', '));
});

test('highway 35k km/yr + diesel pref → top is a diesel combi or sedan', () => {
  const ans = { ...baseAns, annualKm: 27500, drivingMix: 'highway', fuelPref: 'diesel' };
  const top = topIds(ans, 3);
  const dieselTop = ['family-combi-diesel', 'highway-diesel-sedan', 'mid-suv-diesel'];
  assert.ok(dieselTop.some((id) => top.includes(id)),
    'expected at least one diesel combi/sedan/SUV in top 3, got: ' + top.join(', '));
});

test('family with 2 kids + SUV preference → top includes a mid-size SUV variant', () => {
  const ans = { ...baseAns, bodyPref: 'suv', childSeats: 2, budget: 35000 };
  const top = topIds(ans, 3);
  const suvVariants = ['mid-suv-diesel', 'mid-suv-hybrid', 'phev-family', 'seven-seat-suv'];
  assert.ok(suvVariants.some((id) => top.includes(id)),
    'expected a mid-size SUV variant in top 3, got: ' + top.join(', '));
});

test('big family + 6-7 seats → top is 7-seat SUV or MPV', () => {
  const ans = { ...baseAns, seats: '6-7', childSeats: 3, budget: 25000 };
  const top = topIds(ans, 2);
  assert.ok(top.includes('seven-seat-suv') || top.includes('mpv-7seat'),
    'expected seven-seat-suv or mpv-7seat in top 2, got: ' + top.join(', '));
});

test('off-road + mountain + 4x4 preference → top is body-on-frame 4x4', () => {
  const ans = { ...baseAns, drivingMix: 'offroad', climate: 'mountain', drivePref: '4x4', budget: 50000 };
  const top = topIds(ans, 1);
  assert.equal(top[0], 'offroad-4x4',
    'expected offroad-4x4 as top match, got: ' + top[0]);
});

test('home-charged + EV preference + city → top is Urban BEV', () => {
  const ans = { ...baseAns, drivingMix: 'city', fuelPref: 'bev', charging: 'home', budget: 25000 };
  const top = topIds(ans, 1);
  assert.equal(top[0], 'urban-bev',
    'expected urban-bev as top match, got: ' + top[0]);
});

test('cabrio body preference + fun reliability → top is Cabrio', () => {
  const ans = { ...baseAns, bodyPref: 'cabrio', reliability: 'fun', seats: '2', budget: 30000 };
  const top = topIds(ans, 1);
  assert.equal(top[0], 'cabrio',
    'expected cabrio as top match, got: ' + top[0]);
});

test('LPG fuel preference → top is LPG Bi-Fuel Runabout', () => {
  const ans = { ...baseAns, fuelPref: 'lpg', annualKm: 27500, budget: 12000 };
  const top = topIds(ans, 1);
  assert.equal(top[0], 'lpg-petrol-runabout',
    'expected lpg-petrol-runabout as top match, got: ' + top[0]);
});

// ---------- regression guards ----------

test('Tucson and Sportage are not in mid-suv-diesel (1.6 CRDi quality drop)', () => {
  const dieselSuvCars = advisor.modelsForArchetype('mid-suv-diesel').map((m) => m.id);
  assert.ok(!dieselSuvCars.includes('hyundai-tucson-nx4'),
    'hyundai-tucson-nx4 must not be in mid-suv-diesel');
  assert.ok(!dieselSuvCars.includes('kia-sportage-nq5'),
    'kia-sportage-nq5 must not be in mid-suv-diesel');
});

test('Mazda CX-5 has no diesel variant left', () => {
  const cx5 = advisor.MODELS.find((m) => m.id === 'mazda-cx5');
  assert.ok(cx5, 'mazda-cx5 model present');
  assert.ok(!cx5.variants.some((v) => v.fuel === 'diesel'),
    'CX-5 still lists a diesel variant');
});

test('Dacia Duster is not in the database (quality cut)', () => {
  assert.ok(!advisor.MODELS.some((m) => m.id.startsWith('dacia-duster')),
    'Dacia Duster reappeared in the model list');
});

test('mid-suv-diesel includes BMW X3, Mercedes GLC, Audi Q5, Volvo XC60 (premium replacements)', () => {
  const ids = advisor.modelsForArchetype('mid-suv-diesel').map((m) => m.id);
  for (const id of ['bmw-x3-g01', 'mercedes-glc-x253', 'audi-q5-fy', 'volvo-xc60-ii']) {
    assert.ok(ids.includes(id),
      `${id} expected in mid-suv-diesel, got: ${ids.join(', ')}`);
  }
});
