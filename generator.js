/* Languages are provided by langs.js as window.LANGUAGES.
   Keep an alias so the rest of this file doesn't need to change. */
const LANGUAGES = window.LANGUAGES || [];

let selectedLanguage = null;
let generatorInitialized = false;

function initLanguageOptions() {
  const container = document.getElementById('languageOptions');
  if (!container || container.childElementCount > 0) {
    return;
  }

  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-label', 'Target language selection');

  LANGUAGES.forEach(lang => {
    const btn = document.createElement('div');
    btn.className = 'lang-option p-2.5 border border-border rounded-lg bg-white dark:bg-black text-primary cursor-pointer text-center text-sm font-medium transition-all duration-150 hover:border-accent hover:bg-accent/5';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-checked', 'false');

    // Show the native name with the code as a small subscript so
    // translators can recognise their language instantly.
    const native = lang.nativeName || lang.name;
    const code = lang.code.toUpperCase();
    btn.innerHTML = `
      <div class="leading-tight">${escapeHTML(native)}</div>
      <div class="text-[10px] font-mono text-secondary mt-0.5">${code}${lang.rtl ? ' · RTL' : ''}</div>
    `;
    btn.title = `${lang.name} (${lang.code})${lang.rtl ? ' — Right-to-left' : ''}`;
    btn.dataset.code = lang.code;
    btn.dataset.name = `${lang.name} (${native})`;

    const onActivate = () => selectLanguage(lang.code, btn.dataset.name, btn);
    btn.onclick = onActivate;
    btn.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
      }
    });

    container.appendChild(btn);
  });
}

function escapeHTML(str) {
  const map = {
    '&': '\u0026',
    '<': '\u003c',
    '>': '\u003e',
    '"': '\u0022',
    "'": '\u0027'
  };
  return String(str).replace(/[&<>"']/g, m => map[m]);
}

function selectLanguage(code, name, element) {
  document.querySelectorAll('#languageOptions .lang-option').forEach(opt => {
    opt.classList.remove('bg-accent', 'text-black', 'border-accent');
    opt.classList.add('bg-white', 'dark:bg-black', 'text-primary', 'border-border');
  });
  element.classList.remove('bg-white', 'dark:bg-black', 'text-primary', 'border-border');
  element.classList.add('bg-accent', 'text-black', 'border-accent');
  
  selectedLanguage = { code, name };
  document.getElementById('selectedLangHelp').style.display = 'block';
  document.getElementById('selectedLangName').textContent = name;
}

function convertGitHubLinkToRaw(url) {
  return url.replace(
    /https:\/\/github\.com\/([^\/]+)\/([^\/]+)\/blob\/(.+)/,
    'https://raw.githubusercontent.com/$1/$2/$3'
  );
}

function guessTargetUrl(sourceUrl, langCode) {
  return sourceUrl.replace('/values/strings.xml', `/values-${langCode}/strings.xml`);
}

function validateUrl(urlString) {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

function showError(message) {
  const errorEl = document.getElementById('errorMessage');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  errorEl.classList.add('block');
  document.getElementById('successMessage').classList.remove('block');
  document.getElementById('successMessage').classList.add('hidden');
}

function showSuccess() {
  document.getElementById('errorMessage').classList.remove('block');
  document.getElementById('errorMessage').classList.add('hidden');
  document.getElementById('successMessage').classList.remove('hidden');
  document.getElementById('successMessage').classList.add('block');
}

function generateTranslatorUrl(sourceUrl, langCode) {
  const baseUrl = window.location.origin + window.location.pathname;
  const targetUrl = guessTargetUrl(sourceUrl, langCode);

  const params = new URLSearchParams({
    mode: 'translator',
    source: sourceUrl,
    target: targetUrl,
    lang: langCode,
  });

  return `${baseUrl}?${params.toString()}`;
}

function legacyCopyToClipboard(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '2em';
  textarea.style.height = '2em';
  textarea.style.padding = '0';
  textarea.style.border = 'none';
  textarea.style.outline = 'none';
  textarea.style.boxShadow = 'none';
  textarea.style.background = 'transparent';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let succeeded = false;
  try {
    succeeded = document.execCommand('copy');
  } catch {
    succeeded = false;
  }

  document.body.removeChild(textarea);
  return succeeded;
}

function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => {
      if (!legacyCopyToClipboard(text)) {
        throw new Error('Copy failed');
      }
    });
  }
  return legacyCopyToClipboard(text)
    ? Promise.resolve()
    : Promise.reject(new Error('Copy failed'));
}

function copyToClipboard(event) {
  const url = document.getElementById('generatedUrl').textContent;
  const btn = event.currentTarget;
  copyTextToClipboard(url).then(() => {
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 2000);
  }).catch(() => {
    alert('Failed to copy. Please copy manually.');
  });
}

function openTranslator() {
  const url = document.getElementById('generatedUrl').textContent;
  window.open(url, '_blank');
}

document.getElementById('generatorForm').addEventListener('submit', (e) => {
  e.preventDefault();

  let sourceUrl = document.getElementById('sourceUrl').value.trim();

  if (!sourceUrl) {
    showError('Please enter a source URL');
    return;
  }

  sourceUrl = convertGitHubLinkToRaw(sourceUrl);

  if (!validateUrl(sourceUrl)) {
    showError('Invalid source URL. Please check the format.');
    return;
  }

  if (!sourceUrl.includes('/values/strings.xml')) {
    showError('Source URL must end with "/values/strings.xml"');
    return;
  }

  const effectiveLanguage = selectedLanguage || LANGUAGES[0];
  if (!effectiveLanguage) {
    showError('Please select a target language');
    return;
  }

  try {
    const translatorUrl = generateTranslatorUrl(sourceUrl, effectiveLanguage.code);

    document.getElementById('generatedUrl').textContent = translatorUrl;
    document.getElementById('outputSection').classList.remove('hidden');
    document.getElementById('outputSection').classList.add('block');
    showSuccess();
  } catch (err) {
    showError('Error generating URL: ' + err.message);
  }
});

function initGeneratorPage() {
  if (generatorInitialized) return;
  generatorInitialized = true;
  initLanguageOptions();

  const defaultLang = LANGUAGES[0];
  if (defaultLang && !selectedLanguage) {
    const defaultOption = document.querySelector(`#languageOptions .lang-option[data-code="${defaultLang.code}"]`);
    if (defaultOption) {
      selectLanguage(defaultLang.code, defaultLang.name, defaultOption);
    } else {
      selectedLanguage = defaultLang;
    }
  }
}

window.initGeneratorPage = initGeneratorPage;

if (window.APP_MODE === 'generator') {
  document.addEventListener('DOMContentLoaded', initGeneratorPage);
}