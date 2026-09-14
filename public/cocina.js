(function () {
  var grid = document.getElementById('cocina-grid');
  var statusEl = document.getElementById('cocina-status');
  var countEl = document.getElementById('cocina-count');
  var liveText = document.getElementById('cocina-live-text');
  var knownIds = {};
  var firstLoad = true;
  var audioCtx = null;
  var soundReady = false;
  var soundBtn = document.getElementById('cocina-sound-btn');

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
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

  function estadoDe(pedido) {
    var s = String(pedido.status || 'pendiente').toLowerCase();
    if (s === 'listo') return 'entregado';
    return s;
  }

  function etiquetaEstado(status) {
    if (status === 'en_proceso') return 'En proceso';
    if (status === 'entregado') return 'Entregado';
    return 'Pendiente';
  }

  function getAudioCtx() {
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx();
    return audioCtx;
  }

  function unlockAudio() {
    var ctx = getAudioCtx();
    if (!ctx) return Promise.resolve(false);
    return ctx.resume().then(function () {
      soundReady = ctx.state === 'running';
      if (soundBtn) {
        soundBtn.textContent = soundReady ? 'Sonido listo ✓' : 'Probar sonido';
        soundBtn.classList.toggle('is-ready', soundReady);
      }
      return soundReady;
    }).catch(function () {
      return false;
    });
  }

  function beep() {
    unlockAudio().then(function (ok) {
      if (!ok) return;
      try {
        var ctx = getAudioCtx();
        if (!ctx) return;
        var now = ctx.currentTime;

        // Ding-dong suave y bonito (2 notas lentas)
        function notaBonita(start, freq, dur, vol) {
          var osc = ctx.createOscillator();
          var harm = ctx.createOscillator();
          var gain = ctx.createGain();
          var harmGain = ctx.createGain();

          osc.type = 'sine';
          harm.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          harm.frequency.setValueAtTime(freq * 2, start);
          harmGain.gain.value = 0.18;

          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.linearRampToValueAtTime(vol, start + 0.1);
          gain.gain.linearRampToValueAtTime(vol * 0.4, start + dur * 0.55);
          gain.gain.linearRampToValueAtTime(0.0001, start + dur);

          harm.connect(harmGain);
          harmGain.connect(gain);
          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(start);
          harm.start(start);
          osc.stop(start + dur + 0.02);
          harm.stop(start + dur + 0.02);
        }

        notaBonita(now, 587.33, 0.85, 0.15); // D5
        notaBonita(now + 0.32, 440.0, 1.45, 0.13); // A4 (más cerca y más larga)

        if (navigator.vibrate) {
          navigator.vibrate([80, 60, 100]);
        }
      } catch (e) {}
    });
  }

  function botonAccion(pedido) {
    var status = estadoDe(pedido);
    if (status === 'pendiente') {
      return (
        '<button type="button" class="cocina-action cocina-confirm" data-id="' +
        escapeHtml(pedido.id) +
        '" data-status="en_proceso">Confirmar pedido</button>'
      );
    }
    return (
      '<button type="button" class="cocina-action cocina-deliver" data-id="' +
      escapeHtml(pedido.id) +
      '" data-status="entregado">Entregado</button>'
    );
  }

  function render(pedidos) {
    var activos = pedidos.filter(function (p) {
      var s = estadoDe(p);
      return s === 'pendiente' || s === 'en_proceso';
    });

    if (countEl) {
      countEl.textContent =
        activos.length + (activos.length === 1 ? ' activo' : ' activos');
    }

    if (!activos.length) {
      statusEl.hidden = false;
      statusEl.textContent = 'No hay pedidos activos. Esperando…';
      grid.innerHTML = '';
      return;
    }

    statusEl.hidden = true;
    statusEl.textContent = '';

    var html = activos
      .map(function (pedido) {
        var status = estadoDe(pedido);
        var items = (pedido.items || [])
          .map(function (item) {
            return (
              '<li><strong>' +
              escapeHtml(String(item.qty)) +
              '×</strong> ' +
              escapeHtml(item.name) +
              '</li>'
            );
          })
          .join('');

        var isNew = !knownIds[pedido.id];
        return (
          '<article class="cocina-card status-' +
          status +
          (isNew && !firstLoad ? ' is-new' : '') +
          '" data-id="' +
          escapeHtml(pedido.id) +
          '">' +
          '<header class="cocina-card-head">' +
          '<p class="cocina-mesa">' +
          escapeHtml(pedido.mesa || 'Sin mesa') +
          '</p>' +
          '<span class="estado-badge estado-' +
          status +
          '">' +
          etiquetaEstado(status) +
          '</span>' +
          '</header>' +
          '<p class="cocina-hora">' +
          escapeHtml(formatTime(pedido.createdAt)) +
          '</p>' +
          '<ul class="cocina-items">' +
          items +
          '</ul>' +
          '<footer class="cocina-card-foot">' +
          '<span class="cocina-total">$' +
          Number(pedido.total || 0) +
          '</span>' +
          botonAccion(pedido) +
          '</footer>' +
          '</article>'
        );
      })
      .join('');

    grid.innerHTML = html;

    var huboNuevo = false;
    activos.forEach(function (pedido) {
      if (!knownIds[pedido.id] && !firstLoad) huboNuevo = true;
      knownIds[pedido.id] = true;
    });
    if (huboNuevo) beep();
    firstLoad = false;
  }

  function loadPedidos() {
    if (liveText) liveText.textContent = 'Actualizando…';

    fetch('/api/pedidos?estado=activos')
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error('Error');
          return data.pedidos || [];
        });
      })
      .then(function (pedidos) {
        render(pedidos);
        if (liveText) liveText.textContent = 'En vivo';
      })
      .catch(function () {
        statusEl.hidden = false;
        statusEl.textContent =
          'No se pudo cargar. Revisa que el servidor esté corriendo.';
        if (liveText) liveText.textContent = 'Sin conexión';
      });
  }

  function cambiarEstado(id, status) {
    fetch('/api/pedidos/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) throw new Error('No se pudo actualizar');
          return data;
        });
      })
      .then(function () {
        loadPedidos();
      })
      .catch(function () {
        statusEl.hidden = false;
        statusEl.textContent = 'No se pudo actualizar el pedido.';
      });
  }

  grid.addEventListener('click', function (e) {
    var btn = e.target.closest('.cocina-action');
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = '…';
    cambiarEstado(btn.dataset.id, btn.dataset.status);
  });

  loadPedidos();
  window.setInterval(loadPedidos, 3000);

  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      unlockAudio().then(function () {
        beep();
      });
    });
  }

  document.addEventListener('click', function () {
    if (!soundReady) unlockAudio();
  });
  document.addEventListener('touchstart', function () {
    if (!soundReady) unlockAudio();
  });
})();
