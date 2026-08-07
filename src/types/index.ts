export type Continent = "Europe" | "Asia" | "Africa" | "North America" | "South America" | "Oceania";
export type GameMode = "flag" | "map" | "capitals" | "flag-capital" | "combined" | "mixed" | "repetition";
export type AnswerMethod = "text" | "choices-3" | "choices-5";
export type Difficulty = "easy" | "normal" | "hard";
export type AnswerType = "country" | "capital";
export type PromptType = "flag" | "shape" | "country-name";

export interface Country {
  id: string;
  cca2: string;
  cca3: string;
  norwegianName: string;
  englishName: string;
  aliases: string[];
  capitals: string[];
  capitalAliases: string[];
  continents: Continent[];
  continentNames: string[];
  subregion: string;
  subregionNb: string;
  borders: string[];
  independent: boolean;
  territory: boolean;
  flagPath: string;
  shapePath: string;
  worldPath: string;
  centroid: { lat: number; lng: number };
  hasShape: boolean;
  capitalNote?: string;
}

export interface GameSettings {
  mode: GameMode;
  continents: Continent[];
  includeTerritories: boolean;
  transcontinentalAll: boolean;
  answerMethod: AnswerMethod;
  roundLength: number | "all";
  customLength: number;
  difficulty: Difficulty;
  avoidRepeats: boolean;
  showFlagWithCapital: boolean;
  autoAdvance: boolean;
}

export interface QuestionStep {
  promptType: PromptType;
  answerType: AnswerType;
  correctAnswers: string[];
  options?: string[];
}

export interface Question {
  id: string;
  kind: "flag-to-country" | "shape-to-country" | "country-to-capital" | "flag-to-capital" | "combined-country-and-capital";
  countryId: string;
  steps: QuestionStep[];
}

export interface CountryStats {
  shown: number;
  countryCorrect: number;
  countryWrong: number;
  capitalCorrect: number;
  capitalWrong: number;
  hints: number;
  lastSeen: number;
}

export interface RoundSummary {
  id: string;
  playedAt: number;
  mode: GameMode;
  correct: number;
  total: number;
  score: number;
  durationSeconds: number;
}

export interface StoredStats {
  totalAnswered: number;
  totalCorrect: number;
  bestScore: number;
  longestStreak: number;
  country: Record<string, CountryStats>;
  rounds: RoundSummary[];
  preferredSettings?: GameSettings;
}

export interface AnswerRecord {
  questionId: string;
  countryId: string;
  answerType: AnswerType;
  promptType: PromptType;
  userAnswer: string;
  correctAnswer: string;
  correct: boolean;
  hintsUsed: number;
  points: number;
}
