function getPreferredTheme() {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const root = document.documentElement;
  const button = document.querySelector('.theme-toggle-btn');

  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
    if (button) {
      button.innerHTML = '<i class="fa-solid fa-sun" aria-hidden="true"></i>';
    }
  } else {
    root.removeAttribute('data-theme');
    if (button) {
      button.innerHTML = '<i class="fa-solid fa-moon" aria-hidden="true"></i>';
    }
  }
}

function toggleTheme() {
  const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', nextTheme);
  applyTheme(nextTheme);
}

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(getPreferredTheme());
  const button = document.querySelector('.theme-toggle-btn');
  if (button) {
    button.addEventListener('click', toggleTheme);
  }
});