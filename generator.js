const LANGUAGES = [
  { code: 'fr', name: 'French (fr)' },
  { code: 'es', name: 'Spanish (es)' },
  { code: 'de', name: 'German (de)' },
  { code: 'it', name: 'Italian (it)' },
  { code: 'pt', name: 'Portuguese (pt)' },
  { code: 'ja', name: 'Japanese (ja)' },
  { code: 'zh', name: 'Chinese (zh)' },
  { code: 'ru', name: 'Russian (ru)' },
  { code: 'ar', name: 'Arabic (ar)' },
  { code: 'ko', name: 'Korean (ko)' },
  { code: 'nl', name: 'Dutch (nl)' },
  { code: 'tr', name: 'Turkish (tr)' },
  { code: 'pl', name: 'Polish (pl)' },
  { code: 'hi', name: 'Hindi (hi)' },
  { code: 'id', name: 'Indonesian (id)' },
];

let selectedLanguage = null;
let generatorInitialized = false;

function initLanguageOptions() {
  const container = document.getElementById('languageOptions');
  if (!container || container.childElementCount > 0) {
    return;
  }

  LANGUAGES.forEach(lang => {
    const btn = document.createElement('div');
    // Applied Tailwind styling directly to dynamic DOM creation blocks
    btn.className = 'lang-option p-2.5 border border-border rounded-lg bg-white dark:bg-black text-primary cursor-pointer text-center text-sm font-medium transition-all duration-150 hover:border-accent hover:bg-accent/5';
    btn.textContent = lang.code.toUpperCase();
    btn.dataset.code = lang.code;
    btn.dataset.name = lang.name;
    btn.onclick = () => selectLanguage(lang.code, lang.name, btn);
    container.appendChild(btn);
  });
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

  if (!selectedLanguage) {
    showError('Please select a target language');
    return;
  }

  try {
    const translatorUrl = generateTranslatorUrl(sourceUrl, selectedLanguage.code);

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
}

window.initGeneratorPage = initGeneratorPage;

if (window.APP_MODE === 'generator') {
  document.addEventListener('DOMContentLoaded', initGeneratorPage);
}