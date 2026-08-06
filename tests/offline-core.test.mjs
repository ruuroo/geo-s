import test from "node:test";
import assert from "node:assert/strict";
import {
  answerMatches,
  buildOptions,
  filterCountryPool,
  normalizeAnswer,
  repetitionWeight,
  scoreForHints,
  selectRoundCountries,
  DEFAULT_STATS,
} from "../.offline-build/src/game/core.js";
import { loadJson, saveJson } from "../.offline-build/src/game/storage.js";

const country = (id, name, capital, continents = ["Europe"]) => ({ id, cca2: id.slice(0, 2), cca3: id, norwegianName: name, englishName: name, aliases: [name], capitals: [capital], capitalAliases: [capital], continents, continentNames: continents, subregion: "Northern Europe", subregionNb: "Nord-Europa", borders: [], independent: true, territory: false, flagPath: "", shapePath: "", worldPath: "", centroid: { lat: 0, lng: 0 }, hasShape: false });
const pool = [country("NOR", "Norge", "Oslo"), country("SWE", "Sverige", "Stockholm"), country("DNK", "Danmark", "København"), country("FIN", "Finland", "Helsinki"), country("ISL", "Island", "Reykjavík")];
const settings = { mode: "flag", continents: ["Europe"], includeTerritories: false, transcontinentalAll: true, answerMethod: "choices-3", roundLength: 5, customLength: 5, difficulty: "normal", avoidRepeats: true, showFlagWithCapital: true, autoAdvance: false };

test("normalization and aliases", () => {
  assert.equal(normalizeAnswer(" Côte d’Ivoire. "), "cote divoire");
  assert.equal(answerMatches("Norway", ["Norge", "Norway"]), true);
  assert.equal(answerMatches("No", ["Norge", "Norway"]), false);
});

test("options are unique and contain exactly one correct answer", () => {
  const options = buildOptions(pool[0], pool, "country", 5, "normal", () => 0.4);
  assert.equal(options.length, 5);
  assert.equal(new Set(options.map(normalizeAnswer)).size, 5);
  assert.equal(options.filter((x) => x === "Norge").length, 1);
});

test("continent filter, round selection and scoring", () => {
  const trans = country("TUR", "Tyrkia", "Ankara", ["Europe", "Asia"]);
  assert.deepEqual(filterCountryPool([pool[0], trans], { ...settings, continents: ["Asia"] }).map((x) => x.id), ["TUR"]);
  assert.equal(new Set(selectRoundCountries(pool, 5, true, "flag", DEFAULT_STATS, () => 0.31).map((x) => x.id)).size, 5);
  assert.deepEqual([0, 1, 2, 3].map(scoreForHints), [100, 75, 50, 25]);
});

test("repetition weighting favors weak countries", () => {
  const now = Date.now();
  const good = { shown: 10, countryCorrect: 10, countryWrong: 0, capitalCorrect: 8, capitalWrong: 0, hints: 0, lastSeen: now };
  const weak = { ...good, countryCorrect: 1, countryWrong: 8, hints: 5 };
  assert.ok(repetitionWeight(weak, now) > repetitionWeight(good, now));
});

test("storage helpers recover from corrupt data", () => {
  const map = new Map();
  const storage = { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: (key) => map.delete(key) };
  saveJson(storage, "stats", { score: 12 });
  assert.deepEqual(loadJson(storage, "stats", { score: 0 }), { score: 12 });
  map.set("stats", "{");
  assert.deepEqual(loadJson(storage, "stats", { score: 0 }), { score: 0 });
});
