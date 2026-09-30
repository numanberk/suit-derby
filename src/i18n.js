/* Suit Derby translations. English text is the key: t('Lap {n}', {n: 3}) returns the English
   text as written, or the Turkish one from I18n.dict.tr when that language is selected.
   A missing translation falls back to English, so nothing ever shows up blank.
   The choice is stored in localStorage (wrapped in try/catch: the game works without storage). */
const I18n = (() => {
  const KEY = 'suitderby.lang';
  const LANGS = [{ id: 'en', name: 'English', short: 'EN', html: 'en' }, { id: 'tr', name: 'Türkçe', short: 'TR', html: 'tr' }];
  const dict = { en: {}, tr: {} };
  const rules = { en: null, tr: null };
  const listeners = [];
  let lang = 'en';

  function detect() {
    try { const v = localStorage.getItem(KEY); if (v && dict[v]) return v; } catch (e) {}
    try { if (/^tr\b/i.test(navigator.language || '')) return 'tr'; } catch (e) {}
    return 'en';
  }
  function fill(s, p) {
    if (!p) return s;
    return s.replace(/\{(\w+)\}/g, (m, k) => (p[k] != null ? p[k] : m));
  }
  function t(en, p) {
    const d = dict[lang];
    const s = d && Object.prototype.hasOwnProperty.call(d, en) ? d[en] : en;
    return fill(s, p);
  }
  /* plural helper: one/other are both English keys; Turkish usually has the same text for both */
  const tp = (n, one, other, p) => t(n === 1 ? one : other, Object.assign({ n }, p));
  /* decimal comma in Turkish: n(2.5.toFixed(1)) -> "2,5" */
  const n = s => (lang === 'tr' ? String(s).replace('.', ',') : String(s));
  const locale = () => (lang === 'tr' ? 'tr-TR' : 'en-US');

  function applyStatic(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
    root.querySelectorAll('[data-i18n-label]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-label'))); });
    root.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
    if (root === document) {
      document.documentElement.lang = lang;
      const ti = document.querySelector('title'); if (ti) ti.textContent = t('Suit Derby');
    }
  }
  function set(id, silent) {
    if (!dict[id]) id = 'en';
    lang = id;
    if (!silent) { try { localStorage.setItem(KEY, id); } catch (e) {} }
    applyStatic();
    listeners.forEach(f => f(id));
  }
  function init() { lang = detect(); applyStatic(); }
  return {
    t, tp, n, locale, set, init, LANGS, dict, rules,
    get lang() { return lang; },
    onChange: f => { listeners.push(f); },
    apply: applyStatic
  };
})();
if (typeof module !== 'undefined') module.exports = I18n;
