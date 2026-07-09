const APP_MODES = new Set(["generator", "translator", "about"]);

function getModeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const explicitMode = params.get("mode");
  if (APP_MODES.has(explicitMode)) {
    return explicitMode;
  }

  if (params.has("source") || params.has("target") || params.has("lang")) {
    return "translator";
  }

  return "generator";
}

window.APP_MODE = getModeFromLocation();

function setActiveMode(mode, updateHistory = true) {
  if (!APP_MODES.has(mode)) {
    return;
  }

  window.APP_MODE = mode;

  const panels = document.querySelectorAll(".mode-panel");
  panels.forEach(panel => {
    // FIXED: Instead of panel.hidden, we now toggle Tailwind's 'hidden' class
    panel.classList.toggle("hidden", panel.id !== `mode-${mode}`);
  });

  document.querySelectorAll("[data-mode-link]").forEach(link => {
    link.classList.toggle("active", link.dataset.modeLink === mode);
  });

  const titles = {
    generator: "Link Generator - Easy Android XML Translator",
    translator: "XML Translator - Easy Android XML Translator",
    about: "About - Easy Android XML Translator",
  };
  document.title = titles[mode] || titles.generator;

  if (mode === "generator" && typeof window.initGeneratorPage === "function") {
    window.initGeneratorPage();
  }

  if (mode === "translator" && typeof window.initTranslatorPage === "function") {
    window.initTranslatorPage();
  }

  if (updateHistory) {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    window.history.pushState({ mode }, "", `${url.pathname}${url.search}${url.hash}`);
  }
}

function syncModeFromLocation(updateHistory = false) {
  setActiveMode(getModeFromLocation(), updateHistory);
}

document.addEventListener("DOMContentLoaded", () => {
  syncModeFromLocation(false);

  document.querySelectorAll("[data-mode-link]").forEach(link => {
    link.addEventListener("click", event => {
      event.preventDefault();
      setActiveMode(link.dataset.modeLink, true);
    });
  });

  window.addEventListener("popstate", () => {
    syncModeFromLocation(false);
  });
});