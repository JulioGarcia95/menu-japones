(function () {
  var mesaEl = document.getElementById('staff-menu-mesa');
  var mesa =
    (window.MatildaMesa && window.MatildaMesa.get && window.MatildaMesa.get()) ||
    'Mesa01';
  if (mesaEl) mesaEl.textContent = mesa;
})();
