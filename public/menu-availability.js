(function () {
  function apply(disabledMap) {
    document.querySelectorAll('.btn-add[data-id]').forEach(function (btn) {
      var id = btn.getAttribute('data-id');
      var off = Boolean(disabledMap[id]);
      var wrap = btn.closest('.menu-item, li') || btn;
      if (off) {
        wrap.hidden = true;
        wrap.setAttribute('data-menu-off', '1');
        btn.disabled = true;
      } else {
        wrap.hidden = false;
        wrap.removeAttribute('data-menu-off');
        btn.disabled = false;
      }
    });

    document.querySelectorAll('.staff-subhead').forEach(function (head) {
      var next = head.nextElementSibling;
      if (!next || !next.classList.contains('staff-list')) return;
      var visibles = next.querySelectorAll('li:not([hidden])');
      head.hidden = visibles.length === 0;
      next.hidden = visibles.length === 0;
    });
  }

  fetch('/api/menu')
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data.ok) throw new Error('menu');
        return data.items || [];
      });
    })
    .then(function (items) {
      var disabled = {};
      items.forEach(function (item) {
        if (!item.enabled) disabled[item.id] = true;
      });
      apply(disabled);

      try {
        var mesa =
          (window.MatildaMesa &&
            window.MatildaMesa.get &&
            window.MatildaMesa.get()) ||
          'Mesa01';
        var key = 'matilda-cart-' + mesa;
        var raw = localStorage.getItem(key);
        if (!raw) return;
        var cart = JSON.parse(raw);
        if (!cart || typeof cart !== 'object') return;
        var changed = false;
        Object.keys(cart).forEach(function (id) {
          if (disabled[id]) {
            delete cart[id];
            changed = true;
          }
        });
        if (changed) {
          localStorage.setItem(key, JSON.stringify(cart));
          document.dispatchEvent(new CustomEvent('menu-disponibilidad'));
        }
      } catch (e) {}
    })
    .catch(function () {});
})();
