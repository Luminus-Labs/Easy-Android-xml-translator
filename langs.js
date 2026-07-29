/* =========================
   LANGUAGE SCHEMA
   Single source of truth for all language data used by the
   generator, translator, and RTL logic.

   Each entry:
     code           BCP-47-ish short code used in Android values-XX folders
     name           English display name
     nativeName     Endonym (name in the language itself)
     region         Optional region variants (e.g. pt-BR, zh-CN)
     rtl            true for right-to-left scripts
     script         Writing system family (informational)
========================= */

window.LANGUAGES = [
  { code: "en", name: "English",       nativeName: "English",     region: ["en"],                       rtl: false, script: "Latin" },
  { code: "fr", name: "French",        nativeName: "Français",    region: ["fr"],                       rtl: false, script: "Latin" },
  { code: "es", name: "Spanish",       nativeName: "Español",     region: ["es"],                       rtl: false, script: "Latin" },
  { code: "de", name: "German",        nativeName: "Deutsch",     region: ["de"],                       rtl: false, script: "Latin" },
  { code: "it", name: "Italian",       nativeName: "Italiano",    region: ["it"],                       rtl: false, script: "Latin" },
  { code: "pt", name: "Portuguese",    nativeName: "Português",   region: ["pt", "pt-rBR", "pt-rPT"],   rtl: false, script: "Latin" },
  { code: "ja", name: "Japanese",      nativeName: "日本語",        region: ["ja"],                       rtl: false, script: "CJK" },
  { code: "zh", name: "Chinese",       nativeName: "中文",          region: ["zh", "zh-rCN", "zh-rTW", "zh-rHK"], rtl: false, script: "CJK" },
  { code: "ru", name: "Russian",       nativeName: "Русский",     region: ["ru"],                       rtl: false, script: "Cyrillic" },
  { code: "ar", name: "Arabic",        nativeName: "العربية",      region: ["ar"],                       rtl: true,  script: "Arabic" },
  { code: "he", name: "Hebrew",        nativeName: "עברית",        region: ["iw", "he"],                 rtl: true,  script: "Hebrew" },
  { code: "fa", name: "Persian",       nativeName: "فارسی",        region: ["fa"],                       rtl: true,  script: "Arabic" },
  { code: "ur", name: "Urdu",          nativeName: "اردو",         region: ["ur"],                       rtl: true,  script: "Arabic" },
  { code: "ko", name: "Korean",        nativeName: "한국어",        region: ["ko"],                       rtl: false, script: "CJK" },
  { code: "nl", name: "Dutch",         nativeName: "Nederlands",  region: ["nl"],                       rtl: false, script: "Latin" },
  { code: "tr", name: "Turkish",       nativeName: "Türkçe",      region: ["tr"],                       rtl: false, script: "Latin" },
  { code: "pl", name: "Polish",        nativeName: "Polski",      region: ["pl"],                       rtl: false, script: "Latin" },
  { code: "hi", name: "Hindi",         nativeName: "हिन्दी",         region: ["hi"],                       rtl: false, script: "Devanagari" },
  { code: "id", name: "Indonesian",    nativeName: "Bahasa Indonesia", region: ["id"],                  rtl: false, script: "Latin" },
  { code: "vi", name: "Vietnamese",    nativeName: "Tiếng Việt",  region: ["vi"],                       rtl: false, script: "Latin" },
  { code: "th", name: "Thai",          nativeName: "ไทย",          region: ["th"],                       rtl: false, script: "Thai" },
  { code: "uk", name: "Ukrainian",     nativeName: "Українська",   region: ["uk"],                       rtl: false, script: "Cyrillic" },
  { code: "cs", name: "Czech",         nativeName: "Čeština",     region: ["cs"],                       rtl: false, script: "Latin" },
  { code: "sv", name: "Swedish",       nativeName: "Svenska",     region: ["sv"],                       rtl: false, script: "Latin" },
  { code: "el", name: "Greek",         nativeName: "Ελληνικά",     region: ["el"],                       rtl: false, script: "Greek" },
  { code: "ro", name: "Romanian",      nativeName: "Română",      region: ["ro"],                       rtl: false, script: "Latin" },
  { code: "hu", name: "Hungarian",     nativeName: "Magyar",      region: ["hu"],                       rtl: false, script: "Latin" },
  { code: "fi", name: "Finnish",       nativeName: "Suomi",       region: ["fi"],                       rtl: false, script: "Latin" },
  { code: "da", name: "Danish",        nativeName: "Dansk",       region: ["da"],                       rtl: false, script: "Latin" },
  { code: "no", name: "Norwegian",     nativeName: "Norsk",       region: ["nb", "no"],                 rtl: false, script: "Latin" },
  { code: "bg", name: "Bulgarian",     nativeName: "Български",    region: ["bg"],                       rtl: false, script: "Cyrillic" },
  { code: "bn", name: "Bengali",       nativeName: "বাংলা",        region: ["bn"],                       rtl: false, script: "Bengali" },
  { code: "ta", name: "Tamil",         nativeName: "தமிழ்",         region: ["ta"],                       rtl: false, script: "Tamil" },
  { code: "ms", name: "Malay",         nativeName: "Bahasa Melayu", region: ["ms"],                     rtl: false, script: "Latin" },
  { code: "ca", name: "Catalan",       nativeName: "Català",      region: ["ca"],                       rtl: false, script: "Latin" },
  { code: "sw", name: "Swahili",       nativeName: "Kiswahili",   region: ["sw"],                       rtl: false, script: "Latin" }
];

/* Lookup helpers used across the app. */
window.getLanguageByCode = function (code) {
  if (!code) return null;
  const normalized = String(code).toLowerCase().replace("_", "-");
  return (
    window.LANGUAGES.find(l => l.code === normalized) ||
    window.LANGUAGES.find(l => l.region && l.region.includes(normalized)) ||
    null
  );
};

window.getLanguageDisplayName = function (code, useNative = true) {
  const entry = window.getLanguageByCode(code);
  if (!entry) return (code || "").toUpperCase();
  return useNative ? entry.nativeName : entry.name;
};

window.isRTLLanguage = function (code) {
  const entry = window.getLanguageByCode(code);
  return !!(entry && entry.rtl);
};

/* Apply / clear the page-level RTL class based on the current translator language. */
window.applyDocumentDirection = function (code) {
  const isRTL = window.isRTLLanguage(code);
  document.documentElement.setAttribute("dir", isRTL ? "rtl" : "ltr");
  document.documentElement.setAttribute("lang", code || "en");
};
