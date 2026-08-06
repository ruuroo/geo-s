import type {
  AnswerMethod,
  AnswerType,
  Country,
  CountryStats,
  Difficulty,
  GameMode,
  GameSettings,
  Question,
  QuestionStep,
  StoredStats,
} from "../types/index.js";

export const DEFAULT_STATS: StoredStats = {
  totalAnswered: 0,
  totalCorrect: 0,
  bestScore: 0,
  longestStreak: 0,
  country: {},
  rounds: [],
};

export function normalizeAnswer(value: string): string {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[.’'`]/g, "")
    .replace(/\./g, "")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("nb-NO");
}

export function answerMatches(input: string, accepted: string[]): boolean {
  const normalized = normalizeAnswer(input);
  return normalized.length > 0 && accepted.some((answer) => normalizeAnswer(answer) === normalized);
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function scoreForHints(hintsUsed: number): number {
  if (hintsUsed <= 0) return 100;
  if (hintsUsed === 1) return 75;
  if (hintsUsed === 2) return 50;
  return 25;
}

export function filterCountryPool(countries: Country[], settings: GameSettings): Country[] {
  const selected = new Set(settings.continents);
  return countries.filter((country) => {
    if (!settings.includeTerritories && !country.independent) return false;
    if (country.continents.length === 0) return false;
    const relevant = settings.transcontinentalAll ? country.continents : [country.continents[0]];
    return relevant.some((continent) => selected.has(continent));
  });
}

export function repetitionWeight(stats?: CountryStats, now: number = Date.now()): number {
  if (!stats || stats.shown === 0) return 2.2;
  const wrong = stats.countryWrong + stats.capitalWrong;
  const correct = stats.countryCorrect + stats.capitalCorrect;
  const accuracy = correct + wrong === 0 ? 0.5 : correct / (correct + wrong);
  const daysSince = Math.max(0, (now - stats.lastSeen) / 86_400_000);
  return 1 + wrong * 1.8 + (1 - accuracy) * 5 + stats.hints * 0.35 + Math.min(daysSince / 10, 2.5);
}

export function weightedPick<T>(items: T[], weight: (item: T) => number, random: () => number = Math.random): T {
  const weights = items.map((item) => Math.max(0.001, weight(item)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return items[index];
  }
  return items[items.length - 1];
}

export function selectRoundCountries(
  pool: Country[],
  count: number,
  avoidRepeats: boolean,
  mode: GameMode,
  stats: StoredStats,
  random: () => number = Math.random,
): Country[] {
  if (pool.length === 0 || count <= 0) return [];
  const target = avoidRepeats ? Math.min(count, pool.length) : count;
  const result: Country[] = [];
  let available = [...pool];
  const hasMistakes = pool.some((country) => {
    const item = stats.country[country.id];
    return item && item.countryWrong + item.capitalWrong > 0;
  });
  for (let index = 0; index < target; index += 1) {
    const source = avoidRepeats ? available : pool;
    const chosen = mode === "repetition"
      ? weightedPick(source, (country) => {
          const item = stats.country[country.id];
          if (hasMistakes && (!item || item.countryWrong + item.capitalWrong === 0)) return 0.15;
          return repetitionWeight(item);
        }, random)
      : source[Math.floor(random() * source.length)];
    result.push(chosen);
    if (avoidRepeats) available = available.filter((country) => country.id !== chosen.id);
  }
  return result;
}

function makeStep(promptType: QuestionStep["promptType"], answerType: AnswerType, country: Country): QuestionStep {
  return {
    promptType,
    answerType,
    correctAnswers: answerType === "country" ? country.aliases : country.capitalAliases,
  };
}

export function makeQuestion(country: Country, mode: GameMode, random: () => number = Math.random): Question {
  let effectiveMode = mode;
  if (mode === "mixed" || mode === "repetition") {
    effectiveMode = (["flag", "capitals", "flag-capital"] as GameMode[])[Math.floor(random() * 3)];
  }
  if (effectiveMode === "capitals") {
    return { id: `${country.id}-${Date.now()}-${random()}`, kind: "country-to-capital", countryId: country.id, steps: [makeStep("country-name", "capital", country)] };
  }
  if (effectiveMode === "flag-capital") {
    return { id: `${country.id}-${Date.now()}-${random()}`, kind: "flag-to-capital", countryId: country.id, steps: [makeStep("flag", "capital", country)] };
  }
  if (effectiveMode === "combined") {
    return {
      id: `${country.id}-${Date.now()}-${random()}`,
      kind: "combined-country-and-capital",
      countryId: country.id,
      steps: [makeStep("flag", "country", country), makeStep("country-name", "capital", country)],
    };
  }
  return { id: `${country.id}-${Date.now()}-${random()}`, kind: "flag-to-country", countryId: country.id, steps: [makeStep("flag", "country", country)] };
}

function canonicalAnswer(country: Country, type: AnswerType): string {
  return type === "country" ? country.norwegianName : country.capitals[0];
}

function isPlausibleDistractor(candidate: Country, target: Country, difficulty: Difficulty, random: () => number): number {
  if (candidate.id === target.id) return -100;
  let score = 0;
  if (candidate.continents.some((continent) => target.continents.includes(continent))) score += 4;
  if (candidate.subregion && candidate.subregion === target.subregion) score += 6;
  if (target.borders.includes(candidate.cca3) || candidate.borders.includes(target.cca3)) score += 8;
  const lengthDifference = Math.abs(candidate.norwegianName.length - target.norwegianName.length);
  score += Math.max(0, 3 - lengthDifference / 4);
  if (difficulty === "easy") return random();
  if (difficulty === "normal") return score + random() * 4;
  return score * 1.5 + random() * 2;
}

export function buildOptions(
  target: Country,
  pool: Country[],
  answerType: AnswerType,
  count: 3 | 5,
  difficulty: Difficulty,
  random: () => number = Math.random,
): string[] {
  const correct = canonicalAnswer(target, answerType);
  const correctNormalized = normalizeAnswer(correct);
  const candidates = pool
    .filter((country) => country.id !== target.id)
    .map((country) => ({ country, answer: canonicalAnswer(country, answerType) }))
    .filter((item) => item.answer && normalizeAnswer(item.answer) !== correctNormalized)
    .filter((item, index, all) => all.findIndex((other) => normalizeAnswer(other.answer) === normalizeAnswer(item.answer)) === index)
    .map((item) => ({ ...item, rank: isPlausibleDistractor(item.country, target, difficulty, random) + random() * 0.001 }))
    .sort((a, b) => b.rank - a.rank);
  let chosen = candidates.slice(0, Math.max(0, count - 1)).map((item) => item.answer);
  if (chosen.length < count - 1) {
    chosen = shuffle(candidates.map((item) => item.answer), random).slice(0, count - 1);
  }
  return shuffle([correct, ...chosen], random);
}

export function attachOptions(question: Question, country: Country, pool: Country[], method: AnswerMethod, difficulty: Difficulty, random: () => number = Math.random): Question {
  if (method === "text") return question;
  const count = method === "choices-3" ? 3 : 5;
  return {
    ...question,
    steps: question.steps.map((step) => ({
      ...step,
      options: buildOptions(country, pool, step.answerType, count, difficulty, random),
    })),
  };
}

export function autocompleteValues(pool: Country[], answerType: AnswerType, query: string, max = 6): string[] {
  const needle = normalizeAnswer(query);
  if (!needle) return [];
  const values = answerType === "country"
    ? pool.map((country) => country.norwegianName)
    : pool.flatMap((country) => country.capitals.slice(0, 1));
  return values
    .filter((value, index, all) => all.findIndex((other) => normalizeAnswer(other) === normalizeAnswer(value)) === index)
    .filter((value) => normalizeAnswer(value).startsWith(needle))
    .sort((a, b) => {
      const exactA = normalizeAnswer(a) === needle ? -1 : 0;
      const exactB = normalizeAnswer(b) === needle ? -1 : 0;
      return exactA - exactB || a.localeCompare(b, "nb");
    })
    .slice(0, max);
}
