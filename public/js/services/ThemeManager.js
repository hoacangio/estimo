/**
 * Themes. "system" | "light" | "dark" are built in; fun themes live in /themes/<name>.css
 * and are downloaded only when chosen, so the default theme pays nothing for them.
 */
import { storage } from "../lib/storage.js";
import { addStylesheet } from "../lib/dom.js";
import { seasonOn, isInSeason } from "../domain/seasons.js";

export const RETRO = "retro2007";

export const FUN_THEMES = {
  retro2007: { label: "Retro 2007", dark: false, font: "family=Varela+Round",
               hello: "Chào mừng trở lại năm 2007! Xem tốt nhất ở 1024×768 ;)" },
  cinema:    { label: "Cinema", dark: true, font: "family=Bebas+Neue&family=Archivo:wght@400;500;700",
               hello: "Now showing: your sprint planning" },
  samurai:   { label: "Samurai", dark: false, font: "family=Shippori+Mincho:wght@500;700&family=Yuji+Syuku",
               hello: "道 — The way of the estimate" },
  mission:   { label: "Mission Control", dark: true, font: "family=Orbitron:wght@500;700&family=Share+Tech+Mono",
               hello: "All systems go. Mission control online." },
  // Seasonal themes: also switch on by themselves on their dates (domain/seasons.js)
  womensday: { label: "Women's Day (8/3)", dark: false, seasonal: true,
               hello: "Happy International Women's Day! 🌷", banner: "🌷 Happy International Women's Day — 8/3" },
  tet:       { label: "Tết", dark: false, seasonal: true,
               hello: "Chúc mừng năm mới! 🧧", banner: "🧧 Chúc Mừng Năm Mới · Happy Tết" },
  halloween: { label: "Halloween", dark: true, seasonal: true,
               hello: "Happy Halloween! 🎃", banner: "🎃 Happy Halloween" },
  christmas: { label: "Christmas", dark: false, seasonal: true,
               hello: "Merry Christmas! 🎄", banner: "🎄 Merry Christmas & Happy Holidays" },
};

/** Per-theme wording, keyed by the default English text. The meaning always stays the same. */
const THEME_COPY = {
  cinema: { "Now estimating": "Now showing", "Reveal cards": "▶ Play reveal", "Save &amp; next ticket": "Next episode »",
            "Invite": "Share", "Create a new room": "Start a watch party", "Join": "Join", "Participants": "Cast",
            "History": "Previously on…", "Re-vote": "Rewatch" },
  samurai: { "Now estimating": "任務 · Current quest", "Reveal cards": "抜刀 · Reveal", "Save &amp; next ticket": "次へ · Next quest",
             "Invite": "招待 · Invite", "Create a new room": "道場を開く · Open a dojo", "Join": "入門", "Participants": "侍 · Warriors",
             "History": "巻物 · Scroll", "Re-vote": "再戦 · Again" },
  mission: { "Now estimating": "Mission objective", "Reveal cards": "Initiate reveal", "Save &amp; next ticket": "Next objective ›",
             "Invite": "Uplink", "Create a new room": "Launch new mission", "Join": "Dock", "Participants": "Crew",
             "History": "Mission log", "Re-vote": "Abort & retry" },
};

const GOOGLE_FONTS = "https://fonts.googleapis.com/css2?";

export class ThemeManager {
  /** @param {{ onAssetsLoaded?: () => void }} options  called when a theme's CSS arrives (layout may change) */
  constructor({ onAssetsLoaded } = {}) {
    this.onAssetsLoaded = onAssetsLoaded;
    // Fonts are injected from script so they never block first paint.
    addStylesheet(GOOGLE_FONTS + "family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap");
  }

  /** The active theme attribute: "" (system), "light", "dark" or a fun theme name. */
  get current() { return document.documentElement.getAttribute("data-theme") || ""; }
  get funTheme() { return FUN_THEMES[this.current] ? this.current : ""; }
  get isRetro() { return this.current === RETRO; }

  get isDark() {
    const t = this.current;
    if (FUN_THEMES[t]) return FUN_THEMES[t].dark;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  }

  /** Seasonal themes switch on by themselves unless turned off in Settings. */
  get seasonalAuto() { return storage.get("seasonalThemes", true); }
  set seasonalAuto(on) { storage.set("seasonalThemes", !!on); this.apply(); }

  /**
   * The season shown automatically right now, or null. It applies only while the saved choice
   * is the default theme, and not after the user chose "Default" during this occurrence.
   */
  get autoSeason() {
    if (!this.seasonalAuto || FUN_THEMES[this.saved]) return null;
    const season = seasonOn();
    return season && storage.get("seasonDismissed", "") !== season.id ? season : null;
  }

  /** What the user picked: "system" | "light" | "dark" | a fun theme name.
   *  A seasonal theme picked by hand ends with its season (back to the default). */
  get saved() {
    const saved = storage.get("theme", "system");
    if (["system", "light", "dark"].includes(saved)) return saved;
    if (!FUN_THEMES[saved] || (FUN_THEMES[saved].seasonal && !isInSeason(saved))) return "system";
    return saved;
  }

  /** Themes offered in the pickers: every fun theme, plus seasonal ones only during their season. */
  available({ seasonal }) {
    return Object.entries(FUN_THEMES).filter(([key, t]) => (seasonal ? t.seasonal && isInSeason(key) : !t.seasonal));
  }

  /** Apply the saved choice (or today's seasonal theme) to <html data-theme>. */
  apply() {
    const active = this.autoSeason?.theme || this.saved;
    this.#loadAssets(active);
    if (active === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", active);
    storage.set("activeTheme", active); // read by boot.js on the next visit, before first paint
  }

  /** Light ⇄ dark (leaves any fun theme). */
  toggleDark() {
    this.#dismissSeason();
    storage.set("theme", this.isDark ? "light" : "dark");
    this.apply();
  }

  /** Switch to a fun theme by name, or back to the default with "". Returns its greeting, if any. */
  choose(name) {
    if (!FUN_THEMES[name]) this.#dismissSeason(); // "Default" during a season means: not this time
    storage.set("theme", FUN_THEMES[name] ? name : "system");
    this.apply();
    return FUN_THEMES[name]?.hello ?? "";
  }

  /** Greeting for an automatic season, once per occurrence. */
  seasonGreeting() {
    const season = this.autoSeason;
    if (!season || storage.get("seasonGreeted", "") === season.id) return "";
    storage.set("seasonGreeted", season.id);
    return FUN_THEMES[season.theme].hello;
  }

  #dismissSeason() {
    const season = this.autoSeason;
    if (season) storage.set("seasonDismissed", season.id);
  }

  /**
   * Text in the current theme's voice.
   * @param {string} en  default English text (also the THEME_COPY key)
   * @param {string} [retroVi]  Vietnamese 2007-era wording for the Retro theme
   */
  text(en, retroVi = en) {
    if (this.isRetro) return retroVi;
    return THEME_COPY[this.current]?.[en] ?? en;
  }

  #loadAssets(name) {
    const theme = FUN_THEMES[name];
    if (!theme) return;
    addStylesheet(`/themes/${name}.css`, { id: "theme-css-" + name, onload: () => this.onAssetsLoaded?.() });
    if (theme.font) addStylesheet(`${GOOGLE_FONTS}${theme.font}&display=swap`);
  }
}
