(function () {
  var MESA_ACTUAL =
    (window.MatildaMesa && window.MatildaMesa.get()) || 'Mesa01';
  var historialStatus = document.getElementById('historial-status');
  var historialSheet = document.getElementById('historial-sheet');
  var historialBody = document.getElementById('historial-body');
  var historialSum = document.getElementById('historial-sum');
  var historialMeta = document.getElementById('historial-meta');
  var historialMesa = document.getElementById('historial-mesa');
  var historialPrep = document.getElementById('historial-prep');
  var historialPrepKicker = document.getElementById('historial-prep-kicker');
  var historialPrepTitle = document.getElementById('historial-prep-title');
  var historialPrepText = document.getElementById('historial-prep-text');
  if (!historialStatus || !historialBody) return;

  if (historialMesa) historialMesa.textContent = MESA_ACTUAL;

  function formatMoney(n) {
    return '$' + Number(n || 0);
  }

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('es-MX', {
        dateStyle: 'short',
        timeStyle: 'short',
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
    if (status === 'en_proceso') return 'En cocina';
    if (status === 'entregado') return 'Entregado';
    return 'Recibido';
  }

  function actualizarAvisoPrep(pedidos) {
    if (!historialPrep) return;
    var activos = (pedidos || []).filter(function (p) {
      var s = estadoDe(p);
      return s === 'pendiente' || s === 'en_proceso';
    });

    if (!activos.length) {
      historialPrep.hidden = true;
      historialPrep.classList.remove('is-cooking', 'is-received');
      return;
    }

    var enCocina = activos.some(function (p) {
      return estadoDe(p) === 'en_proceso';
    });
    var n = activos.length;

    historialPrep.hidden = false;
    historialPrep.classList.toggle('is-cooking', enCocina);
    historialPrep.classList.toggle('is-received', !enCocina);

    if (enCocina) {
      if (historialPrepKicker) historialPrepKicker.textContent = 'En preparación';
      if (historialPrepTitle) {
        historialPrepTitle.textContent =
          n === 1
            ? 'Cocina está preparando su pedido'
            : 'Cocina está preparando sus pedidos';
      }
      if (historialPrepText) {
        historialPrepText.textContent =
          'En un momento lo llevamos a su mesa. Gracias por su paciencia.';
      }
    } else {
      if (historialPrepKicker) historialPrepKicker.textContent = 'Pedido recibido';
      if (historialPrepTitle) {
        historialPrepTitle.textContent =
          n === 1
            ? 'Su pedido ya está en cocina'
            : 'Sus pedidos ya están en cocina';
      }
      if (historialPrepText) {
        historialPrepText.textContent =
          'En breve comenzamos la preparación y se lo entregamos en la mesa.';
      }
    }
  }

  function loadHistorial() {
    // No ocultar el sheet en cada poll para evitar parpadeo; solo al primer load vacío
    if (!historialBody.children.length) {
      historialStatus.textContent = 'Cargando…';
      historialStatus.hidden = false;
    }

    fetch('/api/pedidos')
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) {
            throw new Error('No se pudo cargar el historial');
          }
          return data.pedidos || [];
        });
      })
      .then(function (pedidos) {
        var deMesa = (pedidos || []).filter(function (p) {
          return p.mesa === MESA_ACTUAL;
        });

        if (!deMesa.length) {
          historialStatus.hidden = false;
          historialStatus.textContent =
            'Aún no hay pedidos confirmados en ' + MESA_ACTUAL + '.';
          if (historialSheet) historialSheet.hidden = true;
          actualizarAvisoPrep([]);
          historialBody.innerHTML = '';
          return;
        }

        historialStatus.hidden = true;
        historialStatus.textContent = '';
        if (historialSheet) historialSheet.hidden = false;
        actualizarAvisoPrep(deMesa);

        var suma = 0;
        var rows = deMesa.slice().reverse();
        historialBody.innerHTML = '';

        rows.forEach(function (pedido, index) {
          var total = Number(pedido.total) || 0;
          suma += total;
          var status = estadoDe(pedido);

          var itemsText = (pedido.items || [])
            .map(function (item) {
              return item.qty + '× ' + item.name;
            })
            .join(', ');

          var tr = document.createElement('tr');
          if (status === 'en_proceso' || status === 'pendiente') {
            tr.className = 'historial-row-active';
          }
          tr.innerHTML =
            '<td class="col-num">' +
            (index + 1) +
            '</td>' +
            '<td>' +
            escapeHtml(pedido.mesa || 'Sin mesa') +
            '</td>' +
            '<td>' +
            escapeHtml(formatTime(pedido.createdAt)) +
            '</td>' +
            '<td class="col-pedido">' +
            escapeHtml(itemsText) +
            '</td>' +
            '<td><span class="estado-badge estado-' +
            status +
            '">' +
            etiquetaEstado(status) +
            '</span></td>' +
            '<td class="col-num">' +
            formatMoney(total) +
            '</td>';
          historialBody.appendChild(tr);
        });

        if (historialSum) historialSum.textContent = formatMoney(suma);
        if (historialMeta) {
          historialMeta.textContent =
            rows.length +
            (rows.length === 1 ? ' pedido' : ' pedidos') +
            ' · Suma final ' +
            formatMoney(suma);
        }
      })
      .catch(function () {
        historialStatus.hidden = false;
        historialStatus.textContent =
          'No se pudo cargar el historial. Revisa que el servidor esté corriendo.';
        if (historialSheet) historialSheet.hidden = true;
        actualizarAvisoPrep([]);
      });
  }

  document.addEventListener('pedido-confirmado', loadHistorial);
  loadHistorial();
  window.setInterval(loadHistorial, 5000);
})();
