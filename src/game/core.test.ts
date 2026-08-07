import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATS,
  answerMatches,
  attachOptions,
  autocompleteValues,
  buildOptions,
  filterCountryPool,
  makeQuestion,
  normalizeAnswer,
  repetitionWeight,
  scoreForHints,
  selectRoundCountries,
} from "./core.js";
import { loadJson, saveJson } from "./storage.js";
import type { Country, GameSettings } from "../types/index.js";

const makeCountry = (id: string, name: string, capital: string, continent = "Europe", subregion = "Northern Europe"): Country => ({
  id, cca2: id.slice(0, 2), cca3: id, norwegianName: name, englishName: name,
  aliases: [name], capitals: [capital], capitalAliases: [capital], continents: [continent as any],
  continentNames: [continent], subregion, subregionNb: subregion, borders: [], independent: true,
  territory: false, flagPath: "", shapePath: "", worldPath: "", centroid: { lat: 0, lng: 0 }, hasShape: false,
});
const no = { ...makeCountry("NOR", "Norge", "Oslo"), aliases: ["Norge", "Norway", "Kongeriket Norge"] };
const se = makeCountry("SWE", "Sverige", "Stockholm");
const dk = makeCountry("DNK", "Danmark", "København");
const fi = makeCountry("FIN", "Finland", "Helsinki");
const is = makeCountry("ISL", "Island", "Reykjavík");
const pool = [no, se, dk, fi, is];
const settings: GameSettings = { mode: "flag", continents: ["Europe"], includeTerritories: false, transcontinentalAll: true, answerMethod: "choices-3", roundLength: 5, customLength: 5, difficulty: "normal", avoidRepeats: true, showFlagWithCapital: true, autoAdvance: false };

const fixedRandom = () => 0.42;

describe("svarnormalisering", () => {
  it("ignorerer aksenter, punktum, bindestreker og store bokstaver", () => {
    expect(normalizeAnswer("  Côte d’Ivoire. ")).toBe("cote divoire");
    expect(normalizeAnswer("SØR ‑ KOREA")).toBe("sor-korea");
  });
  it("godtar alternative landnavn uten å godta prefikser", () => {
    expect(answerMatches("Norway", no.aliases)).toBe(true);
    expect(answerMatches("No", no.aliases)).toBe(false);
  });
  it("godtar flere hovedsteder", () => {
    expect(answerMatches("La Paz", ["Sucre", "La Paz"])).toBe(true);
  });
});

describe("spørsmål og alternativer", () => {
  it("lager nøyaktig tre unike alternativer med ett riktig", () => {
    const options = buildOptions(no, pool, "country", 3, "normal", fixedRandom);
    expect(options).toHaveLength(3);
    expect(new Set(options.map(normalizeAnswer)).size).toBe(3);
    expect(options.filter((item) => item === "Norge")).toHaveLength(1);
  });
  it("lager nøyaktig fem unike alternativer", () => {
    const options = buildOptions(no, pool, "capital", 5, "hard", fixedRandom);
    expect(options).toHaveLength(5);
    expect(new Set(options.map(normalizeAnswer)).size).toBe(5);
  });
  it("kobler alternativer til alle deler i en todelt oppgave", () => {
    const question = attachOptions(makeQuestion(no, "combined", fixedRandom), no, pool, "choices-3", "normal", fixedRandom);
    expect(question.steps).toHaveLength(2);
    expect(question.steps.every((step) => step.options?.length === 3)).toBe(true);
  });
  it("gir autofullføring fra første bokstav", () => {
    expect(autocompleteValues(pool, "country", "No")).toEqual(["Norge"]);
  });
  it("lager kartoppgaver som spør etter landet fra landformen", () => {
    const question = makeQuestion(no, "map", fixedRandom);
    expect(question.kind).toBe("shape-to-country");
    expect(question.steps[0].promptType).toBe("shape");
    expect(question.steps[0].answerType).toBe("country");
  });
});

describe("utvalg, poeng og repetisjon", () => {
  it("filtrerer verdensdel og transkontinentale land", () => {
    const trans = { ...makeCountry("TUR", "Tyrkia", "Ankara", "Europe"), continents: ["Europe", "Asia"] as any };
    const asiaSettings = { ...settings, continents: ["Asia"] as any, transcontinentalAll: true };
    expect(filterCountryPool([no, trans], asiaSettings).map((c) => c.id)).toEqual(["TUR"]);
    expect(filterCountryPool([no, trans], { ...asiaSettings, transcontinentalAll: false })).toHaveLength(0);
  });
  it("respekterer rundelengde uten gjentakelser", () => {
    expect(selectRoundCountries(pool, 3, true, "flag", DEFAULT_STATS, fixedRandom)).toHaveLength(3);
    expect(new Set(selectRoundCountries(pool, 5, true, "flag", DEFAULT_STATS, fixedRandom).map((c) => c.id)).size).toBe(5);
  });
  it("trekker poeng for tips", () => {
    expect([0, 1, 2, 3, 5].map(scoreForHints)).toEqual([100, 75, 50, 25, 25]);
  });
  it("prioriterer feil i repetisjonsvekten", () => {
    const mastered = { shown: 10, countryCorrect: 10, countryWrong: 0, capitalCorrect: 8, capitalWrong: 0, hints: 0, lastSeen: Date.now() };
    const weak = { ...mastered, countryCorrect: 2, countryWrong: 7, hints: 4 };
    expect(repetitionWeight(weak)).toBeGreaterThan(repetitionWeight(mastered));
  });
});

describe("localStorage-håndtering", () => {
  it("lagrer, leser og tåler ødelagt JSON", () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => void memory.set(key, value), removeItem: (key: string) => void memory.delete(key) };
    saveJson(storage, "x", { score: 10 });
    expect(loadJson(storage, "x", { score: 0 })).toEqual({ score: 10 });
    memory.set("x", "{");
    expect(loadJson(storage, "x", { score: 0 })).toEqual({ score: 0 });
  });
});
