declare const React: any;
declare const ReactDOM: any;
declare global { namespace JSX { interface IntrinsicElements { [elemName: string]: any } } }

import {
  DEFAULT_STATS,
  answerMatches,
  attachOptions,
  autocompleteValues,
  filterCountryPool,
  makeQuestion,
  normalizeAnswer,
  scoreForHints,
  selectRoundCountries,
} from "./game/core.js";
import { loadJson, saveJson } from "./game/storage.js";
import { applyCountryOverrides } from "./data/countryOverrides.js";
import type {
  AnswerRecord,
  AnswerType,
  Continent,
  Country,
  CountryStats,
  GameMode,
  GameSettings,
  Question,
  RoundSummary,
  StoredStats,
} from "./types/index.js";

const CONTINENTS: Array<{ id: Continent; label: string; icon: string }> = [
  { id: "Europe", label: "Europa", icon: "◉" },
  { id: "Asia", label: "Asia", icon: "◈" },
  { id: "Africa", label: "Afrika", icon: "◆" },
  { id: "North America", label: "Nord-Amerika", icon: "▲" },
  { id: "South America", label: "Sør-Amerika", icon: "▼" },
  { id: "Oceania", label: "Oseania", icon: "●" },
];

const DEFAULT_SETTINGS: GameSettings = {
  mode: "flag",
  continents: CONTINENTS.map((item) => item.id),
  includeTerritories: false,
  transcontinentalAll: true,
  answerMethod: "choices-3",
  roundLength: 10,
  customLength: 15,
  difficulty: "normal",
  avoidRepeats: true,
  showFlagWithCapital: true,
  autoAdvance: false,
};

interface AppState {
  loading: boolean;
  error: string;
  countries: Country[];
  screen: "setup" | "game" | "results" | "stats" | "about";
  settings: GameSettings;
  stats: StoredStats;
  theme: "system" | "light" | "dark";
  questions: Question[];
  questionIndex: number;
  stepIndex: number;
  answerInput: string;
  suggestions: string[];
  suggestionIndex: number;
  hints: string[];
  feedback: AnswerRecord | null;
  records: AnswerRecord[];
  score: number;
  correct: number;
  incorrect: number;
  streak: number;
  bestStreak: number;
  startedAt: number;
  finishedAt: number;
  reviewOpen: boolean;
  liveMessage: string;
}

function countryById(countries: Country[], id: string): Country | undefined {
  return countries.find((country) => country.id === id);
}

function canonicalAnswer(country: Country, type: AnswerType): string {
  return type === "country" ? country.norwegianName : country.capitals[0];
}

function formatMode(mode: GameMode): string {
  return ({
    flag: "Flagg",
    map: "Kart",
    capitals: "Hovedsteder",
    "flag-capital": "Flagg til hovedstad",
    combined: "Kombinert – todelt",
    mixed: "Kombinert – blandet",
    repetition: "Repetisjon",
  } as Record<GameMode, string>)[mode];
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.max(0, seconds % 60);
  return minutes > 0 ? `${minutes} min ${rest} sek` : `${rest} sek`;
}

function modeDescription(mode: GameMode): string {
  return ({
    flag: "Se et flagg og finn landet.",
    map: "Se landets form og finn landet.",
    capitals: "Se et land og finn hovedstaden.",
    "flag-capital": "Se flagget og finn hovedstaden.",
    combined: "Finn først landet, deretter hovedstaden.",
    mixed: "Tilfeldig blanding av flagg og hovedsteder.",
    repetition: "Øv ekstra på land du har svart feil på.",
  } as Record<GameMode, string>)[mode];
}

function continentLabel(continent: Continent): string {
  return CONTINENTS.find((item) => item.id === continent)?.label || continent;
}

function WorldMap(props: { countries: Country[]; selected: Country; compact?: boolean }) {
  const { countries, selected, compact } = props;
  const x = (selected.centroid.lng + 180) / 360 * 1000;
  const y = (90 - selected.centroid.lat) / 180 * 500;
  return (
    <svg className={compact ? "world-map compact" : "world-map"} viewBox="0 0 1000 500" role="img" aria-label={`Verdenskart med ${selected.norwegianName} markert`}>
      <rect x="0" y="0" width="1000" height="500" className="map-ocean" rx="18" />
      <g className="map-land">
        {countries.filter((country) => country.worldPath).map((country) => (
          <path key={country.id} d={country.worldPath} className={country.id === selected.id ? "selected-country" : "country-path"} fillRule="evenodd" />
        ))}
      </g>
      {!selected.worldPath && <circle cx={x} cy={y} r={compact ? 10 : 13} className="selected-marker pulse" />}
      {selected.worldPath && <circle cx={x} cy={y} r={compact ? 4 : 5} className="map-pin" />}
    </svg>
  );
}

function Silhouette(props: { country: Country; small?: boolean; concealName?: boolean }) {
  const { country, small, concealName } = props;
  return (
    <svg className={small ? "silhouette small" : "silhouette"} viewBox="0 0 420 260" role="img" aria-label={concealName ? "Landform som skal identifiseres" : `Silhuett av ${country.norwegianName}`}>
      {country.shapePath
        ? <path d={country.shapePath} fillRule="evenodd" />
        : <g><circle cx="210" cy="126" r="54" /><path d="M210 40L225 88L275 88L234 117L250 165L210 136L170 165L186 117L145 88L195 88Z" className="tiny-star" /></g>}
    </svg>
  );
}

function Toggle(props: { checked: boolean; onChange: (checked: boolean) => void; label: string; help?: string }) {
  return (
    <label className="toggle-row">
      <span><strong>{props.label}</strong>{props.help && <small>{props.help}</small>}</span>
      <input type="checkbox" checked={props.checked} onChange={(event: any) => props.onChange(event.target.checked)} />
      <span className="toggle" aria-hidden="true" />
    </label>
  );
}

function Metric(props: { value: string | number; label: string }) {
  return <div className="metric"><strong>{props.value}</strong><span>{props.label}</span></div>;
}

function Logo() {
  return <div className="logo-mark" aria-hidden="true"><span>G</span><i /></div>;
}

class App extends React.Component<any, AppState> {
  autoTimer: any = null;

  state: AppState = {
    loading: true,
    error: "",
    countries: [],
    screen: "setup",
    settings: DEFAULT_SETTINGS,
    stats: DEFAULT_STATS,
    theme: "system",
    questions: [],
    questionIndex: 0,
    stepIndex: 0,
    answerInput: "",
    suggestions: [],
    suggestionIndex: -1,
    hints: [],
    feedback: null,
    records: [],
    score: 0,
    correct: 0,
    incorrect: 0,
    streak: 0,
    bestStreak: 0,
    startedAt: 0,
    finishedAt: 0,
    reviewOpen: false,
    liveMessage: "",
  };

  componentDidMount() {
    const stats = loadJson<StoredStats>(localStorage, "geospillet.stats.v1", DEFAULT_STATS);
    const preferred = stats.preferredSettings || loadJson<GameSettings>(localStorage, "geospillet.settings.v1", DEFAULT_SETTINGS);
    const theme = loadJson<"system" | "light" | "dark">(localStorage, "geospillet.theme.v1", "system");
    this.applyTheme(theme);
    window.addEventListener("keydown", this.handleGlobalKeys);
    const embedded = (window as any).__GEOSPIELLET_DATA__;
    if (embedded?.countries) {
      this.setState({ countries: applyCountryOverrides(embedded.countries), loading: false, stats, settings: { ...DEFAULT_SETTINGS, ...preferred }, theme });
    } else {
      fetch("/data/countries.json")
        .then((response) => {
          if (!response.ok) throw new Error(`Kunne ikke lese landdata (${response.status}).`);
          return response.json();
        })
        .then((payload) => this.setState({ countries: applyCountryOverrides(payload.countries), loading: false, stats, settings: { ...DEFAULT_SETTINGS, ...preferred }, theme }))
        .catch((error) => this.setState({ loading: false, error: String(error.message || error), stats, theme }));
    }
  }

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleGlobalKeys);
    if (this.autoTimer) clearTimeout(this.autoTimer);
  }

  applyTheme = (theme: "system" | "light" | "dark") => {
    document.documentElement.dataset.theme = theme;
    saveJson(localStorage, "geospillet.theme.v1", theme);
  };

  setTheme = (theme: "system" | "light" | "dark") => {
    this.applyTheme(theme);
    this.setState({ theme });
  };

  saveStats = (stats: StoredStats) => {
    saveJson(localStorage, "geospillet.stats.v1", stats);
    this.setState({ stats });
  };

  saveSettings = (settings: GameSettings) => {
    saveJson(localStorage, "geospillet.settings.v1", settings);
    this.setState({ settings });
  };

  updateSetting = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    this.saveSettings({ ...this.state.settings, [key]: value });
  };

  handleGlobalKeys = (event: KeyboardEvent) => {
    if (this.state.screen !== "game" || this.state.feedback) return;
    const question = this.currentQuestion();
    const step = this.currentStep();
    if (!question || !step || !step.options) return;
    const index = Number(event.key) - 1;
    if (index >= 0 && index < step.options.length) {
      event.preventDefault();
      this.submitAnswer(step.options[index]);
    }
  };

  currentQuestion = (): Question | undefined => this.state.questions[this.state.questionIndex];
  currentStep = () => this.currentQuestion()?.steps[this.state.stepIndex];
  currentCountry = (): Country | undefined => {
    const question = this.currentQuestion();
    return question ? countryById(this.state.countries, question.countryId) : undefined;
  };

  availablePool = (): Country[] => filterCountryPool(this.state.countries, this.state.settings);

  selectedRoundCount = (poolLength: number, settings: GameSettings = this.state.settings): number => {
    const { roundLength, customLength, avoidRepeats } = settings;
    if (roundLength === "all") return poolLength;
    const chosen = roundLength === 0 ? customLength : roundLength;
    return avoidRepeats ? Math.min(Math.max(1, chosen), poolLength) : Math.max(1, chosen);
  };

  startGame = (onlyCountryIds?: string[], forceMode?: GameMode, settingsOverride?: GameSettings) => {
    const baseSettings = settingsOverride || this.state.settings;
    const settings = forceMode ? { ...baseSettings, mode: forceMode } : baseSettings;
    let pool = filterCountryPool(this.state.countries, settings);
    if (onlyCountryIds && onlyCountryIds.length) {
      const allowed = new Set(onlyCountryIds);
      pool = pool.filter((country) => allowed.has(country.id));
    }
    const count = onlyCountryIds?.length
      ? Math.min(Math.max(5, onlyCountryIds.length), settings.avoidRepeats ? pool.length : Math.max(5, onlyCountryIds.length))
      : this.selectedRoundCount(pool.length, settings);
    if (pool.length === 0) {
      this.setState({ liveMessage: "Velg minst én verdensdel med tilgjengelige land." });
      return;
    }
    const roundCountries = selectRoundCountries(pool, count, settings.avoidRepeats, settings.mode, this.state.stats);
    const questions = roundCountries.map((country) => attachOptions(makeQuestion(country, settings.mode), country, pool, settings.answerMethod, settings.difficulty));
    const stored = { ...this.state.stats, preferredSettings: settings };
    this.saveStats(stored);
    this.setState({
      settings,
      screen: "game",
      questions,
      questionIndex: 0,
      stepIndex: 0,
      answerInput: "",
      suggestions: [],
      suggestionIndex: -1,
      hints: [],
      feedback: null,
      records: [],
      score: 0,
      correct: 0,
      incorrect: 0,
      streak: 0,
      bestStreak: 0,
      startedAt: Date.now(),
      finishedAt: 0,
      reviewOpen: false,
      liveMessage: "Runden er startet.",
    }, () => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  startQuickGame = (mode: "flag" | "map" | "capitals") => {
    const settings: GameSettings = {
      ...this.state.settings,
      mode,
      continents: CONTINENTS.map((item) => item.id),
      includeTerritories: false,
      transcontinentalAll: true,
      answerMethod: "choices-3",
      roundLength: 10,
      customLength: 10,
      difficulty: "normal",
      avoidRepeats: true,
      showFlagWithCapital: mode === "capitals",
      autoAdvance: false,
    };
    this.startGame(undefined, undefined, settings);
  };

  handleInput = (value: string) => {
    const step = this.currentStep();
    if (!step) return;
    this.setState({
      answerInput: value,
      suggestions: autocompleteValues(this.availablePool(), step.answerType, value),
      suggestionIndex: -1,
    });
  };

  handleInputKey = (event: any) => {
    const { suggestions, suggestionIndex } = this.state;
    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      this.setState({ suggestionIndex: Math.min(suggestionIndex + 1, suggestions.length - 1) });
    } else if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      this.setState({ suggestionIndex: Math.max(suggestionIndex - 1, 0) });
    } else if (event.key === "Escape") {
      this.setState({ suggestions: [], suggestionIndex: -1 });
    } else if (event.key === "Enter" && suggestionIndex >= 0 && suggestions[suggestionIndex]) {
      event.preventDefault();
      this.setState({ answerInput: suggestions[suggestionIndex], suggestions: [], suggestionIndex: -1 }, () => this.submitAnswer(suggestions[suggestionIndex]));
    }
  };

  submitForm = (event: any) => {
    event.preventDefault();
    if (this.state.answerInput.trim()) this.submitAnswer(this.state.answerInput);
  };

  submitAnswer = (rawAnswer: string) => {
    if (this.state.feedback) return;
    const question = this.currentQuestion();
    const step = this.currentStep();
    const country = this.currentCountry();
    if (!question || !step || !country) return;
    const correct = answerMatches(rawAnswer, step.correctAnswers);
    const points = correct ? scoreForHints(this.state.hints.length) : 0;
    const record: AnswerRecord = {
      questionId: question.id,
      countryId: country.id,
      answerType: step.answerType,
      promptType: step.promptType,
      userAnswer: rawAnswer,
      correctAnswer: canonicalAnswer(country, step.answerType),
      correct,
      hintsUsed: this.state.hints.length,
      points,
    };
    const streak = correct ? this.state.streak + 1 : 0;
    const feedbackText = correct ? `Riktig! ${record.correctAnswer}.` : `Ikke helt. Riktig svar er ${record.correctAnswer}.`;
    const stats = this.updateStatsForAnswer(this.state.stats, country, step.answerType, correct, this.state.hints.length);
    this.saveStats(stats);
    this.setState({
      feedback: record,
      records: [...this.state.records, record],
      score: this.state.score + points,
      correct: this.state.correct + (correct ? 1 : 0),
      incorrect: this.state.incorrect + (correct ? 0 : 1),
      streak,
      bestStreak: Math.max(this.state.bestStreak, streak),
      answerInput: rawAnswer,
      suggestions: [],
      liveMessage: feedbackText,
    }, () => {
      if (this.state.settings.autoAdvance) {
        this.autoTimer = setTimeout(() => this.advance(), 1800);
      }
    });
  };

  updateStatsForAnswer = (stats: StoredStats, country: Country, type: AnswerType, correct: boolean, hints: number): StoredStats => {
    const previous: CountryStats = stats.country[country.id] || {
      shown: 0, countryCorrect: 0, countryWrong: 0, capitalCorrect: 0, capitalWrong: 0, hints: 0, lastSeen: 0,
    };
    const next: CountryStats = {
      ...previous,
      shown: previous.shown + 1,
      countryCorrect: previous.countryCorrect + (type === "country" && correct ? 1 : 0),
      countryWrong: previous.countryWrong + (type === "country" && !correct ? 1 : 0),
      capitalCorrect: previous.capitalCorrect + (type === "capital" && correct ? 1 : 0),
      capitalWrong: previous.capitalWrong + (type === "capital" && !correct ? 1 : 0),
      hints: previous.hints + hints,
      lastSeen: Date.now(),
    };
    return {
      ...stats,
      totalAnswered: stats.totalAnswered + 1,
      totalCorrect: stats.totalCorrect + (correct ? 1 : 0),
      country: { ...stats.country, [country.id]: next },
    };
  };

  nextHint = () => {
    const step = this.currentStep();
    const country = this.currentCountry();
    if (!step || !country || this.state.feedback) return;
    const neighbors = country.borders
      .map((code) => this.state.countries.find((item) => item.cca3 === code)?.norwegianName)
      .filter(Boolean) as string[];
    let hints: string[];
    if (step.answerType === "country") {
      hints = [
        `Verdensdel: ${country.continentNames.join(" / ")}.`,
        country.subregionNb ? `Region: ${country.subregionNb}${neighbors[0] ? `. Naboland: ${neighbors[0]}.` : "."}` : (neighbors[0] ? `Naboland: ${neighbors[0]}.` : "Landet har ingen landegrenser."),
        `Hovedstad: ${country.capitals[0]}.`,
        `Landet begynner på «${country.norwegianName[0]}» og har ${country.norwegianName.replace(/[ -]/g, "").length} bokstaver.`,
        step.promptType === "shape" ? "map" : "shape",
      ];
    } else {
      const capital = country.capitals[0];
      hints = [
        `${country.subregionNb || country.continentNames.join(" / ")} – i ${country.continentNames.join(" / ")}.`,
        `Hovedstaden begynner på «${capital[0]}».`,
        `Hovedstaden har ${capital.replace(/[ .,'’-]/g, "").length} bokstaver.`,
        neighbors.length ? `Landet grenser blant annet til ${neighbors.slice(0, 2).join(" og ")}.` : "Landet har ingen landegrenser.",
        "map",
      ];
    }
    if (this.state.hints.length < hints.length) {
      const next = hints[this.state.hints.length];
      this.setState({ hints: [...this.state.hints, next], liveMessage: next === "shape" ? "Silhuetten er vist som tips." : next === "map" ? "Kartplasseringen er vist som tips." : next });
    }
  };

  advance = () => {
    if (this.autoTimer) clearTimeout(this.autoTimer);
    const question = this.currentQuestion();
    if (!question) return;
    if (this.state.stepIndex + 1 < question.steps.length) {
      this.setState({
        stepIndex: this.state.stepIndex + 1,
        answerInput: "",
        suggestions: [],
        suggestionIndex: -1,
        hints: [],
        feedback: null,
        liveMessage: "Neste del av oppgaven.",
      }, () => window.scrollTo({ top: 0, behavior: "smooth" }));
      return;
    }
    if (this.state.questionIndex + 1 < this.state.questions.length) {
      this.setState({
        questionIndex: this.state.questionIndex + 1,
        stepIndex: 0,
        answerInput: "",
        suggestions: [],
        suggestionIndex: -1,
        hints: [],
        feedback: null,
        liveMessage: "Neste spørsmål.",
      }, () => window.scrollTo({ top: 0, behavior: "smooth" }));
      return;
    }
    this.finishRound();
  };

  finishRound = () => {
    const finishedAt = Date.now();
    const durationSeconds = Math.max(1, Math.round((finishedAt - this.state.startedAt) / 1000));
    const summary: RoundSummary = {
      id: `${finishedAt}`,
      playedAt: finishedAt,
      mode: this.state.settings.mode,
      correct: this.state.correct,
      total: this.state.correct + this.state.incorrect,
      score: this.state.score,
      durationSeconds,
    };
    const stats: StoredStats = {
      ...this.state.stats,
      bestScore: Math.max(this.state.stats.bestScore, this.state.score),
      longestStreak: Math.max(this.state.stats.longestStreak, this.state.bestStreak),
      rounds: [summary, ...this.state.stats.rounds].slice(0, 20),
    };
    this.saveStats(stats);
    this.setState({ screen: "results", finishedAt, feedback: null, liveMessage: "Runden er ferdig." }, () => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  abortRound = () => {
    if (window.confirm("Vil du avslutte runden? Resultatene fra besvarte spørsmål er fortsatt lagret.")) {
      this.setState({ screen: "setup", questions: [], feedback: null, liveMessage: "Runden ble avsluttet." });
    }
  };

  toggleContinent = (continent: Continent) => {
    const current = this.state.settings.continents;
    const continents = current.includes(continent) ? current.filter((item) => item !== continent) : [...current, continent];
    this.updateSetting("continents", continents);
  };

  resetStats = () => {
    if (!window.confirm("Slette all statistikk og progresjon? Dette kan ikke angres.")) return;
    localStorage.removeItem("geospillet.stats.v1");
    this.setState({ stats: DEFAULT_STATS, liveMessage: "All statistikk er slettet." });
  };

  renderHeader() {
    const { screen, theme } = this.state;
    return (
      <header className="site-header">
        <button className="brand" onClick={() => this.setState({ screen: "setup" })} aria-label="Gå til startsiden">
          <Logo />
          <span><strong>Geospillet</strong><small>Flagg, land og hovedsteder</small></span>
        </button>
        <nav aria-label="Hovedmeny">
          <button className={screen === "setup" ? "active" : ""} onClick={() => this.setState({ screen: "setup" })}>Spill</button>
          <button className={screen === "stats" ? "active" : ""} onClick={() => this.setState({ screen: "stats" })}>Statistikk</button>
          <button className={screen === "about" ? "active" : ""} onClick={() => this.setState({ screen: "about" })}>Om</button>
        </nav>
        <label className="theme-select" title="Velg utseende">
          <span className="sr-only">Utseende</span>
          <select value={theme} onChange={(event: any) => this.setTheme(event.target.value)}>
            <option value="system">◐ System</option>
            <option value="light">☀ Lys</option>
            <option value="dark">☾ Mørk</option>
          </select>
        </label>
      </header>
    );
  }

  renderSetup() {
    const { settings, countries } = this.state;
    const pool = filterCountryPool(countries, settings);
    const roundCount = this.selectedRoundCount(pool.length);
    const modes: Array<{ id: GameMode; icon: string }> = [
      { id: "flag", icon: "⚑" }, { id: "map", icon: "⌖" }, { id: "capitals", icon: "⌂" }, { id: "flag-capital", icon: "⚑⌂" },
      { id: "combined", icon: "⇥" }, { id: "mixed", icon: "⤨" }, { id: "repetition", icon: "↻" },
    ];
    return (
      <main className="setup-page">
        <section className="hero">
          <div>
            <span className="eyebrow">Lær verden, én runde om gangen</span>
            <h1>Hvor godt kjenner du<br /><em>verden?</em></h1>
            <p>Velg hva du vil øve på, tilpass vanskelighetsgraden og start en runde med flagg, land og hovedsteder.</p>
            <div className="hero-stats">
              <Metric value={countries.filter((country) => country.independent).length || 195} label="selvstendige stater" />
              <Metric value={this.state.stats.totalAnswered} label="svar lagret lokalt" />
              <Metric value={this.state.stats.totalAnswered ? `${Math.round(this.state.stats.totalCorrect / this.state.stats.totalAnswered * 100)} %` : "–"} label="total treffprosent" />
            </div>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <div className="globe"><i /><i /><i /><span>G</span></div>
            <span className="orbit orbit-one"><b>🇳🇴</b></span>
            <span className="orbit orbit-two"><b>🇯🇵</b></span>
            <span className="orbit orbit-three"><b>🇧🇷</b></span>
          </div>
        </section>

        <section className="quick-play" aria-labelledby="quick-play-title">
          <div className="quick-heading">
            <div><span className="eyebrow">Kom rett i gang</span><h2 id="quick-play-title">Hurtigspill</h2></div>
            <span>10 spørsmål · hele verden · 3 alternativer · normal</span>
          </div>
          <div className="quick-grid">
            <button className="quick-card" onClick={() => this.startQuickGame("flag")}>
              <span className="quick-icon">⚑</span>
              <span><strong>Hurtigspill flagg</strong><small>Se flagget og finn riktig land.</small></span>
              <i>→</i>
            </button>
            <button className="quick-card" onClick={() => this.startQuickGame("map")}>
              <span className="quick-icon">⌖</span>
              <span><strong>Hurtigspill kart</strong><small>Se landets form og finn riktig land.</small></span>
              <i>→</i>
            </button>
            <button className="quick-card" onClick={() => this.startQuickGame("capitals")}>
              <span className="quick-icon">⌂</span>
              <span><strong>Hurtigspill hovedsteder</strong><small>Se landet og velg riktig hovedstad.</small></span>
              <i>→</i>
            </button>
          </div>
          <p className="quick-note">Alle hurtigspill bruker 10 spørsmål, hele verden, selvstendige stater, 3 svaralternativer, normal vanskelighetsgrad og transkontinentale land i alle relevante områder.</p>
        </section>

        <section className="config-shell" aria-labelledby="configure-title">
          <div className="config-heading">
            <div><span className="step-number">1</span><div><h2 id="configure-title">Velg spillmodus</h2><p>Du kan endre alt før runden starter.</p></div></div>
            <span className="country-count">{pool.length} land i utvalget</span>
          </div>
          <div className="mode-grid">
            {modes.map((mode) => (
              <button key={mode.id} className={`mode-card ${settings.mode === mode.id ? "selected" : ""}`} onClick={() => this.updateSetting("mode", mode.id)}>
                <span className="mode-icon">{mode.icon}</span>
                <strong>{formatMode(mode.id)}</strong>
                <small>{modeDescription(mode.id)}</small>
                <i className="radio-dot" />
              </button>
            ))}
          </div>

          <div className="config-divider" />
          <div className="config-heading"><div><span className="step-number">2</span><div><h2>Velg geografisk område</h2><p>Velg én, flere eller alle verdensdeler.</p></div></div>
            <div className="inline-actions"><button onClick={() => this.updateSetting("continents", CONTINENTS.map((item) => item.id))}>Velg alle</button><button onClick={() => this.updateSetting("continents", [])}>Fjern alle</button></div>
          </div>
          <div className="continent-grid">
            {CONTINENTS.map((item) => (
              <button key={item.id} className={settings.continents.includes(item.id) ? "selected" : ""} onClick={() => this.toggleContinent(item.id)}>
                <span>{item.icon}</span><strong>{item.label}</strong><i>{settings.continents.includes(item.id) ? "✓" : "+"}</i>
              </button>
            ))}
          </div>
          <div className="toggle-panel two-column">
            <Toggle checked={settings.includeTerritories} onChange={(value) => this.updateSetting("includeTerritories", value)} label="Inkluder territorier" help="For eksempel Grønland, Færøyene og Puerto Rico." />
            <Toggle checked={settings.transcontinentalAll} onChange={(value) => this.updateSetting("transcontinentalAll", value)} label="Transkontinentale land i alle områder" help="Russland og Tyrkia kan blant annet vises i både Europa og Asia." />
          </div>

          <div className="config-divider" />
          <div className="config-heading"><div><span className="step-number">3</span><div><h2>Tilpass runden</h2><p>Bestem svarmetode, lengde og vanskelighetsgrad.</p></div></div></div>
          <div className="settings-grid">
            <fieldset className="setting-card">
              <legend>Svarmetode</legend>
              {[{ id: "text", label: "Skriv selv", sub: "Med autofullføring" }, { id: "choices-3", label: "3 alternativer", sub: "Rask og oversiktlig" }, { id: "choices-5", label: "5 alternativer", sub: "Litt mer krevende" }].map((item) => (
                <label key={item.id} className={settings.answerMethod === item.id ? "choice-row selected" : "choice-row"}>
                  <input type="radio" name="answer-method" checked={settings.answerMethod === item.id} onChange={() => this.updateSetting("answerMethod", item.id as any)} />
                  <span><strong>{item.label}</strong><small>{item.sub}</small></span><i />
                </label>
              ))}
            </fieldset>
            <fieldset className="setting-card">
              <legend>Antall oppgaver</legend>
              <div className="length-buttons">
                {[5, 10, 20, 30, 50].map((length) => <button type="button" key={length} className={settings.roundLength === length ? "selected" : ""} onClick={() => this.updateSetting("roundLength", length)}>{length}</button>)}
                <button type="button" className={settings.roundLength === "all" ? "selected" : ""} onClick={() => this.updateSetting("roundLength", "all")}>Alle</button>
              </div>
              <label className="custom-length">Egendefinert
                <input type="number" min="1" max="250" value={settings.customLength} onFocus={() => this.updateSetting("roundLength", 0)} onChange={(event: any) => this.saveSettings({ ...this.state.settings, customLength: Math.max(1, Number(event.target.value)), roundLength: 0 })} />
              </label>
              <small>Runden vil inneholde {roundCount || 0} oppgaver.</small>
            </fieldset>
            <fieldset className="setting-card">
              <legend>Vanskelighetsgrad</legend>
              {[{ id: "easy", label: "Lett", sub: "Tilfeldige alternativer" }, { id: "normal", label: "Normal", sub: "Ofte samme verdensdel" }, { id: "hard", label: "Vanskelig", sub: "Naboland og samme region" }].map((item) => (
                <label key={item.id} className={settings.difficulty === item.id ? "choice-row selected" : "choice-row"}>
                  <input type="radio" name="difficulty" checked={settings.difficulty === item.id} onChange={() => this.updateSetting("difficulty", item.id as any)} />
                  <span><strong>{item.label}</strong><small>{item.sub}</small></span><i />
                </label>
              ))}
            </fieldset>
          </div>
          <div className="toggle-panel three-column">
            <Toggle checked={settings.avoidRepeats} onChange={(value) => this.updateSetting("avoidRepeats", value)} label="Unngå gjentakelser" />
            <Toggle checked={settings.showFlagWithCapital} onChange={(value) => this.updateSetting("showFlagWithCapital", value)} label="Vis flagg ved hovedstadsspørsmål" />
            <Toggle checked={settings.autoAdvance} onChange={(value) => this.updateSetting("autoAdvance", value)} label="Gå automatisk videre" help="Etter omtrent 1,8 sekunder." />
          </div>

          <div className="start-bar">
            <div><strong>{formatMode(settings.mode)}</strong><span>{roundCount} oppgaver · {settings.answerMethod === "text" ? "skriv selv" : settings.answerMethod === "choices-3" ? "3 alternativer" : "5 alternativer"} · {settings.difficulty === "easy" ? "lett" : settings.difficulty === "normal" ? "normal" : "vanskelig"}</span></div>
            <button className="primary large" disabled={!pool.length || !settings.continents.length} onClick={() => this.startGame()}>Start runden <span>→</span></button>
          </div>
        </section>
      </main>
    );
  }

  renderPrompt(country: Country, step: any) {
    const showFlag = step.promptType === "flag" || (step.promptType === "country-name" && this.state.settings.showFlagWithCapital);
    return (
      <div className="question-prompt">
        {showFlag && <div className="flag-stage"><img src={country.flagPath} alt={this.state.feedback ? `${country.norwegianName}s flagg` : "Flagg som skal identifiseres"} /></div>}
        {step.promptType === "shape" && <div className="shape-stage"><Silhouette country={country} concealName /></div>}
        {step.promptType === "country-name" && <div className="country-name-prompt"><span>Land</span><strong>{country.norwegianName}</strong></div>}
        <h1>{step.answerType === "country" ? "Hvilket land er dette?" : "Hva er hovedstaden?"}</h1>
        <p>{step.answerType === "country" ? (step.promptType === "shape" ? "Velg landet som passer til formen." : "Velg eller skriv inn landet som flagget tilhører.") : `Finn hovedstaden i ${country.norwegianName}.`}</p>
      </div>
    );
  }

  renderAnswerArea(step: any) {
    if (step.options) {
      return (
        <div className={`option-grid options-${step.options.length}`}>
          {step.options.map((option: string, index: number) => (
            <button key={option} onClick={() => this.submitAnswer(option)}><kbd>{index + 1}</kbd><span>{option}</span><i>→</i></button>
          ))}
        </div>
      );
    }
    return (
      <form className="text-answer" onSubmit={this.submitForm}>
        <div className="autocomplete-wrap">
          <label htmlFor="answer-input">Skriv svaret ditt</label>
          <input id="answer-input" autoComplete="off" autoFocus value={this.state.answerInput} onChange={(event: any) => this.handleInput(event.target.value)} onKeyDown={this.handleInputKey} role="combobox" aria-expanded={this.state.suggestions.length > 0} aria-controls="answer-suggestions" aria-autocomplete="list" aria-activedescendant={this.state.suggestionIndex >= 0 ? `suggestion-${this.state.suggestionIndex}` : undefined} placeholder={step.answerType === "country" ? "Begynn å skrive et land …" : "Begynn å skrive en hovedstad …"} />
          {this.state.suggestions.length > 0 && (
            <div className="suggestions" id="answer-suggestions" role="listbox">
              {this.state.suggestions.map((suggestion, index) => (
                <button type="button" id={`suggestion-${index}`} role="option" aria-selected={index === this.state.suggestionIndex} className={index === this.state.suggestionIndex ? "active" : ""} key={suggestion} onMouseDown={(event: any) => event.preventDefault()} onClick={() => this.setState({ answerInput: suggestion, suggestions: [] }, () => this.submitAnswer(suggestion))}>{suggestion}<span>↵</span></button>
              ))}
            </div>
          )}
        </div>
        <button className="primary" type="submit" disabled={!this.state.answerInput.trim()}>Svar</button>
      </form>
    );
  }

  renderHints(country: Country) {
    return (
      <div className="hint-stack" aria-live="polite">
        {this.state.hints.map((hint, index) => (
          hint === "shape" ? <div className="visual-hint" key={index}><span>Tips {index + 1}: Landets form</span><Silhouette country={country} small /></div>
            : hint === "map" ? <div className="visual-hint" key={index}><span>Tips {index + 1}: Plassering</span><WorldMap countries={this.state.countries} selected={country} compact /></div>
              : <div className="text-hint" key={index}><span>Tips {index + 1}</span><p>{hint}</p></div>
        ))}
      </div>
    );
  }

  renderFeedback(country: Country, record: AnswerRecord) {
    const neighborNames = country.borders.map((code) => this.state.countries.find((item) => item.cca3 === code)?.norwegianName).filter(Boolean).slice(0, 5);
    const areaLabel = Array.from(new Set([...country.continentNames, country.subregionNb].filter(Boolean))).join(" · ");
    return (
      <section className={`feedback-card ${record.correct ? "correct" : "wrong"}`} aria-live="polite">
        <div className="feedback-title">
          <span className="feedback-icon">{record.correct ? "✓" : "×"}</span>
          <div><span>{record.correct ? "Riktig svar" : "Riktig svar er"}</span><h2>{record.correctAnswer}</h2><p>{record.correct ? `Du fikk ${record.points} poeng.` : <span>Du svarte <strong>{record.userAnswer || "ingenting"}</strong>.</span>}</p></div>
          <div className="feedback-controls">
            <div className="points-badge">+{record.points}</div>
            <button className="primary next-button" onClick={this.advance}>{this.state.questionIndex + 1 >= this.state.questions.length && this.state.stepIndex + 1 >= this.currentQuestion()!.steps.length ? "Se resultat" : "Neste"} <span>→</span></button>
          </div>
        </div>
        <div className="feedback-details">
          <div className="learning-card">
            <div className="country-facts">
              <img src={country.flagPath} alt={`${country.norwegianName}s flagg`} />
              <div><span>Land</span><strong>{country.norwegianName}</strong></div>
              <div><span>Hovedstad</span><strong>{country.capitals.join(" / ")}</strong></div>
              <div><span>Område</span><strong>{areaLabel}</strong></div>
              {neighborNames.length > 0 && <div><span>Naboland</span><strong>{neighborNames.join(", ")}</strong></div>}
              {country.capitalNote && <p className="fact-note">{country.capitalNote}</p>}
            </div>
            <Silhouette country={country} />
          </div>
          <WorldMap countries={this.state.countries} selected={country} compact />
        </div>
      </section>
    );
  }

  renderGame() {
    const question = this.currentQuestion();
    const step = this.currentStep();
    const country = this.currentCountry();
    if (!question || !step || !country) return <main className="empty-state"><h1>Ingen oppgaver</h1><button onClick={() => this.setState({ screen: "setup" })}>Tilbake</button></main>;
    const totalSteps = this.state.correct + this.state.incorrect;
    const progress = ((this.state.questionIndex + (this.state.feedback ? 1 : 0)) / this.state.questions.length) * 100;
    const maxHints = 5;
    return (
      <main className="game-page">
        <div className="game-topbar">
          <button className="ghost" onClick={this.abortRound}>← Avslutt</button>
          <div className="progress-meta"><strong>Oppgave {this.state.questionIndex + 1} av {this.state.questions.length}</strong>{question.steps.length > 1 && <span>Del {this.state.stepIndex + 1} av {question.steps.length}</span>}</div>
          <div className="game-metrics"><span><b>{this.state.correct}</b> riktige</span><span><b>{this.state.score}</b> poeng</span><span><b>{this.state.streak}</b> på rad</span></div>
        </div>
        <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>
        <section className={`question-shell ${this.state.feedback && !this.state.feedback.correct ? "wrong-answer" : ""}`}>
          {!this.state.feedback && (
            <div className="question-layout">
              <div className="question-main">
                {this.renderPrompt(country, step)}
                {this.renderHints(country)}
              </div>
              <div className="answer-panel">
                {this.renderAnswerArea(step)}
                <div className="question-actions">
                  <button className="hint-button" disabled={this.state.hints.length >= maxHints} onClick={this.nextHint}>💡 {this.state.hints.length ? `Vis tips ${this.state.hints.length + 1}` : "Vis tips"}<small>Maks {scoreForHints(this.state.hints.length + 1)} poeng etter neste tips</small></button>
                  <span>{totalSteps} svar i denne runden</span>
                </div>
              </div>
            </div>
          )}
          {this.state.feedback && this.renderFeedback(country, this.state.feedback)}
        </section>
      </main>
    );
  }

  renderResults() {
    const total = this.state.correct + this.state.incorrect;
    const percentage = total ? Math.round(this.state.correct / total * 100) : 0;
    const duration = Math.max(1, Math.round(((this.state.finishedAt || Date.now()) - this.state.startedAt) / 1000));
    const wrongIds = Array.from(new Set(this.state.records.filter((record) => !record.correct).map((record) => record.countryId)));
    const hintedIds = Array.from(new Set(this.state.records.filter((record) => record.hintsUsed > 0).map((record) => record.countryId)));
    const countryRecords = this.state.records.filter((record) => record.answerType === "country");
    const capitalRecords = this.state.records.filter((record) => record.answerType === "capital");
    return (
      <main className="results-page">
        <section className="results-hero">
          <span className="result-medal">{percentage >= 90 ? "★" : percentage >= 70 ? "◆" : "↗"}</span>
          <span className="eyebrow">Runden er fullført</span>
          <h1>{percentage >= 90 ? "Verdensklasse!" : percentage >= 70 ? "Sterk runde!" : percentage >= 50 ? "Godt jobbet!" : "Du er i gang!"}</h1>
          <p>{percentage >= 80 ? "Du har svært god kontroll. Prøv en vanskeligere runde neste gang." : "Feilene dine er lagret, slik at repetisjonsmodusen kan hjelpe deg videre."}</p>
          <div className="score-ring" style={{ "--score": percentage } as any}><div><strong>{percentage}%</strong><span>treff</span></div></div>
        </section>
        <section className="results-grid">
          <Metric value={`${this.state.correct} / ${total}`} label="riktige svar" />
          <Metric value={this.state.score} label="poeng" />
          <Metric value={this.state.bestStreak} label="lengste rekke" />
          <Metric value={this.state.records.reduce((sum, record) => sum + record.hintsUsed, 0)} label="brukte tips" />
          <Metric value={formatTime(duration)} label="tidsbruk" />
        </section>
        {(countryRecords.length > 0 || capitalRecords.length > 0) && (
          <section className="result-breakdown card">
            <h2>Fordeling</h2>
            {countryRecords.length > 0 && <div><span>Land</span><div className="bar"><i style={{ width: `${countryRecords.filter((record) => record.correct).length / countryRecords.length * 100}%` }} /></div><strong>{countryRecords.filter((record) => record.correct).length}/{countryRecords.length}</strong></div>}
            {capitalRecords.length > 0 && <div><span>Hovedsteder</span><div className="bar"><i style={{ width: `${capitalRecords.filter((record) => record.correct).length / capitalRecords.length * 100}%` }} /></div><strong>{capitalRecords.filter((record) => record.correct).length}/{capitalRecords.length}</strong></div>}
          </section>
        )}
        {(wrongIds.length > 0 || hintedIds.length > 0) && (
          <section className="focus-cards">
            {wrongIds.length > 0 && <div className="card"><span className="card-kicker">Bør repeteres</span><h2>{wrongIds.length} {wrongIds.length === 1 ? "land" : "land"}</h2><div className="country-chips">{wrongIds.map((id) => { const c = countryById(this.state.countries, id)!; return <span key={id}><img src={c.flagPath} alt="" />{c.norwegianName}</span>; })}</div></div>}
            {hintedIds.length > 0 && <div className="card"><span className="card-kicker">Tips brukt</span><h2>{hintedIds.length} land</h2><div className="country-chips">{hintedIds.map((id) => { const c = countryById(this.state.countries, id)!; return <span key={id}><img src={c.flagPath} alt="" />{c.norwegianName}</span>; })}</div></div>}
          </section>
        )}
        <section className="result-actions">
          <button className="primary large" onClick={() => this.startGame()}>Spill samme oppsett igjen</button>
          {wrongIds.length > 0 && <button className="secondary large" onClick={() => this.startGame(wrongIds, "repetition")}>Repeter feil</button>}
          <button className="secondary large" onClick={() => this.setState({ screen: "setup" })}>Nytt oppsett</button>
          <button className="ghost large" onClick={() => this.setState({ reviewOpen: !this.state.reviewOpen })}>{this.state.reviewOpen ? "Skjul svar" : "Se gjennom alle svar"}</button>
        </section>
        {this.state.reviewOpen && (
          <section className="review-list">
            <h2>Alle svar</h2>
            {this.state.records.map((record, index) => {
              const country = countryById(this.state.countries, record.countryId)!;
              return <article key={`${record.questionId}-${index}`} className={record.correct ? "review-correct" : "review-wrong"}><img src={country.flagPath} alt={`${country.norwegianName}s flagg`} /><div><span>{record.answerType === "country" ? "Land" : "Hovedstad"}</span><strong>{country.norwegianName} · {country.capitals[0]}</strong><small>Ditt svar: {record.userAnswer} · Fasiten: {record.correctAnswer}</small></div><b>{record.correct ? "✓" : "×"}</b><em>{record.points} p</em></article>;
            })}
          </section>
        )}
      </main>
    );
  }

  renderStats() {
    const { stats, countries } = this.state;
    const rows = Object.entries(stats.country).map(([id, item]) => {
      const country = countryById(countries, id);
      const correct = item.countryCorrect + item.capitalCorrect;
      const wrong = item.countryWrong + item.capitalWrong;
      return { country, item, correct, wrong, accuracy: correct + wrong ? correct / (correct + wrong) : 0 };
    }).filter((row) => row.country) as Array<{ country: Country; item: CountryStats; correct: number; wrong: number; accuracy: number }>;
    const best = [...rows].filter((row) => row.correct + row.wrong >= 2).sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct).slice(0, 6);
    const practice = [...rows].filter((row) => row.wrong > 0).sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy).slice(0, 8);
    const continentStats = CONTINENTS.map((continent) => {
      const subset = rows.filter((row) => row.country.continents.includes(continent.id));
      const correct = subset.reduce((sum, row) => sum + row.correct, 0);
      const total = subset.reduce((sum, row) => sum + row.correct + row.wrong, 0);
      return { ...continent, correct, total, percent: total ? Math.round(correct / total * 100) : 0 };
    });
    return (
      <main className="stats-page">
        <section className="page-heading"><span className="eyebrow">Din progresjon</span><h1>Statistikk</h1><p>Alt lagres bare i denne nettleseren.</p></section>
        <section className="stats-overview">
          <Metric value={stats.totalAnswered} label="besvarte spørsmål" />
          <Metric value={stats.totalAnswered ? `${Math.round(stats.totalCorrect / stats.totalAnswered * 100)} %` : "–"} label="samlet treffprosent" />
          <Metric value={stats.bestScore} label="beste poengsum" />
          <Metric value={stats.longestStreak} label="lengste rekke" />
        </section>
        <section className="stats-columns">
          <div className="card">
            <div className="section-title"><div><span className="card-kicker">Mestret</span><h2>Land du kjenner best</h2></div></div>
            {best.length ? <div className="ranking-list">{best.map((row, index) => <div key={row.country.id}><span>{index + 1}</span><img src={row.country.flagPath} alt="" /><strong>{row.country.norwegianName}</strong><div className="bar"><i style={{ width: `${row.accuracy * 100}%` }} /></div><b>{Math.round(row.accuracy * 100)}%</b></div>)}</div> : <p className="empty-copy">Spill noen runder for å bygge statistikk.</p>}
          </div>
          <div className="card">
            <div className="section-title"><div><span className="card-kicker">Neste fokus</span><h2>Bør øves mer på</h2></div>{practice.length > 0 && <button onClick={() => this.startGame(practice.map((row) => row.country.id), "repetition")}>Start repetisjon</button>}</div>
            {practice.length ? <div className="practice-list">{practice.map((row) => <div key={row.country.id}><img src={row.country.flagPath} alt="" /><span><strong>{row.country.norwegianName}</strong><small>{row.wrong} feil · {row.item.hints} tips</small></span><b>{Math.round(row.accuracy * 100)}%</b></div>)}</div> : <p className="empty-copy">Ingen feil registrert ennå.</p>}
          </div>
        </section>
        <section className="card continent-stats"><span className="card-kicker">Områder</span><h2>Resultat per verdensdel</h2><div>{continentStats.map((item) => <article key={item.id}><span>{item.icon}</span><strong>{item.label}</strong><div className="bar"><i style={{ width: `${item.percent}%` }} /></div><b>{item.total ? `${item.percent}%` : "–"}</b><small>{item.total} svar</small></article>)}</div></section>
        <section className="card recent-rounds"><span className="card-kicker">Historikk</span><h2>Siste runder</h2>{stats.rounds.length ? <div>{stats.rounds.map((round) => <article key={round.id}><span>{new Date(round.playedAt).toLocaleDateString("nb-NO", { day: "2-digit", month: "short" })}</span><strong>{formatMode(round.mode)}</strong><b>{round.correct}/{round.total}</b><em>{round.score} p</em><small>{formatTime(round.durationSeconds)}</small></article>)}</div> : <p className="empty-copy">Ingen fullførte runder ennå.</p>}</section>
        <div className="danger-zone"><div><strong>Nullstill statistikk</strong><span>Sletter progresjon, rekorder og rundeoversikt fra denne nettleseren.</span></div><button onClick={this.resetStats}>Slett alt</button></div>
      </main>
    );
  }

  renderAbout() {
    return (
      <main className="about-page">
        <section className="page-heading"><span className="eyebrow">Om prosjektet</span><h1>Geospillet</h1><p>Et norsk, personvernvennlig geografispill som fungerer uten innlogging og backend.</p></section>
        <section className="about-grid">
          <article className="card"><span className="about-icon">⚑</span><h2>Lokale flagg og kart</h2><p>Flagg, landdata og kartformer følger med appen. En spillrunde krever ingen eksterne API-er.</p></article>
          <article className="card"><span className="about-icon">↻</span><h2>Smart repetisjon</h2><p>Land med feil, lav treffprosent eller mange brukte tips får høyere prioritet i repetisjonsmodus.</p></article>
          <article className="card"><span className="about-icon">⌁</span><h2>Privat progresjon</h2><p>Statistikk lagres i localStorage i nettleseren din og sendes ikke til en server.</p></article>
        </section>
        <section className="card source-card"><h2>Datagrunnlag og lisenser</h2><p>Den inkluderte datasnapshoten er normalisert fra CountryInfo, pycountry/Babel og Natural Earth. Flaggene er generert som lokale SVG-filer med TeX-pakken worldflags. Nøyaktige lisensopplysninger og attribusjon ligger i <code>THIRD_PARTY_NOTICES.md</code> i prosjektet.</p><p>Enkelte land har flere hovedsteder eller politisk/administrativt sammensatte hovedstadsforhold. Spillet godtar flere relevante svar der datasettet angir dette.</p></section>
      </main>
    );
  }

  render() {
    if (this.state.loading) return <div className="loading-screen"><Logo /><strong>Laster Geospillet …</strong><span /></div>;
    if (this.state.error) return <div className="loading-screen error"><Logo /><strong>Noe gikk galt</strong><p>{this.state.error}</p><small>Start appen gjennom en lokal webserver, ikke direkte som en fil.</small></div>;
    return (
      <div className="app-shell">
        {this.renderHeader()}
        <div className="sr-only" aria-live="polite">{this.state.liveMessage}</div>
        {this.state.screen === "setup" && this.renderSetup()}
        {this.state.screen === "game" && this.renderGame()}
        {this.state.screen === "results" && this.renderResults()}
        {this.state.screen === "stats" && this.renderStats()}
        {this.state.screen === "about" && this.renderAbout()}
        <footer><span>Geospillet · Data lagres lokalt</span><button onClick={() => this.setState({ screen: "about" })}>Datakilder og lisenser</button></footer>
      </div>
    );
  }
}

ReactDOM.render(<App />, document.getElementById("root"));
