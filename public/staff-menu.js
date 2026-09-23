(function () {
  var mesaEl = document.getElementById('staff-menu-mesa');
  var cats = document.getElementById('staff-menu-cats');
  if (!cats) return;

  var mesa =
    (window.MatildaMesa && window.MatildaMesa.get && window.MatildaMesa.get()) ||
    'Mesa01';
  if (mesaEl) mesaEl.textContent = mesa;

  var buttons = cats.querySelectorAll('.staff-cat');
  var panels = document.querySelectorAll('.staff-panel');

  function show(cat) {
    buttons.forEach(function (btn) {
      var on = btn.getAttribute('data-cat') === cat;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    panels.forEach(function (panel) {
      var on = panel.getAttribute('data-panel') === cat;
      panel.classList.toggle('is-active', on);
      panel.hidden = !on;
    });
  }

  cats.addEventListener('click', function (e) {
    var btn = e.target.closest('.staff-cat');
    if (!btn) return;
    show(btn.getAttribute('data-cat'));
  });
})();
