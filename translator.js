/* =========================
   URL PARAMETER PARSER
========================= */

const urlParams = new URLSearchParams(window.location.search);

const CONFIG = {
  SOURCE_URL: urlParams.get('source'),
  TARGET_URL: urlParams.get('target'),
  LANGUAGE: urlParams.get('lang') || 'fr',
  STORAGE_PREFIX: "translator_",
  DEBOUNCE_SAVE: 1000,
  CORS_PROXIES: [
    'https://cors-anywhere.herokuapp.com/',
    'https://api.allorigins.win/raw?url=',
  ],
};

let translatorInitialized = false;

function validateConfig() {
  const errors = [];

  if (!CONFIG.SOURCE_URL) {
    errors.push("Missing required parameter: source (raw URL to strings.xml)");
  }
  if (!CONFIG.LANGUAGE) {
    errors.push("Missing required parameter: lang (language code)");
  }

  if (CONFIG.SOURCE_URL) {
    try {
      new URL(CONFIG.SOURCE_URL);
    } catch {
      errors.push("Invalid source URL format");
    }
  }

  if (CONFIG.TARGET_URL) {
    try {
      new URL(CONFIG.TARGET_URL);
    } catch {
      errors.push("Invalid target URL format");
    }
  }

  return errors;
}

function showConfigInfo() {
  const info = document.getElementById('configInfo');
  info.innerHTML = `
    <strong>Configuration:</strong> 
    Language: <code>${CONFIG.LANGUAGE}</code> | 
    Source: <code>${CONFIG.SOURCE_URL.substring(0, 60)}...</code>
    ${CONFIG.TARGET_URL ? ` | Target: <code>${CONFIG.TARGET_URL.substring(0, 60)}...</code>` : ''}
  `;
  info.classList.add('show');
}

function showError(message) {
  document.getElementById('loadBtn').disabled = true;
  document.getElementById('tbody').innerHTML = '';
  const errorState = document.getElementById('errorState');
  document.getElementById('errorMsg').textContent = message;
  errorState.style.display = 'block';
}

/* =========================
   STATE
========================= */

const app = {
  base: {},
  translated: {},
  filteredKeys: [],
  filter: "all",
  searchTerm: "",
  editingKey: null,
  saveTimeout: null,
  loaded: false,

  init() {
    const errors = validateConfig();
    if (errors.length > 0) {
      showError(errors.join("<br>"));
      return;
    }

    showConfigInfo();
    this.load();
  },
  parseXML(text) {
    console.log("=== parseXML called ===");
    console.log("Input text length:", text.length);

    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");

    console.log("XML parsed. Root element:", xml.documentElement.nodeName);

    if (xml.documentElement.nodeName === "parsererror") {
      console.error("XML parse error detected!");
      throw new Error("Invalid XML format");
    }

    const map = {};

    const stringElements = xml.querySelectorAll("string");
    console.log("Found string elements:", stringElements.length);

    stringElements.forEach((node, idx) => {
      const name = node.getAttribute("name");
      const text = node.textContent || "";
      if (name) {
        map[name] = text;
        if (idx < 3) console.log(`  [${idx}] ${name}: "${text.substring(0, 50)}"`);
      }
    });

    const types = {};
    stringElements.forEach(node => {
      const name = node.getAttribute("name");
      if (name) types[name] = "string";
    });

    xml.querySelectorAll("plurals").forEach(node => {
      const name = node.getAttribute("name");
      if (name) {
        // Keyed by quantity ("zero"/"one"/"two"/"few"/"many"/"other") instead of
        // flattening by document order — different languages define different
        // numbers of plural forms (e.g. English has 2, Russian/Portuguese have more),
        // so positional joining silently misaligns them.
        const quantities = {};
        node.querySelectorAll("item").forEach(item => {
          const quantity = item.getAttribute("quantity") || "other";
          quantities[quantity] = item.textContent || "";
        });
        map[name] = { quantities };
        types[name] = "plural";
      }
    });

    xml.querySelectorAll("string-array").forEach(node => {
      const name = node.getAttribute("name");
      if (name) {
        const items = [];
        node.querySelectorAll("item").forEach(item => {
          items.push(item.textContent || "");
        });
        map[name] = items.join(" | ");
        types[name] = "array";
      }
    });

    console.log("=== parseXML complete ===");
    console.log("Total keys found:", Object.keys(map).length);
    return { map, types };
  },

  PLURAL_ORDER: ["zero", "one", "two", "few", "many", "other"],

  isPluralValue(v) {
    return !!(v && typeof v === "object" && v.quantities);
  },

  formatPluralDisplay(quantities) {
    return this.PLURAL_ORDER
      .filter(q => quantities[q] !== undefined)
      .map(q => `${q}: ${quantities[q]}`)
      .join(" | ");
  },

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  },

  async fetchWithCORS(url) {
    console.log("Attempting to fetch:", url);

    try {
      const res = await fetch(url, {
        headers: {
          'Accept': 'text/plain, application/xml',
        }
      });
      if (res.ok) {
        console.log("Direct fetch succeeded");
        return res;
      }
    } catch (e) {
      console.log("Direct fetch failed:", e.message);
    }

    for (const proxy of CONFIG.CORS_PROXIES) {
      try {
        const corsUrl = proxy + encodeURIComponent(url);
        console.log("Trying CORS proxy:", proxy);
        const res = await fetch(corsUrl);
        if (res.ok) {
          console.log("CORS proxy succeeded:", proxy);
          return res;
        }
      } catch (e) {
        console.log("CORS proxy failed:", proxy, e.message);
        continue;
      }
    }

    throw new Error(`Failed to fetch URL from all sources. The URL may not be accessible or may not support cross-origin requests. Please ensure the URL is a direct link to the raw XML file.`);
  },

  async load() {
    this.setStatus("Loading...");
    this.lock();

    try {
      const lang = CONFIG.LANGUAGE;

      console.log("========== LOAD START ==========");
      console.log("Language:", lang);
      const res = await this.fetchWithCORS(CONFIG.SOURCE_URL);

      const baseText = await res.text();
      console.log("Fetched base text length:", baseText.length);

      const { map: baseParsed, types: baseTypes } = this.parseXML(baseText);
      this.types = baseTypes;

      const stored = this.getStoredState(lang);

      this.base = {};
      Object.keys(baseParsed).forEach(key => {
        const raw = baseParsed[key];
        if (this.isPluralValue(raw)) {
          const flatText = this.formatPluralDisplay(raw.quantities);
          this.base[key] = { text: flatText, hash: this.hashString(flatText), quantities: raw.quantities };
        } else {
          const text = raw;
          const hash = this.hashString(text);
          this.base[key] = { text, hash };
        }
      });

      console.log("✅ Base loaded with", Object.keys(this.base).length, "keys");

      this.translated = {};
      if (CONFIG.TARGET_URL) {
        try {
          console.log("Loading target/translation file...");
          const tRes = await this.fetchWithCORS(CONFIG.TARGET_URL);
          if (tRes.ok) {
            const translatedText = await tRes.text();
            console.log("Fetched target text length:", translatedText.length);
            const { map: targetParsed } = this.parseXML(translatedText);
            this.translated = targetParsed;
            console.log("✅ Target loaded with", Object.keys(this.translated).length, "keys");
          }
        } catch (e) {
          console.log("❌ Failed to load target:", e.message);
          this.translated = stored.translations || {};
        }
      } else {
        this.translated = stored.translations || {};
      }

      this.saveState(lang);
      this.loaded = true;

      console.log("About to call applyFilters. base keys:", Object.keys(this.base).length);
      this.applyFilters();

      this.setStatus("Loaded successfully");
      console.log("========== LOAD COMPLETE ==========");
    } catch (err) {
      this.setStatus("Error: " + err.message);
      showError("Failed to load configuration: " + err.message);
      console.error("❌ ERROR:", err);
    } finally {
      this.unlock();
    }
  },

  getStoredState(lang) {
    const key = CONFIG.STORAGE_PREFIX + lang;
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
      return {};
    }
  },

  saveState(lang) {
    const key = CONFIG.STORAGE_PREFIX + lang;
    const state = {
      basePerKey: this.base,
      translations: this.translated,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(state));
  },

  setFilter(filterType) {
    this.filter = filterType;
    document.querySelectorAll(".filter-btn").forEach((btn, idx) => {
      btn.classList.toggle("active",
        (idx === 0 && filterType === "all") ||
        (idx === 1 && filterType === "missing") ||
        (idx === 2 && filterType === "outdated") ||
        (idx === 3 && filterType === "needs-work")
      );
    });
    this.applyFilters();
  },

  onSearch(event) {
    this.searchTerm = event.target.value.toLowerCase();
    this.applyFilters();
  },

  applyFilters() {
    console.log("applyFilters called. base keys:", Object.keys(this.base).length);
    const keys = Object.keys(this.base);

    let filtered = keys.filter(key => {
      const status = this.getStatus(key);

      switch (this.filter) {
        case "missing":
          return status.type === "missing";
        case "outdated":
          return status.type === "outdated";
        case "needs-work":
          return status.type === "missing" || status.type === "outdated" || status.type === "placeholder-issue";
        default:
          return true;
      }
    });

    if (this.searchTerm) {
      filtered = filtered.filter(key =>
        key.toLowerCase().includes(this.searchTerm) ||
        this.base[key].text.toLowerCase().includes(this.searchTerm)
      );
    }

    filtered.sort((a, b) => {
      const statusA = this.getStatus(a);
      const statusB = this.getStatus(b);
      const priority = { missing: 0, "placeholder-issue": 1, outdated: 2, ok: 3 };
      return (priority[statusA.type] || 3) - (priority[statusB.type] || 3);
    });

    this.filteredKeys = filtered;
    console.log("Filtered keys:", this.filteredKeys.length);
    this.render();
  },

  getStatus(key) {
    const baseData = this.base[key];
    const trRaw = this.translated[key];

    if (baseData.quantities) {
      // Plural key: validate each translated quantity form against the matching
      // base form (falling back to "other" if the base doesn't define that form).
      // We do NOT require the same number of forms on both sides — languages
      // legitimately need different plural categories.
      if (!trRaw || !this.isPluralValue(trRaw) || !trRaw.quantities.other) {
        return { type: "missing", badge: "missing", class: "row-missing" };
      }
      for (const q of Object.keys(trRaw.quantities)) {
        const trText = trRaw.quantities[q];
        const baseText = baseData.quantities[q] !== undefined ? baseData.quantities[q] : baseData.quantities.other;
        if (!this.validatePlaceholders(baseText, trText)) {
          return { type: "placeholder-issue", badge: "placeholder issue", class: "row-placeholder-issue" };
        }
      }
    } else {
      const tr = typeof trRaw === "string" ? trRaw : "";
      if (!tr) {
        return { type: "missing", badge: "missing", class: "row-missing" };
      }
      if (!this.validatePlaceholders(baseData.text, tr)) {
        return { type: "placeholder-issue", badge: "placeholder issue", class: "row-placeholder-issue" };
      }
    }

    const stored = this.getStoredState(CONFIG.LANGUAGE);
    const previousBase = stored.basePerKey || {};
    const previousHash = previousBase[key] ? previousBase[key].hash : null;
    const currentHash = baseData.hash;

    if (previousHash && previousHash !== currentHash) {
      return { type: "outdated", badge: "outdated", class: "row-outdated" };
    }

    return { type: "ok", badge: "✓", class: "row-ok" };
  },

  extractPlaceholders(str) {
    const matches = str.match(/%(\d+\$)?[sdifxX]/g) || [];
    return matches.sort();
  },

  validatePlaceholders(en, tr) {
    const aStr = this.extractPlaceholders(en).join(",");
    const bStr = this.extractPlaceholders(tr).join(",");
    return aStr === bStr;
  },

  render() {
    console.log("render called. filteredKeys:", this.filteredKeys.length, "loaded:", this.loaded);
    const tbody = document.getElementById("tbody");
    const emptyState = document.getElementById("emptyState");

    if (this.filteredKeys.length === 0) {
      tbody.innerHTML = "";
      emptyState.style.display = this.loaded ? "block" : "none";
      console.log("No filtered keys, showing empty state");
      return;
    }

    emptyState.style.display = "none";
    tbody.innerHTML = "";

    this.filteredKeys.forEach((key, idx) => {
      const baseData = this.base[key];
      const trRaw = this.translated[key];
      const status = this.getStatus(key);

      const row = document.createElement("tr");
      row.className = status.class;
      row.id = `row-${key}`;

      const stored = this.getStoredState(CONFIG.LANGUAGE);
      const previousBase = stored.basePerKey || {};
      const prevText = previousBase[key] ? previousBase[key].text : "";
      const hasChanged = prevText && prevText !== baseData.text;

      const keyCellHTML = `
        ${this.escapeHTML(key)}
        <span class="badge badge-${status.type}">${status.badge}</span>
        ${hasChanged ? `<div class="outdated-diff">Changed</div>` : ""}
      `;

      if (baseData.quantities) {
        // Plural key: one input per quantity form, so each form can be
        // edited/validated independently instead of as one flattened blob.
        const trQuantities = this.isPluralValue(trRaw) ? trRaw.quantities : {};
        const allQuantities = this.PLURAL_ORDER.filter(q =>
          baseData.quantities[q] !== undefined || trQuantities[q] !== undefined
        );

        row.innerHTML = `
          <td class="key-cell">${keyCellHTML}</td>
          <td class="text-cell">
            ${allQuantities.map(q => `<div><code>${this.escapeHTML(q)}</code>: ${this.escapeHTML(baseData.quantities[q] !== undefined ? baseData.quantities[q] : baseData.quantities.other)}</div>`).join("")}
            ${hasChanged ? `<div class="outdated-diff">Was: ${this.escapeHTML(prevText)}</div>` : ""}
          </td>
          <td class="translation-cell">
            ${allQuantities.map(q => `
              <div style="margin-bottom:4px;">
                <label style="font-size:11px; opacity:.7;">${this.escapeHTML(q)}</label>
                <input
                  type="text"
                  data-key="${key}"
                  data-quantity="${q}"
                  data-idx="${idx}"
                  value="${this.escapeHTML(trQuantities[q] || "")}"
                  onchange="app.onChange(this)"
                  oninput="app.onInput(this)"
                  onkeydown="app.onKeydown(event, this)"
                  onfocus="app.editingKey = '${key}'">
              </div>
            `).join("")}
          </td>
        `;
      } else {
        const tr = typeof trRaw === "string" ? trRaw : "";
        row.innerHTML = `
          <td class="key-cell">${keyCellHTML}</td>
          <td class="text-cell">
            ${this.escapeHTML(baseData.text)}
            ${hasChanged ? `<div class="outdated-diff">Was: ${this.escapeHTML(prevText)}</div>` : ""}
          </td>
          <td class="translation-cell">
            <input 
              type="text" 
              data-key="${key}"
              data-idx="${idx}"
              value="${this.escapeHTML(tr)}"
              onchange="app.onChange(this)"
              oninput="app.onInput(this)"
              onkeydown="app.onKeydown(event, this)"
              onfocus="app.editingKey = '${key}'">
          </td>
        `;
      }

      tbody.appendChild(row);
    });

    this.updateStats();
  },

  setTranslatedValue(el) {
    const key = el.getAttribute("data-key");
    const quantity = el.getAttribute("data-quantity");
    if (quantity) {
      if (!this.isPluralValue(this.translated[key])) {
        this.translated[key] = { quantities: {} };
      }
      this.translated[key].quantities[quantity] = el.value;
    } else {
      this.translated[key] = el.value;
    }
    return key;
  },

  onInput(el) {
    this.setTranslatedValue(el);
    this.debouncedSave();
  },

  onChange(el) {
    const key = this.setTranslatedValue(el);
    this.saveState(CONFIG.LANGUAGE);
    const row = document.getElementById(`row-${key}`);
    const status = this.getStatus(key);
    row.className = status.class;
  },

  debouncedSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveState(CONFIG.LANGUAGE);
    }, CONFIG.DEBOUNCE_SAVE);
  },

  onKeydown(event, el) {
    // Identify the input by DOM element, not by key — a plural key now has
    // multiple inputs (one per quantity form), so looking up "the input with
    // this key" would always land on the first form and break navigation.
    const inputs = Array.from(document.querySelectorAll(".translation-cell input"));
    const currentIdx = inputs.indexOf(el);

    if (event.key === "Enter") {
      event.preventDefault();
      if (currentIdx < inputs.length - 1) {
        inputs[currentIdx + 1].focus();
      }
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIdx > 0) {
        inputs[currentIdx - 1].focus();
      }
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (currentIdx < inputs.length - 1) {
        inputs[currentIdx + 1].focus();
      }
    } else if (event.key === "Tab") {
      if (event.shiftKey && currentIdx > 0) {
        event.preventDefault();
        inputs[currentIdx - 1].focus();
      } else if (!event.shiftKey && currentIdx < inputs.length - 1) {
        event.preventDefault();
        inputs[currentIdx + 1].focus();
      }
    }
  },

  updateStats() {
    const keys = Object.keys(this.base);
    let missing = 0, outdated = 0, completed = 0;

    keys.forEach(key => {
      const status = this.getStatus(key);
      if (status.type === "missing") missing++;
      else if (status.type === "outdated") outdated++;
      else if (status.type === "ok") completed++;
    });

    document.getElementById("statsTotal").textContent = `Total: ${keys.length}`;
    document.getElementById("statsMissing").textContent = `Missing: ${missing}`;
    document.getElementById("statsOutdated").textContent = `Outdated: ${outdated}`;
  },

  escapeHTML(str) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return str.replace(/[&<>"']/g, m => map[m]);
  },

  escapeXMLText(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;");
  },

  escapeXMLAttr(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  buildXML() {
    const lines = ['<?xml version="1.0" encoding="utf-8"?>', "<resources>"];

    Object.keys(this.base).forEach(key => {
      const trRaw = this.translated[key];
      const type = (this.types && this.types[key]) || "string";

      if (type === "plural") {
        const trQuantities = this.isPluralValue(trRaw) ? trRaw.quantities : {};
        const quantitiesToWrite = this.PLURAL_ORDER.filter(q => trQuantities[q]);
        if (quantitiesToWrite.length === 0) return; // skip untranslated
        lines.push(`    <plurals name="${this.escapeXMLAttr(key)}">`);
        quantitiesToWrite.forEach(q => {
          lines.push(`        <item quantity="${q}">${this.escapeXMLText(trQuantities[q])}</item>`);
        });
        lines.push("    </plurals>");
      } else if (type === "array") {
        const trText = typeof trRaw === "string" ? trRaw : "";
        if (!trText) return;
        lines.push(`    <string-array name="${this.escapeXMLAttr(key)}">`);
        trText.split(" | ").forEach(item => {
          lines.push(`        <item>${this.escapeXMLText(item)}</item>`);
        });
        lines.push("    </string-array>");
      } else {
        const trText = typeof trRaw === "string" ? trRaw : "";
        if (!trText) return;
        lines.push(`    <string name="${this.escapeXMLAttr(key)}">${this.escapeXMLText(trText)}</string>`);
      }
    });

    lines.push("</resources>");
    return lines.join("\n");
  },

  exportXML() {
    if (!this.loaded) {
      alert("Load the strings first before exporting.");
      return;
    }
    const xml = this.buildXML();
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const langSuffix = CONFIG.LANGUAGE ? `-${CONFIG.LANGUAGE}` : "";
    a.href = url;
    a.download = `strings${langSuffix}.xml`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  setStatus(msg) {
    document.getElementById("statusMsg").textContent = msg;
  },

  lock() {
    document.getElementById("loadBtn").disabled = true;
  },

  unlock() {
    document.getElementById("loadBtn").disabled = false;
    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) exportBtn.disabled = !this.loaded;
  },
};

window.app = app;

function initTranslatorPage() {
  if (translatorInitialized) {
    return;
  }

  translatorInitialized = true;
  app.init();
}

window.initTranslatorPage = initTranslatorPage;

if (window.APP_MODE === 'translator') {
  document.addEventListener("DOMContentLoaded", initTranslatorPage);
}