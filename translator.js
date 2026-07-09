/* =========================
   URL PARAMETER PARSER
========================= */

const urlParams = new URLSearchParams(window.location.search);

let CONFIG = {
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
  if (!CONFIG.SOURCE_URL) return [];
  if (!CONFIG.LANGUAGE) {
    errors.push("Missing required parameter: lang (language code)");
  }
  if (CONFIG.SOURCE_URL) {
    try { new URL(CONFIG.SOURCE_URL); } catch { errors.push("Invalid source URL format"); }
  }
  if (CONFIG.TARGET_URL) {
    try { new URL(CONFIG.TARGET_URL); } catch { errors.push("Invalid target URL format"); }
  }
  return errors;
}

function showConfigInfo() {
  const info = document.getElementById('configInfo');
  if (!CONFIG.SOURCE_URL) {
    info.classList.add('hidden');
    return;
  }
  info.innerHTML = `
    <strong>Configuration:</strong> 
    Language: <code>${CONFIG.LANGUAGE}</code> | 
    Source: <code>${CONFIG.SOURCE_URL.substring(0, 60)}...</code>
    ${CONFIG.TARGET_URL ? ` | Target: <code>${CONFIG.TARGET_URL.substring(0, 60)}...</code>` : ''}
  `;
  info.classList.remove('hidden');
}

function showError(message) {
  document.getElementById('loadBtn').disabled = true;
  document.getElementById('tbody').innerHTML = '';
  const errorState = document.getElementById('errorState');
  document.getElementById('errorMsg').textContent = message;
  errorState.classList.remove('hidden');
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
  
  // Performance optimizations
  statusCache: {},      // Caches computed row statuses
  renderChunkSize: 40,   // Number of elements to render per frame burst
  renderTimeout: null,  // Tracks asynchronous chunk execution frames

  init() {
    const errors = validateConfig();
    if (errors.length > 0) {
      showError(errors.join("<br>"));
      return;
    }

    if (CONFIG.SOURCE_URL) {
      showConfigInfo();
      this.load();
    } else {
      this.applyFilters();
    }
  },

  handleLocalUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const codeResponse = prompt("Please enter the target language configuration code for this file (e.g. fr, es, pt, ru):", CONFIG.LANGUAGE || "fr");
    const chosenLang = codeResponse ? codeResponse.trim().toLowerCase() : null;
    
    if (!chosenLang) {
      alert("Language assignment aborted. Upload canceled.");
      event.target.value = "";
      return;
    }

    CONFIG.LANGUAGE = chosenLang;

    this.setStatus("Reading local file contents...");
    this.showCentralLoading("Reading local file elements...");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const { map: parsed, types } = this.parseXML(text);
        this.types = types;

        this.base = {};
        Object.keys(parsed).forEach(key => {
          const raw = parsed[key];
          if (this.isPluralValue(raw)) {
            const flatText = this.formatPluralDisplay(raw.quantities);
            this.base[key] = { text: flatText, hash: this.hashString(flatText), quantities: raw.quantities };
          } else {
            const text = raw;
            const hash = this.hashString(text);
            this.base[key] = { text, hash };
          }
        });

        const stored = this.getStoredState(CONFIG.LANGUAGE);
        this.translated = stored.translations || {}; 

        // Invalidate state cache prior to triggering refilter logic
        this.statusCache = {};
        this.loaded = true;
        this.applyFilters();
        this.setStatus("Uploaded file processed successfully");
        this.unlock();
      } catch (err) {
        alert("Error parsing uploaded XML: " + err.message);
        this.setStatus("Upload exception error");
        this.hideCentralLoading();
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  },

  parseXML(text) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");

    if (xml.documentElement.nodeName === "parsererror") {
      throw new Error("Invalid XML structural syntax format");
    }

    const map = {};
    const types = {};

    const stringElements = xml.querySelectorAll("string");
    stringElements.forEach(node => {
      const name = node.getAttribute("name");
      const text = node.textContent || "";
      if (name) {
        map[name] = text;
        types[name] = "string";
      }
    });

    xml.querySelectorAll("plurals").forEach(node => {
      const name = node.getAttribute("name");
      if (name) {
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
    try {
      const res = await fetch(url, { headers: { 'Accept': 'text/plain, application/xml' } });
      if (res.ok) return res;
    } catch (e) {}

    for (const proxy of CONFIG.CORS_PROXIES) {
      try {
        const corsUrl = proxy + encodeURIComponent(url);
        const res = await fetch(corsUrl);
        if (res.ok) return res;
      } catch (e) {
        continue;
      }
    }
    throw new Error(`Failed to fetch URL from all pipeline proxy sources.`);
  },

  async load() {
    if (!CONFIG.SOURCE_URL) {
      alert("No remote parameters found in URL query parameters.");
      return;
    }
    this.setStatus("Loading configurations...");
    this.showCentralLoading("Loading remote XML configurations over proxy nodes...");
    this.lock();

    try {
      const lang = CONFIG.LANGUAGE;
      const res = await this.fetchWithCORS(CONFIG.SOURCE_URL);
      const baseText = await res.text();

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

      this.translated = {};
      if (CONFIG.TARGET_URL) {
        try {
          const tRes = await this.fetchWithCORS(CONFIG.TARGET_URL);
          if (tRes.ok) {
            const translatedText = await tRes.text();
            const { map: targetParsed } = this.parseXML(translatedText);
            this.translated = targetParsed;
          }
        } catch (e) {
          this.translated = stored.translations || {};
        }
      } else {
        this.translated = stored.translations || {};
      }

      this.saveState(lang);
      this.statusCache = {}; // Invalidate performance metrics cache mapping object
      this.loaded = true;
      this.applyFilters();
      this.setStatus("Loaded successfully");
    } catch (err) {
      this.setStatus("Error: " + err.message);
      showError("Failed to load configuration: " + err.message);
      this.hideCentralLoading();
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

  setFilter(filterType, btnElement) {
    this.filter = filterType;
    if (btnElement && btnElement.parentNode) {
      btnElement.parentNode.querySelectorAll("button").forEach(btn => {
        btn.removeAttribute("data-active");
        btn.className = "px-3.5 py-1.5 text-xs font-semibold border rounded-full transition-all bg-white dark:bg-black border-border text-secondary";
      });
      btnElement.setAttribute("data-active", "true");
      btnElement.className = "px-3.5 py-1.5 text-xs font-semibold border rounded-full transition-all bg-white dark:bg-black border-accent text-primary";
    }
    this.applyFilters();
  },

  onSearch(event) {
    this.searchTerm = event.target.value.toLowerCase();
    this.applyFilters();
  },

  applyFilters() {
    // Drop any scheduled rendering pipeline blocks immediately to protect memory threads
    if (this.renderTimeout) {
      cancelAnimationFrame(this.renderTimeout);
      this.renderTimeout = null;
    }

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

    // Performance Optimization: Cache priority values to avoid recalculation loops during lookups
    const priorityMap = { 'missing': 0, 'placeholder-issue': 1, 'outdated': 2, 'ok': 3 };
    filtered.sort((a, b) => {
      const typeA = this.getStatus(a).type;
      const typeB = this.getStatus(b).type;
      return (priorityMap[typeA] ?? 3) - (priorityMap[typeB] ?? 3);
    });

    this.filteredKeys = filtered;
    this.render();
    this.updateStats(); // Compute metrics decoupled from standard loop
  },

  getStatus(key) {
    // Return instantly if configuration parameters have already been calculated
    if (this.statusCache[key]) {
      return this.statusCache[key];
    }

    const baseData = this.base[key];
    const trRaw = this.translated[key];
    let calculatedStatus;

    if (baseData.quantities) {
      if (!trRaw || !this.isPluralValue(trRaw) || !trRaw.quantities.other) {
        calculatedStatus = { type: "missing", badge: "missing", class: "hover:bg-surface2/40 transition-colors" };
      } else {
        let errorFound = false;
        for (const q of Object.keys(trRaw.quantities)) {
          const trText = trRaw.quantities[q];
          const baseText = baseData.quantities[q] !== undefined ? baseData.quantities[q] : baseData.quantities.other;
          if (!this.validatePlaceholders(baseText, trText)) {
            calculatedStatus = { type: "placeholder-issue", badge: "placeholder mismatch", class: "bg-error/5 hover:bg-error/10 transition-colors" };
            errorFound = true;
            break;
          }
        }
        if (!errorFound) {
          calculatedStatus = this.checkOutdatedState(key, baseData);
        }
      }
    } else {
      const tr = typeof trRaw === "string" ? trRaw : "";
      if (!tr) {
        calculatedStatus = { type: "missing", badge: "missing", class: "bg-error/5 hover:bg-error/10 transition-colors" };
      } else if (!this.validatePlaceholders(baseData.text, tr)) {
        calculatedStatus = { type: "placeholder-issue", badge: "placeholder mismatch", class: "bg-error/5 hover:bg-error/10 transition-colors" };
      } else {
        calculatedStatus = this.checkOutdatedState(key, baseData);
      }
    }

    this.statusCache[key] = calculatedStatus;
    return calculatedStatus;
  },

  checkOutdatedState(key, baseData) {
    const stored = this.getStoredState(CONFIG.LANGUAGE);
    const previousBase = stored.basePerKey || {};
    const previousHash = previousBase[key] ? previousBase[key].hash : null;
    
    if (previousHash && previousHash !== baseData.hash) {
      return { type: "outdated", badge: "outdated base", class: "bg-warning/5 hover:bg-warning/10 transition-colors" };
    }
    return { type: "ok", badge: "completed", class: "hover:bg-surface2/20 transition-colors" };
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

  showCentralLoading(msg) {
    const emptyState = document.getElementById("emptyState");
    const staticContent = document.getElementById("emptyStateStaticContent");
    const loadingContent = document.getElementById("emptyStateLoadingContent");
    const loadingText = document.getElementById("emptyStateLoadingText");

    if (emptyState && staticContent && loadingContent) {
      staticContent.classList.add("hidden");
      loadingContent.classList.remove("hidden");
      if (loadingText) loadingText.textContent = msg;
      emptyState.classList.remove("hidden");
    }
  },

  hideCentralLoading() {
    const emptyState = document.getElementById("emptyState");
    const staticContent = document.getElementById("emptyStateStaticContent");
    const loadingContent = document.getElementById("emptyStateLoadingContent");

    if (emptyState && staticContent && loadingContent) {
      loadingContent.classList.add("hidden");
      staticContent.classList.remove("hidden");
      if (this.filteredKeys.length > 0) {
        emptyState.classList.add("hidden");
      }
    }
  },

  render() {
    const tbody = document.getElementById("tbody");
    const emptyState = document.getElementById("emptyState");

    this.hideCentralLoading();

    // Clear previous elements instantly
    tbody.innerHTML = "";

    if (this.filteredKeys.length === 0) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    // Initiate Non-blocking Asynchronous Chunked Stream Layout Processor
    let currentIndex = 0;
    const totalKeys = this.filteredKeys.length;
    const stored = this.getStoredState(CONFIG.LANGUAGE);
    const previousBase = stored.basePerKey || {};

    const renderNextChunk = () => {
      // Create a fast memory-isolated fragment container
      const fragment = document.createDocumentFragment();
      const endLimit = Math.min(currentIndex + this.renderChunkSize, totalKeys);

      for (let i = currentIndex; i < endLimit; i++) {
        const key = this.filteredKeys[i];
        const baseData = this.base[key];
        const trRaw = this.translated[key];
        const status = this.getStatus(key);

        const row = document.createElement("tr");
        row.className = status.class;
        row.id = `row-${key}`;

        const prevText = previousBase[key] ? previousBase[key].text : "";
        const hasChanged = prevText && prevText !== baseData.text;

        let badgeColorClass = 'bg-success/10 text-success border border-success/20';
        if (status.type === 'missing') badgeColorClass = 'bg-error/10 text-error border border-error/20';
        if (status.type === 'outdated' || status.type === 'placeholder-issue') badgeColorClass = 'bg-warning/10 text-warning border border-warning/20';

        const keyCellHTML = `
          <div class="font-mono text-xs break-all text-primary pr-2 font-semibold">
            ${this.escapeHTML(key)}
            <div class="mt-1.5"><span class="inline-block text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${badgeColorClass}">${status.badge}</span></div>
            ${hasChanged ? `<div class="text-[11px] text-warning font-semibold mt-1"><i class="fa-solid fa-triangle-exclamation"></i> Content Changed</div>` : ""}
          </div>
        `;

        if (baseData.quantities) {
          const trQuantities = this.isPluralValue(trRaw) ? trRaw.quantities : {};
          const allQuantities = this.PLURAL_ORDER.filter(q =>
            baseData.quantities[q] !== undefined || trQuantities[q] !== undefined
          );

          row.innerHTML = `
            <td class="p-4 align-top">${keyCellHTML}</td>
            <td class="p-4 align-top text-xs font-mono break-all whitespace-pre-wrap text-secondary leading-relaxed">
              ${allQuantities.map(q => `<div class="mb-1.5 p-1 bg-surface2 rounded border border-border/30"><code class="text-accent font-bold">${this.escapeHTML(q)}</code>: ${this.escapeHTML(baseData.quantities[q] !== undefined ? baseData.quantities[q] : baseData.quantities.other)}</div>`).join("")}
              ${hasChanged ? `<div class="text-xs text-warning mt-2 border-t border-border/30 pt-1">Previous: ${this.escapeHTML(prevText)}</div>` : ""}
            </td>
            <td class="p-4 align-top space-y-2.5">
              ${allQuantities.map(q => `
                <div class="flex items-center gap-2">
                  <span class="w-12 text-xs font-bold text-secondary uppercase font-mono">${this.escapeHTML(q)}</span>
                  <input
                    type="text"
                    data-key="${key}"
                    data-quantity="${q}"
                    data-idx="${i}"
                    value="${this.escapeHTML(trQuantities[q] || "")}"
                    onchange="app.onChange(this)"
                    oninput="app.onInput(this)"
                    onkeydown="app.onKeydown(event, this)"
                    onfocus="app.editingKey = '${key}'"
                    class="flex-1 p-2 border border-border rounded-lg text-sm bg-white dark:bg-black text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all shadow-sm">
                </div>
              `).join("")}
            </td>
          `;
        } else {
          const tr = typeof trRaw === "string" ? trRaw : "";
          row.innerHTML = `
            <td class="p-4 align-top">${keyCellHTML}</td>
            <td class="p-4 align-top text-xs font-mono break-all whitespace-pre-wrap text-secondary leading-relaxed">
              <div>${this.escapeHTML(baseData.text)}</div>
              ${hasChanged ? `<div class="text-xs text-warning mt-2 border-t border-border/30 pt-1">Previous: ${this.escapeHTML(prevText)}</div>` : ""}
            </td>
            <td class="p-4 align-top">
              <input 
                type="text" 
                data-key="${key}"
                data-idx="${i}"
                value="${this.escapeHTML(tr)}"
                onchange="app.onChange(this)"
                oninput="app.onInput(this)"
                onkeydown="app.onKeydown(event, this)"
                onfocus="app.editingKey = '${key}'"
                class="w-full p-2 border border-border rounded-lg text-sm bg-white dark:bg-black text-primary focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all shadow-sm"
                placeholder="Type translation here...">
            </td>
          `;
        }
        fragment.appendChild(row);
      }

      tbody.appendChild(fragment);
      currentIndex = endLimit;

      if (currentIndex < totalKeys) {
        // Enqueue next sequence frame non-blockingly inside the viewport schedule loop
        this.renderTimeout = requestAnimationFrame(renderNextChunk);
      }
    };

    // Trigger initial chunk push instantly
    renderNextChunk();
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
    // Evict this isolated key from statusCache to force a fresh lookup on runtime updates
    delete this.statusCache[key];
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
    if (row) {
      const status = this.getStatus(key);
      row.className = status.class;
    }
  },

  debouncedSave() {
    clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveState(CONFIG.LANGUAGE);
    }, CONFIG.DEBOUNCE_SAVE);
  },

  onKeydown(event, el) {
    const inputs = Array.from(document.querySelectorAll("#tbody input"));
    const currentIdx = inputs.indexOf(el);

    if (event.key === "Enter") {
      event.preventDefault();
      if (currentIdx < inputs.length - 1) inputs[currentIdx + 1].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (currentIdx > 0) inputs[currentIdx - 1].focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      if (currentIdx < inputs.length - 1) inputs[currentIdx + 1].focus();
    }
  },

  updateStats() {
    const keys = Object.keys(this.base);
    let missing = 0, outdated = 0;

    keys.forEach(key => {
      const status = this.getStatus(key);
      if (status.type === "missing") missing++;
      else if (status.type === "outdated") outdated++;
    });

    document.getElementById("statsTotal").textContent = `Total: ${keys.length}`;
    document.getElementById("statsMissing").textContent = `Missing: ${missing}`;
    document.getElementById("statsOutdated").textContent = `Outdated: ${outdated}`;
  },

  escapeHTML(str) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return str.replace(/[&<>"']/g, m => map[m]);
  },

  escapeXMLText(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "\\'").replace(/"/g, "&quot;");
  },

  escapeXMLAttr(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  },

  buildXML() {
    const lines = ['<?xml version="1.0" encoding="utf-8"?>', "<resources>"];

    Object.keys(this.base).forEach(key => {
      const trRaw = this.translated[key];
      const type = (this.types && this.types[key]) || "string";

      if (type === "plural") {
        const trQuantities = this.isPluralValue(trRaw) ? trRaw.quantities : {};
        const quantitiesToWrite = this.PLURAL_ORDER.filter(q => trQuantities[q]);
        if (quantitiesToWrite.length === 0) return;
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
      alert("No strings loaded to export.");
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
  if (translatorInitialized) return;
  translatorInitialized = true;
  app.init();
}

window.initTranslatorPage = initTranslatorPage;

if (window.APP_MODE === 'translator') {
  document.addEventListener("DOMContentLoaded", initTranslatorPage);
}