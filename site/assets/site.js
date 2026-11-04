/* Progressive enhancement only: all content/downloads work without JS. */
(() => {
  'use strict';
  const root = document.documentElement;
  const menu = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  const setMenu = (open) => {
    if (!menu || !nav) return;
    menu.setAttribute('aria-expanded', String(open));
    nav.dataset.open = String(open);
    menu.textContent = open ? menu.dataset.closeLabel : menu.dataset.openLabel;
  };
  if (menu && nav) {
    menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
    nav.addEventListener('click', (event) => {
      if (event.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menu.focus();
      }
    });
    window.matchMedia('(min-width: 801px)').addEventListener('change', (event) => {
      if (event.matches) setMenu(false);
    });
  }

  const tablist = document.querySelector('.story-controls');
  const tabs = Array.from(document.querySelectorAll('.story-tab'));
  const panels = Array.from(document.querySelectorAll('.story-panel'));
  if (tablist && tabs.length && panels.length === tabs.length) {
    tablist.setAttribute('role', 'tablist');
    const tabLayout = window.matchMedia('(max-width: 800px)');
    const setOrientation = () => tablist.setAttribute('aria-orientation', tabLayout.matches ? 'horizontal' : 'vertical');
    setOrientation();
    tabLayout.addEventListener('change', setOrientation);
    const activate = (index, focus = false) => {
      tabs.forEach((tab, current) => {
        const selected = current === index;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        panels[current].setAttribute('role', 'tabpanel');
        panels[current].hidden = !selected;
      });
      if (focus) tabs[index].focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => activate(index));
      tab.addEventListener('keydown', (event) => {
        let next;
        if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = (index + 1) % tabs.length;
        if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next !== undefined) {
          event.preventDefault();
          activate(next, true);
        }
      });
    });
    activate(0);
  }

  document.querySelectorAll('[data-language-link]').forEach((link) => {
    link.addEventListener('click', () => {
      // Keep a visitor's place when switching language. No cookies/storage.
      const destination = new URL(link.getAttribute('href'), window.location.href);
      destination.hash = window.location.hash;
      link.href = destination.href;
    });
  });
  root.classList.replace('no-js', 'js');
})();
