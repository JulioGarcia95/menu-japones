(function () {
  var fechaEl = document.getElementById('admin-fecha');
  var statusEl = document.getElementById('admin-status');
  var sheet = document.getElementById('admin-sheet');
  var body = document.getElementById('admin-body');
  var totalEl = document.getElementById('admin-total');
  var metaEl = document.getElementById('admin-meta');
  if (!fechaEl || !statusEl || !body) return;

  function hoyLocal() {
    try {
      return new Date().toLocaleDateString('en-CA', {
        timeZone: 'America/Mexico_City',
      });
    } catch (e) {
      var d = new Date();
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }
  }

  function formatMoney(n) {
    return '$' + Number(n || 0);
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('es-MX', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch (e) {
      return iso;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function textoPedidos(cuenta) {
    var pedidos = cuenta.pedidos || [];
    if (!pedidos.length) return '—';
    return pedidos
      .map(function (pedido, i) {
        var items = (pedido.items || [])
          .map(function (item) {
            return item.qty + '× ' + item.name;
          })
          .join(', ');
        return (
          'Pedido ' +
          (i + 1) +
          ': ' +
          (items || 'Sin ítems') +
          ' (' +
          formatMoney(pedido.total) +
          ')'
        );
      })
      .join('\n');
  }

  function textoMetodo(cuenta) {
    var base = cuenta.metodoPagoLabel || cuenta.metodoPago || '—';
    var tip = Number(cuenta.tipAmount) || 0;
    if (tip > 0) {
      return base + ' · Propina ' + formatMoney(tip);
    }
    return base;
  }

  function loadDia() {
    var fecha = fechaEl.value || hoyLocal();
    statusEl.hidden = false;
    statusEl.textContent = 'Cargando…';
    if (sheet) sheet.hidden = true;
    body.innerHTML = '';

    fetch('/api/admin/cuentas?fecha=' + encodeURIComponent(fecha), {
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (res.status === 401) {
            throw new Error('Sesión expirada. Vuelve a entrar con el PIN de admin.');
          }
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'Error al cargar');
          }
          return data;
        });
      })
      .then(function (data) {
        var cuentas = data.cuentas || [];
        if (!cuentas.length) {
          statusEl.textContent =
            'No hay cuentas finalizadas el ' +
            (data.fecha || fecha) +
            '. Si cobraste hoy y no aparece, puede ser que un deploy de Render borró el historial (disco efímero).';
          if (totalEl) totalEl.textContent = '$0';
          if (metaEl) metaEl.textContent = '';
          return;
        }

        statusEl.hidden = true;
        if (sheet) sheet.hidden = false;

        cuentas.forEach(function (cuenta) {
          var tip = Number(cuenta.tipAmount) || 0;
          var totalMostrar =
            tip > 0 && Number(cuenta.paidAmount) > 0
              ? Number(cuenta.paidAmount)
              : Number(cuenta.total) || 0;
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' +
            escapeHtml(formatTime(cuenta.closedAt || cuenta.createdAt)) +
            '</td>' +
            '<td>' +
            escapeHtml(cuenta.cliente || cuenta.mesa || '—') +
            '</td>' +
            '<td class="admin-pedidos">' +
            escapeHtml(textoPedidos(cuenta)).replace(/\n/g, '<br>') +
            '</td>' +
            '<td class="col-num">' +
            formatMoney(totalMostrar) +
            (tip > 0
              ? '<br><span class="admin-tip">cuenta ' +
                formatMoney(cuenta.total) +
                '</span>'
              : '') +
            '</td>' +
            '<td>' +
            escapeHtml(textoMetodo(cuenta)) +
            '</td>';
          body.appendChild(tr);
        });

        if (totalEl) totalEl.textContent = formatMoney(data.totalDia);
        if (metaEl) {
          var extra = '';
          if (Number(data.totalPropinas) > 0) {
            extra =
              ' · Propinas ' +
              formatMoney(data.totalPropinas) +
              ' · Cuentas ' +
              formatMoney(data.totalCuentas);
          }
          metaEl.textContent =
            cuentas.length +
            (cuentas.length === 1 ? ' cuenta' : ' cuentas') +
            ' · Total del día ' +
            formatMoney(data.totalDia) +
            extra;
        }
      })
      .catch(function (err) {
        statusEl.hidden = false;
        statusEl.textContent =
          (err && err.message) ||
          'No se pudo cargar el historial. Revisa que el servidor esté corriendo.';
        if (sheet) sheet.hidden = true;
      });
  }

  fechaEl.value = hoyLocal();
  fechaEl.addEventListener('change', loadDia);
  loadDia();
})();
