(function () {
  var grid = document.getElementById('mesas-grid');
  var statusEl = document.getElementById('clientes-status');
  var liveText = document.getElementById('clientes-live-text');
  var qrGrid = document.getElementById('qr-grid');
  var qrBase = document.getElementById('qr-base');
  var pagoModal = document.getElementById('pago-modal');
  var pagoBackdrop = document.getElementById('pago-modal-backdrop');
  var pagoMesaEl = document.getElementById('pago-modal-mesa');
  var pagoCancel = document.getElementById('pago-modal-cancel');
  var pagoConfirm = document.getElementById('pago-modal-confirm');
  var pagoMetodos = document.getElementById('pago-metodos');
  if (!grid || !statusEl) return;

  var mesaPendiente = null;
  var metodoElegido = 'efectivo';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function etiquetaEstado(estado) {
    if (estado === 'cuenta_solicitada') return 'Cuenta solicitada';
    if (estado === 'ocupada') return 'Ocupada';
    return 'Libre';
  }

  function openPagoModal(mesa) {
    mesaPendiente = mesa;
    metodoElegido = 'efectivo';
    if (pagoMesaEl) pagoMesaEl.textContent = mesa;
    if (pagoMetodos) {
      pagoMetodos.querySelectorAll('.pago-metodo').forEach(function (btn) {
        var activo = btn.dataset.metodo === metodoElegido;
        btn.classList.toggle('is-active', activo);
        btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
      });
    }
    if (!pagoModal) {
      reabrirMesa(mesa, metodoElegido);
      return;
    }
    pagoModal.hidden = false;
    document.body.classList.add('pago-modal-open');
    window.requestAnimationFrame(function () {
      pagoModal.classList.add('is-visible');
    });
  }

  function closePagoModal() {
    mesaPendiente = null;
    if (pagoConfirm) {
      pagoConfirm.disabled = false;
      pagoConfirm.textContent = 'Confirmar cobro';
    }
    if (!pagoModal) return;
    pagoModal.classList.remove('is-visible');
    document.body.classList.remove('pago-modal-open');
    window.setTimeout(function () {
      if (!document.body.classList.contains('pago-modal-open')) {
        pagoModal.hidden = true;
      }
    }, 250);
  }

  function loadQr() {
    if (!qrGrid) return;
    fetch('/api/local-url')
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error('Error');
          return data;
        });
      })
      .then(function (data) {
        if (qrBase) {
          qrBase.textContent =
            'URL de red: ' +
            data.baseUrl +
            (data.ip
              ? ' · Usa esta IP en la WiFi del restaurante.'
              : ' · No se detectó IP de red; revisa el WiFi.');
        }
        qrGrid.innerHTML = (data.mesas || [])
          .map(function (item) {
            var src =
              item.qrUrl +
              '?t=' +
              Date.now() +
              '&host=' +
              encodeURIComponent(data.baseUrl);
            return (
              '<article class="qr-card">' +
              '<h3>' +
              escapeHtml(item.mesa) +
              '</h3>' +
              '<img class="qr-img" src="' +
              escapeHtml(src) +
              '" alt="QR ' +
              escapeHtml(item.mesa) +
              '" width="240" height="240" />' +
              '<p class="qr-url">' +
              escapeHtml(item.menuUrl) +
              '</p>' +
              '<a class="qr-print" href="' +
              escapeHtml(src) +
              '" download="qr-' +
              escapeHtml(item.mesa) +
              '.png" target="_blank" rel="noopener">Descargar QR</a>' +
              '</article>'
            );
          })
          .join('');
      })
      .catch(function () {
        if (qrBase) {
          qrBase.textContent =
            'No se pudieron cargar los QR. Revisa que el servidor esté corriendo.';
        }
      });
  }

  function render(mesas) {
    if (!mesas.length) {
      statusEl.hidden = false;
      statusEl.textContent = 'No hay mesas configuradas.';
      grid.innerHTML = '';
      return;
    }

    statusEl.hidden = true;
    grid.innerHTML = mesas
      .map(function (mesa) {
        var puedeReabrir = mesa.estado === 'cuenta_solicitada';
        return (
          '<article class="mesa-card estado-' +
          escapeHtml(mesa.estado) +
          '">' +
          '<header class="mesa-card-head">' +
          '<h2>' +
          escapeHtml(mesa.mesa) +
          '</h2>' +
          '<span class="estado-badge mesa-estado-' +
          escapeHtml(mesa.estado) +
          '">' +
          etiquetaEstado(mesa.estado) +
          '</span>' +
          '</header>' +
          '<p class="mesa-meta">' +
          (mesa.pedidosAbiertos || 0) +
          (mesa.pedidosAbiertos === 1 ? ' pedido' : ' pedidos') +
          ' · Total $' +
          Number(mesa.total || 0) +
          '</p>' +
          (puedeReabrir
            ? '<button type="button" class="mesa-reabrir" data-mesa="' +
              escapeHtml(mesa.mesa) +
              '">Cobrar y reabrir</button>'
            : '<p class="mesa-hint">' +
              (mesa.estado === 'ocupada'
                ? 'Clientes ordenando o con cuenta abierta.'
                : 'Lista para nuevos clientes.') +
              '</p>') +
          '</article>'
        );
      })
      .join('');
  }

  function loadMesas() {
    if (liveText) liveText.textContent = 'Actualizando…';
    fetch('/api/mesas')
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error('Error');
          return data.mesas || [];
        });
      })
      .then(function (mesas) {
        render(mesas);
        if (liveText) liveText.textContent = 'En vivo';
      })
      .catch(function () {
        statusEl.hidden = false;
        statusEl.textContent =
          'No se pudieron cargar las mesas. Revisa el servidor.';
        if (liveText) liveText.textContent = 'Sin conexión';
      });
  }

  function reabrirMesa(mesa, metodoPago) {
    fetch('/api/mesas/' + encodeURIComponent(mesa) + '/reabrir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metodoPago: metodoPago }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo reabrir');
          return data;
        });
      })
      .then(function () {
        closePagoModal();
        loadMesas();
      })
      .catch(function (err) {
        statusEl.hidden = false;
        statusEl.textContent = err.message || 'No se pudo reabrir la mesa.';
        if (pagoConfirm) {
          pagoConfirm.disabled = false;
          pagoConfirm.textContent = 'Confirmar cobro';
        }
      });
  }

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('.mesa-reabrir');
    if (!btn) return;
    openPagoModal(btn.dataset.mesa);
  });

  if (pagoMetodos) {
    pagoMetodos.addEventListener('click', function (e) {
      var btn = e.target.closest('.pago-metodo');
      if (!btn) return;
      metodoElegido = btn.dataset.metodo;
      pagoMetodos.querySelectorAll('.pago-metodo').forEach(function (el) {
        var activo = el === btn;
        el.classList.toggle('is-active', activo);
        el.setAttribute('aria-pressed', activo ? 'true' : 'false');
      });
    });
  }

  if (pagoCancel) pagoCancel.addEventListener('click', closePagoModal);
  if (pagoBackdrop) pagoBackdrop.addEventListener('click', closePagoModal);
  if (pagoConfirm) {
    pagoConfirm.addEventListener('click', function () {
      if (!mesaPendiente) return;
      pagoConfirm.disabled = true;
      pagoConfirm.textContent = 'Guardando…';
      reabrirMesa(mesaPendiente, metodoElegido);
    });
  }

  loadQr();
  loadMesas();
  window.setInterval(loadMesas, 3000);
})();
