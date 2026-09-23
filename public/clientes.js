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
  var pedidosModal = document.getElementById('mesa-pedidos-modal');
  var pedidosBackdrop = document.getElementById('mesa-pedidos-backdrop');
  var pedidosClose = document.getElementById('mesa-pedidos-close');
  var pedidosMesaEl = document.getElementById('mesa-pedidos-mesa');
  var pedidosStatus = document.getElementById('mesa-pedidos-status');
  var pedidosList = document.getElementById('mesa-pedidos-list');
  if (!grid || !statusEl) return;

  var mesaPendiente = null;
  var metodoElegido = 'efectivo';
  var mesaPedidosActual = null;

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

  function etiquetaPedido(status) {
    var s = String(status || 'pendiente').toLowerCase();
    if (s === 'listo') s = 'entregado';
    if (s === 'en_proceso') return 'En cocina';
    if (s === 'entregado') return 'Entregado';
    return 'Recibido';
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    } catch (e) {
      return iso || '';
    }
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

  function openPedidosModal(mesa) {
    mesaPedidosActual = mesa;
    if (pedidosMesaEl) pedidosMesaEl.textContent = mesa;
    if (pedidosStatus) pedidosStatus.textContent = 'Cargando pedidos…';
    if (pedidosList) pedidosList.innerHTML = '';
    if (!pedidosModal) return;
    pedidosModal.hidden = false;
    document.body.classList.add('mesa-pedidos-open');
    window.requestAnimationFrame(function () {
      pedidosModal.classList.add('is-visible');
    });
    loadPedidosMesa(mesa);
  }

  function closePedidosModal() {
    mesaPedidosActual = null;
    if (!pedidosModal) return;
    pedidosModal.classList.remove('is-visible');
    document.body.classList.remove('mesa-pedidos-open');
    window.setTimeout(function () {
      if (!document.body.classList.contains('mesa-pedidos-open')) {
        pedidosModal.hidden = true;
      }
    }, 250);
  }

  function loadPedidosMesa(mesa) {
    fetch('/api/pedidos', { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error('No se pudieron cargar');
          return data.pedidos || [];
        });
      })
      .then(function (pedidos) {
        var deMesa = (pedidos || []).filter(function (p) {
          return p.mesa === mesa && !p.paid;
        });
        if (!deMesa.length) {
          if (pedidosStatus) {
            pedidosStatus.textContent =
              'No hay pedidos abiertos en ' + mesa + '.';
          }
          if (pedidosList) pedidosList.innerHTML = '';
          return;
        }
        if (pedidosStatus) {
          pedidosStatus.textContent =
            deMesa.length +
            (deMesa.length === 1 ? ' pedido abierto' : ' pedidos abiertos');
        }
        if (!pedidosList) return;
        pedidosList.innerHTML = deMesa
          .map(function (p) {
            var status = String(p.status || 'pendiente').toLowerCase();
            if (status === 'listo') status = 'entregado';
            var items = (p.items || [])
              .map(function (it) {
                return it.qty + '× ' + it.name;
              })
              .join(', ');
            var canCancel = status === 'pendiente' || status === 'en_proceso';
            var porStaff = p.createdBy === 'staff';
            return (
              '<li class="mesa-pedido-item">' +
              '<div class="mesa-pedido-copy">' +
              '<p class="mesa-pedido-meta">' +
              escapeHtml(formatTime(p.createdAt)) +
              (porStaff
                ? ' · <span class="staff-tag">staff</span>'
                : '') +
              ' · <span class="estado-badge estado-' +
              escapeHtml(status) +
              '">' +
              etiquetaPedido(status) +
              '</span></p>' +
              '<p class="mesa-pedido-items">' +
              escapeHtml(items) +
              '</p>' +
              '<p class="mesa-pedido-total">$' +
              Number(p.total || 0) +
              '</p>' +
              '</div>' +
              (canCancel
                ? '<button type="button" class="mesa-pedido-cancel" data-id="' +
                  escapeHtml(p.id) +
                  '">Cancelar</button>'
                : '') +
              '</li>'
            );
          })
          .join('');
      })
      .catch(function () {
        if (pedidosStatus) {
          pedidosStatus.textContent = 'No se pudieron cargar los pedidos.';
        }
      });
  }

  function cancelarPedido(id) {
    if (!id) return;
    if (
      !window.confirm(
        '¿Cancelar este pedido? Se quitará de cocina y de la cuenta de la mesa.'
      )
    ) {
      return;
    }
    fetch('/api/pedidos/' + encodeURIComponent(id), {
      method: 'DELETE',
      credentials: 'same-origin',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) {
            throw new Error(data.error || 'No se pudo cancelar');
          }
          return data;
        });
      })
      .then(function () {
        if (mesaPedidosActual) loadPedidosMesa(mesaPedidosActual);
        loadMesas();
      })
      .catch(function (err) {
        window.alert(err.message || 'No se pudo cancelar el pedido');
      });
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
        var menuStaff =
          '/staff-menu.html?mesa=' +
          encodeURIComponent(mesa.mesa) +
          '&staff=1';
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
          '<div class="mesa-actions">' +
          '<a class="mesa-action mesa-action-primary" href="' +
          escapeHtml(menuStaff) +
          '" target="_blank" rel="noopener">Ordenar comida</a>' +
          '<button type="button" class="mesa-action" data-action="historial" data-mesa="' +
          escapeHtml(mesa.mesa) +
          '">Ver / cancelar pedidos</button>' +
          (puedeReabrir
            ? '<button type="button" class="mesa-reabrir" data-mesa="' +
              escapeHtml(mesa.mesa) +
              '">Cobrar y reabrir</button>'
            : '<p class="mesa-hint">' +
              (mesa.estado === 'ocupada'
                ? 'Clientes ordenando o con cuenta abierta.'
                : 'Lista para nuevos clientes.') +
              '</p>') +
          '</div>' +
          '</article>'
        );
      })
      .join('');
  }

  function loadMesas() {
    if (liveText) liveText.textContent = 'Actualizando…';
    fetch('/api/mesas', { credentials: 'same-origin' })
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
      credentials: 'same-origin',
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
    var reabrir = e.target.closest('.mesa-reabrir');
    if (reabrir) {
      openPagoModal(reabrir.dataset.mesa);
      return;
    }
    var hist = e.target.closest('[data-action="historial"]');
    if (hist) {
      openPedidosModal(hist.dataset.mesa);
    }
  });

  if (pedidosList) {
    pedidosList.addEventListener('click', function (e) {
      var btn = e.target.closest('.mesa-pedido-cancel');
      if (!btn) return;
      cancelarPedido(btn.dataset.id);
    });
  }

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
  if (pedidosClose) pedidosClose.addEventListener('click', closePedidosModal);
  if (pedidosBackdrop) pedidosBackdrop.addEventListener('click', closePedidosModal);

  loadQr();
  loadMesas();
  window.setInterval(loadMesas, 3000);
})();
