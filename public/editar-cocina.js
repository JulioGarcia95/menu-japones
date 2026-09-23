(function () {
  var listEl = document.getElementById('editar-menu-list');
  var statusEl = document.getElementById('editar-menu-status');
  if (!listEl) return;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function groupByCategory(items) {
    var order = [];
    var map = {};
    (items || []).forEach(function (item) {
      var cat = item.category || 'Otros';
      if (!map[cat]) {
        map[cat] = [];
        order.push(cat);
      }
      map[cat].push(item);
    });
    return { order: order, map: map };
  }

  function render(items) {
    var grouped = groupByCategory(items);
    if (!grouped.order.length) {
      listEl.innerHTML =
        '<p class="editar-menu-empty">No hay platillos en el catálogo.</p>';
      return;
    }

    listEl.innerHTML = grouped.order
      .map(function (cat) {
        var rows = grouped.map[cat]
          .map(function (item) {
            return (
              '<li class="editar-menu-row' +
              (item.enabled ? '' : ' is-off') +
              '" data-id="' +
              escapeHtml(item.id) +
              '">' +
              '<div class="editar-menu-copy">' +
              '<p class="editar-menu-name">' +
              escapeHtml(item.name) +
              '</p>' +
              '<p class="editar-menu-meta">$' +
              Number(item.price || 0) +
              '</p>' +
              '</div>' +
              '<label class="editar-menu-toggle">' +
              '<input type="checkbox" data-toggle="' +
              escapeHtml(item.id) +
              '"' +
              (item.enabled ? ' checked' : '') +
              ' />' +
              '<span class="editar-menu-toggle-ui" aria-hidden="true"></span>' +
              '<span class="editar-menu-toggle-label">' +
              (item.enabled ? 'Activo' : 'Apagado') +
              '</span>' +
              '</label>' +
              '</li>'
            );
          })
          .join('');

        return (
          '<section class="editar-menu-section">' +
          '<h2 class="editar-menu-cat">' +
          escapeHtml(cat) +
          '</h2>' +
          '<ul class="editar-menu-items">' +
          rows +
          '</ul>' +
          '</section>'
        );
      })
      .join('');
  }

  function load() {
    setStatus('Cargando…');
    fetch('/api/menu', { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error('No se pudo cargar el menú');
          return data.items || [];
        });
      })
      .then(function (items) {
        render(items);
        setStatus('');
      })
      .catch(function () {
        listEl.innerHTML = '';
        setStatus('No se pudo cargar el menú.');
      });
  }

  function setToggleLabel(row, enabled) {
    if (!row) return;
    row.classList.toggle('is-off', !enabled);
    var label = row.querySelector('.editar-menu-toggle-label');
    if (label) label.textContent = enabled ? 'Activo' : 'Apagado';
  }

  listEl.addEventListener('change', function (e) {
    var input = e.target.closest('input[data-toggle]');
    if (!input) return;

    var id = input.getAttribute('data-toggle');
    var enabled = Boolean(input.checked);
    var row = input.closest('.editar-menu-row');
    input.disabled = true;
    setToggleLabel(row, enabled);
    setStatus(enabled ? 'Activando…' : 'Desactivando…');

    fetch('/api/menu/' + encodeURIComponent(id), {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: enabled }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) {
            throw new Error((data && data.error) || 'No se pudo guardar');
          }
          return data.item;
        });
      })
      .then(function (item) {
        setToggleLabel(row, item.enabled);
        input.checked = item.enabled;
        setStatus(
          item.enabled
            ? item.name + ' activo en el menú'
            : item.name + ' fuera del menú'
        );
      })
      .catch(function (err) {
        input.checked = !enabled;
        setToggleLabel(row, !enabled);
        setStatus(err.message || 'Error al guardar');
      })
      .finally(function () {
        input.disabled = false;
      });
  });

  load();
})();
