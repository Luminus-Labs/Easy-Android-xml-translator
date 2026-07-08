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
    btn.className = 'lang-option';
    btn.textContent = lang.code.toUpperCase();
    btn.dataset.code = lang.code;
    btn.dataset.name = lang.name;
    btn.onclick = () => selectLanguage(lang.code, lang.name, btn);
    container.appendChild(btn);
  });
}

function selectLanguage(code, name, element) {
  document.querySelectorAll('.lang-option').forEach(opt => {
  if (generatorInitialized) {
    return;
  }

  generatorInitialized = true;
    opt.classList.remove('selected');
  });
  element.classList.add('selected');
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
  errorEl.classList.add('show');
  document.getElementById('successMessage').classList.remove('show');
}

function showSuccess() {
  document.getElementById('errorMessage').classList.remove('show');
  document.getElementById('successMessage').classList.add('show');
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

function copyToClipboard(event) {
  const url = document.getElementById('generatedUrl').textContent;
  navigator.clipboard.writeText(url).then(() => {
    const btn = event.currentTarget;
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
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
    document.getElementById('outputSection').classList.add('show');
    showSuccess();
  } catch (err) {
    showError('Error generating URL: ' + err.message);
  }
});

function initGeneratorPage() {
  initLanguageOptions();
}

window.initGeneratorPage = initGeneratorPage;

if (window.APP_MODE === 'generator') {
  document.addEventListener('DOMContentLoaded', initGeneratorPage);
}