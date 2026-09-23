(function () {
  var grid = document.getElementById('category-grid');
  var prev = document.getElementById('cat-prev');
  var next = document.getElementById('cat-next');
  var tabs = grid ? grid.querySelectorAll('.category-link') : [];
  var panels = document.querySelectorAll('.category-panel');

  if (!grid || !prev || !next) return;

  function step() {
    var card = grid.querySelector('.category-link');
    if (!card) return 200;
    var styles = window.getComputedStyle(grid);
    var gap = parseFloat(styles.columnGap || styles.gap) || 10;
    return card.getBoundingClientRect().width + gap;
  }

  function updateArrows() {
    var max = grid.scrollWidth - grid.clientWidth;
    var x = grid.scrollLeft;
    prev.disabled = x <= 2;
    next.disabled = x >= max - 2;
  }

  function scrollByDir(dir) {
    grid.scrollBy({ left: dir * step(), behavior: 'smooth' });
  }

  function showCategory(name) {
    tabs.forEach(function (tab) {
      var active = tab.dataset.category === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    panels.forEach(function (panel) {
      var active = panel.dataset.panel === name;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
      if (active) {
        // Al entrar a una categoría, resetear subfiltro a "todas"
        var defaultSub = panel.querySelector('.subcat-btn[data-sub="todos"]');
        if (defaultSub) {
          setSubFilter(panel, 'todos');
        }
      }
    });

    var activeTab = grid.querySelector('[data-category="' + name + '"]');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }

    window.setTimeout(function () {
      window.dispatchEvent(new Event('resize'));
    }, 50);
  }

  function setSubFilter(panel, sub) {
    var buttons = panel.querySelectorAll('.subcat-btn');
    buttons.forEach(function (btn) {
      var on = btn.getAttribute('data-sub') === sub;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    panel.querySelectorAll('.menu-item[data-sub]').forEach(function (item) {
      var match = sub === 'todos' || item.getAttribute('data-sub') === sub;
      item.hidden = !match;
      item.classList.toggle('is-sub-hidden', !match);
    });

    var list = panel.querySelector('.menu-list');
    if (list) list.scrollLeft = 0;

    window.setTimeout(function () {
      window.dispatchEvent(new Event('resize'));
    }, 40);
  }

  document.querySelectorAll('.category-panel .subcat-bar').forEach(function (bar) {
    var panel = bar.closest('.category-panel');
    if (!panel) return;
    bar.querySelectorAll('.subcat-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setSubFilter(panel, btn.getAttribute('data-sub') || 'todos');
      });
    });
  });

  prev.addEventListener('click', function () {
    scrollByDir(-1);
  });
  next.addEventListener('click', function () {
    scrollByDir(1);
  });
  grid.addEventListener('scroll', updateArrows);
  window.addEventListener('resize', updateArrows);

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      showCategory(tab.dataset.category);
    });
  });

  updateArrows();

  function bindMenuScroll(scroll) {
    var list = scroll.querySelector('.menu-list');
    var prevBtn = scroll.querySelector('.menu-arrow-left');
    var nextBtn = scroll.querySelector('.menu-arrow-right');
    if (!list || !prevBtn || !nextBtn) return;

    function menuStep() {
      var card = list.querySelector('.menu-item');
      if (!card) return 180;
      var styles = window.getComputedStyle(list);
      var gap = parseFloat(styles.columnGap || styles.gap) || 12;
      return card.getBoundingClientRect().width + gap;
    }

    function updateMenuArrows() {
      var max = list.scrollWidth - list.clientWidth;
      var x = list.scrollLeft;
      var needsScroll = max > 4;
      prevBtn.disabled = !needsScroll || x <= 2;
      nextBtn.disabled = !needsScroll || x >= max - 2;
    }

    prevBtn.addEventListener('click', function () {
      list.scrollBy({ left: -menuStep(), behavior: 'smooth' });
    });
    nextBtn.addEventListener('click', function () {
      list.scrollBy({ left: menuStep(), behavior: 'smooth' });
    });
    list.addEventListener('scroll', updateMenuArrows);
    window.addEventListener('resize', updateMenuArrows);
    updateMenuArrows();
  }

  document.querySelectorAll('.menu-scroll').forEach(bindMenuScroll);
})();
