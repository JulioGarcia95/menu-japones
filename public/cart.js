(function () {
  var MESA_FIJA =
    (window.MatildaMesa && window.MatildaMesa.get()) || 'Mesa01';
  var STORAGE_KEY =
    (window.MatildaMesa && window.MatildaMesa.cartKey()) || 'matilda-cart';
  var CLOSE_KEY =
    (window.MatildaMesa && window.MatildaMesa.closeKey()) ||
    'matilda-mesa-cerrada';
  var EXPELLED_KEY =
    (window.MatildaMesa && window.MatildaMesa.expelledKey()) ||
    'matilda-expulsado-' + MESA_FIJA;
  var cart = loadCart();
  var isOpen = false;
  var orderingClosed = localStorage.getItem(CLOSE_KEY) === '1';
  var expulsado = localStorage.getItem(EXPELLED_KEY) === '1';

  var cartDock = document.getElementById('cart-dock');
  var cartToggle = document.getElementById('cart-toggle');
  var cartArrow = document.getElementById('cart-tab-arrow');
  var cartBarCount = document.getElementById('cart-bar-count');
  var cartBarTotal = document.getElementById('cart-bar-total');
  var cartSheet = document.getElementById('cart-sheet');
  var cartBackdrop = document.getElementById('cart-backdrop');
  var cartLines = document.getElementById('cart-lines');
  var cartEmpty = document.getElementById('cart-empty');
  var cartFooter = document.getElementById('cart-footer');
  var cartTotal = document.getElementById('cart-total');
  var cartConfirm = document.getElementById('cart-confirm');
  var cartStatus = document.getElementById('cart-status');
  var mesaFija = document.getElementById('mesa-fija');
  var orderSuccess = document.getElementById('order-success');
  var orderSuccessMesa = document.getElementById('order-success-mesa');
  var orderSuccessClose = document.getElementById('order-success-close');
  var orderSuccessBackdrop = document.getElementById('order-success-backdrop');
  var dishOptions = document.getElementById('dish-options');
  var dishOptionsBackdrop = document.getElementById('dish-options-backdrop');
  var dishOptionsTitle = document.getElementById('dish-options-title');
  var dishOptionsGroups = document.getElementById('dish-options-groups');
  var dishOptionsCancel = document.getElementById('dish-options-cancel');
  var dishOptionsAdd = document.getElementById('dish-options-add');

  var pendingDish = null;
  var optionChoices = {};

  var DISH_OPTIONS = {
    ramen: {
      title: 'Ramen',
      extraDoble: 0,
      groups: [
        {
          key: 'alga',
          label: 'Alga',
          kitchenNoun: 'alga',
          choices: [
            { value: 'sin', label: 'Sin alga' },
            { value: 'normal', label: 'Normal' },
            { value: 'doble', label: 'Doble' },
          ],
        },
        {
          key: 'cerdo',
          label: 'Carne de cerdo',
          kitchenNoun: 'carne de cerdo',
          choices: [
            { value: 'sin', label: 'Sin carne' },
            { value: 'normal', label: 'Normal' },
            { value: 'doble', label: 'Doble' },
          ],
        },
        {
          key: 'huevo',
          label: 'Huevo',
          kitchenNoun: 'huevo',
          choices: [
            { value: 'sin', label: 'Sin huevo' },
            { value: 'normal', label: 'Normal' },
            { value: 'doble', label: 'Doble' },
          ],
        },
      ],
    },
  };

  if (!cartToggle || !cartSheet) return;

  if (mesaFija) mesaFija.textContent = MESA_FIJA;

  function loadCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveCart() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  function cartItems() {
    return Object.keys(cart).map(function (id) {
      return cart[id];
    });
  }

  function cartCount() {
    return cartItems().reduce(function (sum, item) {
      return sum + item.qty;
    }, 0);
  }

  function cartSum() {
    return cartItems().reduce(function (sum, item) {
      return sum + item.price * item.qty;
    }, 0);
  }

  function formatMoney(n) {
    return '$' + n;
  }

  function addItem(id, name, price) {
    checkMesaState(function () {
      if (expulsado) {
        openCart();
        cartStatus.textContent =
          'Esta visita ya terminó. Escanea el QR de la mesa para ordenar de nuevo.';
        cartEmpty.hidden = true;
        cartFooter.hidden = false;
        showExpulsadoBanner();
        return;
      }
      if (orderingClosed) {
        openCart();
        cartStatus.textContent =
          'La cuenta ya fue solicitada. Ya no se puede ordenar más comida.';
        cartEmpty.hidden = true;
        cartFooter.hidden = false;
        return;
      }
      if (cart[id]) {
        cart[id].qty += 1;
      } else {
        cart[id] = { id: id, name: name, price: price, qty: 1 };
      }
      saveCart();
      render();
    });
  }

  function choiceLabel(group, value) {
    var found = group.choices.find(function (c) {
      return c.value === value;
    });
    return found ? found.label : value;
  }

  function kitchenOptionText(group, value) {
    if (value === 'normal') return null;
    var noun = group.kitchenNoun || group.label.toLowerCase();
    if (value === 'sin') return 'sin ' + noun;
    if (value === 'doble') return noun + ' doble';
    return choiceLabel(group, value);
  }

  function buildOptionsName(baseName, config, choices) {
    var parts = config.groups
      .map(function (group) {
        return kitchenOptionText(group, choices[group.key]);
      })
      .filter(Boolean);
    if (!parts.length) return baseName;
    return baseName + ' (' + parts.join(', ') + ')';
  }

  function buildOptionsId(baseId, choices) {
    var keys = Object.keys(choices).sort();
    return (
      baseId +
      '|' +
      keys
        .map(function (k) {
          return k + ':' + choices[k];
        })
        .join('|')
    );
  }

  function countDobles(choices) {
    return Object.keys(choices).filter(function (k) {
      return choices[k] === 'doble';
    }).length;
  }

  function priceWithOptions(basePrice, config, choices) {
    var extra = Number(config.extraDoble) || 0;
    return Number(basePrice) + countDobles(choices) * extra;
  }

  function updateOptionsAddLabel() {
    if (!dishOptionsAdd || !pendingDish) return;
    var config = DISH_OPTIONS[pendingDish.id];
    if (!config) return;
    var total = priceWithOptions(pendingDish.price, config, optionChoices);
    dishOptionsAdd.textContent = 'Agregar · ' + formatMoney(total);
  }

  function openDishOptions(id, name, price) {
    var config = DISH_OPTIONS[id];
    if (!config || !dishOptions || !dishOptionsGroups) {
      addItem(id, name, price);
      return;
    }

    pendingDish = { id: id, name: name, price: price };
    optionChoices = {};
    config.groups.forEach(function (group) {
      optionChoices[group.key] = 'normal';
    });

    if (dishOptionsTitle) dishOptionsTitle.textContent = config.title;

    var extra = Number(config.extraDoble) || 0;
    dishOptionsGroups.innerHTML = config.groups
      .map(function (group) {
        return (
          '<fieldset class="dish-option-group">' +
          '<legend>' +
          escapeHtml(group.label) +
          '</legend>' +
          '<div class="dish-option-choices" role="group" aria-label="' +
          escapeAttr(group.label) +
          '">' +
          group.choices
            .map(function (choice) {
              var active = optionChoices[group.key] === choice.value;
              var extraText =
                choice.value === 'doble' && extra
                  ? ' <span class="dish-option-extra">+' +
                    formatMoney(extra) +
                    '</span>'
                  : '';
              return (
                '<button type="button" class="dish-option-choice' +
                (active ? ' is-active' : '') +
                '" data-group="' +
                escapeAttr(group.key) +
                '" data-value="' +
                escapeAttr(choice.value) +
                '" aria-pressed="' +
                (active ? 'true' : 'false') +
                '">' +
                escapeHtml(choice.label) +
                extraText +
                '</button>'
              );
            })
            .join('') +
          '</div>' +
          '</fieldset>'
        );
      })
      .join('');

    updateOptionsAddLabel();

    dishOptions.hidden = false;
    document.body.classList.add('dish-options-open');
    window.requestAnimationFrame(function () {
      dishOptions.classList.add('is-visible');
    });
  }

  function closeDishOptions() {
    pendingDish = null;
    if (!dishOptions) return;
    dishOptions.classList.remove('is-visible');
    document.body.classList.remove('dish-options-open');
    window.setTimeout(function () {
      if (!document.body.classList.contains('dish-options-open')) {
        dishOptions.hidden = true;
      }
    }, 250);
  }

  function confirmDishOptions() {
    if (!pendingDish) return;
    var config = DISH_OPTIONS[pendingDish.id];
    if (!config) {
      closeDishOptions();
      return;
    }
    var finalId = buildOptionsId(pendingDish.id, optionChoices);
    var finalName = buildOptionsName(pendingDish.name, config, optionChoices);
    var price = priceWithOptions(pendingDish.price, config, optionChoices);
    closeDishOptions();
    addItem(finalId, finalName, price);
    animateAddToCart(dishOptionsAdd || cartToggle);
  }

  function getSessionId() {
    return (window.MatildaMesa && window.MatildaMesa.getSession()) || null;
  }

  function cuentaUrl() {
    var url =
      '/api/cuenta?mesa=' + encodeURIComponent(MESA_FIJA);
    var ses = getSessionId();
    if (ses) url += '&sessionId=' + encodeURIComponent(ses);
    if (window.MatildaMesa && window.MatildaMesa.needsJoin()) {
      url += '&join=1';
    }
    return url;
  }

  function applyCuentaState(data) {
    if (!data || !data.ok) return;

    if (data.sessionId && window.MatildaMesa) {
      if (!data.expulsado) {
        window.MatildaMesa.setSession(data.sessionId);
      }
    }
    if (window.MatildaMesa && window.MatildaMesa.consumeJoin) {
      window.MatildaMesa.consumeJoin();
    }

    if (data.expulsado) {
      expulsado = true;
      orderingClosed = true;
      localStorage.setItem(EXPELLED_KEY, '1');
      localStorage.setItem(CLOSE_KEY, '1');
      cart = {};
      saveCart();
      showExpulsadoBanner();
      render();
      return;
    }

    expulsado = false;
    orderingClosed = Boolean(data.orderingClosed);
    localStorage.removeItem(EXPELLED_KEY);
    if (orderingClosed) localStorage.setItem(CLOSE_KEY, '1');
    else localStorage.removeItem(CLOSE_KEY);
    hideExpulsadoBanner();
    render();
  }

  function showExpulsadoBanner() {
    var el = document.getElementById('mesa-expulsado-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'mesa-expulsado-banner';
      el.className = 'mesa-expulsado-banner';
      el.setAttribute('role', 'alert');
      el.innerHTML =
        '<strong>Visita finalizada</strong>' +
        '<span>La cuenta de esta mesa ya fue pagada. Escanea de nuevo el QR de la mesa para ordenar.</span>';
      document.body.appendChild(el);
    }
    el.hidden = false;
    document.body.classList.add('mesa-expulsada');
  }

  function hideExpulsadoBanner() {
    var el = document.getElementById('mesa-expulsado-banner');
    if (el) el.hidden = true;
    document.body.classList.remove('mesa-expulsada');
  }

  function checkMesaState(done) {
    fetch(cuentaUrl())
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        applyCuentaState(data);
        if (done) done();
      })
      .catch(function () {
        if (done) done();
      });
  }

  function setQty(id, qty) {
    if (!cart[id]) return;
    if (qty <= 0) {
      delete cart[id];
    } else {
      cart[id].qty = qty;
    }
    saveCart();
    render();
  }

  function setToggleState(open) {
    isOpen = open;
    cartArrow.textContent = open ? '›' : '‹';
    cartToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    cartToggle.setAttribute('aria-label', open ? 'Cerrar carrito' : 'Abrir carrito');
    if (cartDock) cartDock.classList.toggle('is-open', open);
  }

  function showSuccess(mesa) {
    if (!orderSuccess) return;
    if (orderSuccessMesa) {
      orderSuccessMesa.textContent = mesa ? 'Mesa: ' + mesa : '';
    }
    orderSuccess.hidden = false;
    document.body.classList.add('success-open');
    window.requestAnimationFrame(function () {
      orderSuccess.classList.add('is-visible');
    });
  }

  function hideSuccess() {
    if (!orderSuccess) return;
    orderSuccess.classList.remove('is-visible');
    document.body.classList.remove('success-open');
    window.setTimeout(function () {
      if (!document.body.classList.contains('success-open')) {
        orderSuccess.hidden = true;
      }
    }, 280);
  }

  function openCart() {
    cartSheet.hidden = false;
    cartBackdrop.hidden = false;
    document.body.classList.add('cart-open');
    setToggleState(true);
    cartStatus.textContent = '';
    window.requestAnimationFrame(function () {
      cartSheet.classList.add('is-visible');
      cartBackdrop.classList.add('is-visible');
    });
  }

  function closeCart() {
    cartSheet.classList.remove('is-visible');
    cartBackdrop.classList.remove('is-visible');
    document.body.classList.remove('cart-open');
    setToggleState(false);
    window.setTimeout(function () {
      if (!isOpen) {
        cartSheet.hidden = true;
        cartBackdrop.hidden = true;
      }
    }, 280);
  }

  function toggleCart() {
    if (isOpen) closeCart();
    else openCart();
  }

  function render() {
    var items = cartItems();
    var count = cartCount();
    var total = cartSum();

    cartBarCount.textContent = String(count);
    cartBarTotal.textContent = formatMoney(total);
    document.body.classList.toggle('has-cart', count > 0);
    cartToggle.classList.toggle('has-items', count > 0);
    var bloqueado = orderingClosed || expulsado;
    document.body.classList.toggle('ordering-closed', bloqueado);
    document.body.classList.toggle('mesa-expulsada', expulsado);
    document.querySelectorAll('.btn-add').forEach(function (btn) {
      btn.disabled = bloqueado;
    });

    cartEmpty.hidden = items.length > 0;
    cartFooter.hidden = items.length === 0 && !bloqueado;
    cartTotal.textContent = formatMoney(total);
    if (cartConfirm) cartConfirm.disabled = bloqueado || items.length === 0;

    if (orderingClosed && items.length === 0) {
      cartEmpty.hidden = true;
      cartFooter.hidden = false;
      cartStatus.textContent =
        'Cuenta solicitada: ya no se puede ordenar. Pase a caja o espere en la mesa.';
    }

    cartLines.innerHTML = '';
    items.forEach(function (item) {
      var li = document.createElement('li');
      li.className = 'cart-line';
      li.innerHTML =
        '<div class="cart-line-copy">' +
        '<h3>' +
        escapeHtml(item.name) +
        '</h3>' +
        '<p>' +
        formatMoney(item.price) +
        ' c/u</p>' +
        '</div>' +
        '<div class="cart-line-qty">' +
        '<button type="button" class="qty-btn" data-action="dec" data-id="' +
        escapeAttr(item.id) +
        '" aria-label="Quitar uno">−</button>' +
        '<span>' +
        item.qty +
        '</span>' +
        '<button type="button" class="qty-btn" data-action="inc" data-id="' +
        escapeAttr(item.id) +
        '" aria-label="Agregar uno">+</button>' +
        '</div>' +
        '<p class="cart-line-sub">' +
        formatMoney(item.price * item.qty) +
        '</p>';
      cartLines.appendChild(li);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/'/g, '&#39;');
  }

  function animateAddToCart(fromEl) {
    if (!cartToggle || !fromEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (cartToggle) {
        cartToggle.classList.remove('is-bump');
        void cartToggle.offsetWidth;
        cartToggle.classList.add('is-bump');
      }
      return;
    }

    var img = fromEl.querySelector ? fromEl.querySelector('.item-photo') : null;
    var startEl = img || fromEl;
    var from = startEl.getBoundingClientRect();
    var to = cartToggle.getBoundingClientRect();
    if (!from.width || !to.width) return;

    var size = Math.max(44, Math.min(64, from.width * 0.28));
    var flyer = document.createElement('div');
    flyer.className = 'cart-fly';
    flyer.setAttribute('aria-hidden', 'true');
    if (img && img.currentSrc) {
      flyer.style.backgroundImage = 'url("' + img.currentSrc + '")';
    } else if (img && img.src) {
      flyer.style.backgroundImage = 'url("' + img.src + '")';
    }

    var startX = from.left + from.width / 2 - size / 2;
    var startY = from.top + from.height / 2 - size / 2;
    var endX = to.left + to.width / 2 - size / 2;
    var endY = to.top + to.height / 2 - size / 2;

    flyer.style.width = size + 'px';
    flyer.style.height = size + 'px';
    flyer.style.left = startX + 'px';
    flyer.style.top = startY + 'px';
    document.body.appendChild(flyer);

    window.requestAnimationFrame(function () {
      flyer.classList.add('is-flying');
      flyer.style.transform =
        'translate(' +
        (endX - startX) +
        'px, ' +
        (endY - startY) +
        'px) scale(0.28)';
      flyer.style.opacity = '0.35';
    });

    window.setTimeout(function () {
      if (flyer.parentNode) flyer.parentNode.removeChild(flyer);
      cartToggle.classList.remove('is-bump');
      void cartToggle.offsetWidth;
      cartToggle.classList.add('is-bump');
    }, 560);
  }

  document.querySelectorAll('.btn-add').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.dataset.id;
      var name = btn.dataset.name;
      var price = Number(btn.dataset.price);

      if (DISH_OPTIONS[id]) {
        openDishOptions(id, name, price);
        return;
      }

      addItem(id, name, price);
      btn.classList.add('is-added');
      animateAddToCart(btn);
      window.setTimeout(function () {
        btn.classList.remove('is-added');
      }, 480);
    });
  });

  if (dishOptionsGroups) {
    dishOptionsGroups.addEventListener('click', function (e) {
      var choiceBtn = e.target.closest('.dish-option-choice');
      if (!choiceBtn) return;
      var group = choiceBtn.dataset.group;
      var value = choiceBtn.dataset.value;
      optionChoices[group] = value;
      dishOptionsGroups
        .querySelectorAll('.dish-option-choice[data-group="' + group + '"]')
        .forEach(function (el) {
          var active = el.dataset.value === value;
          el.classList.toggle('is-active', active);
          el.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      updateOptionsAddLabel();
    });
  }

  if (dishOptionsCancel) {
    dishOptionsCancel.addEventListener('click', closeDishOptions);
  }
  if (dishOptionsBackdrop) {
    dishOptionsBackdrop.addEventListener('click', closeDishOptions);
  }
  if (dishOptionsAdd) {
    dishOptionsAdd.addEventListener('click', confirmDishOptions);
  }

  cartToggle.addEventListener('click', toggleCart);
  cartBackdrop.addEventListener('click', closeCart);

  cartLines.addEventListener('click', function (e) {
    var btn = e.target.closest('.qty-btn');
    if (!btn) return;
    var id = btn.dataset.id;
    var item = cart[id];
    if (!item) return;
    if (btn.dataset.action === 'inc') setQty(id, item.qty + 1);
    if (btn.dataset.action === 'dec') setQty(id, item.qty - 1);
  });

  cartConfirm.addEventListener('click', function () {
    var items = cartItems();
    if (!items.length) return;
    if (expulsado) {
      cartStatus.textContent =
        'Esta visita ya terminó. Escanea el QR de la mesa para ordenar de nuevo.';
      showExpulsadoBanner();
      return;
    }
    if (orderingClosed) {
      cartStatus.textContent =
        'La cuenta ya fue solicitada. Ya no se puede ordenar más comida.';
      return;
    }

    cartConfirm.disabled = true;
    cartStatus.textContent = 'Enviando pedido…';

    fetch('/api/pedidos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items,
        total: cartSum(),
        mesa: MESA_FIJA,
        sessionId: getSessionId(),
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.ok) {
            var err = new Error(data.error || 'No se pudo confirmar');
            err.expulsado = Boolean(data.expulsado);
            throw err;
          }
          return data;
        });
      })
      .then(function (data) {
        cart = {};
        saveCart();
        render();
        cartStatus.textContent = '';
        cartConfirm.disabled = false;
        closeCart();
        showSuccess(data.mesa);
        document.dispatchEvent(new CustomEvent('pedido-confirmado'));
      })
      .catch(function (err) {
        var msg = String(err.message || '');
        if (err.expulsado || msg.indexOf('visita ya terminó') !== -1) {
          expulsado = true;
          orderingClosed = true;
          localStorage.setItem(EXPELLED_KEY, '1');
          localStorage.setItem(CLOSE_KEY, '1');
          cart = {};
          saveCart();
          showExpulsadoBanner();
          render();
        } else if (msg.indexOf('ya fue solicitada') !== -1) {
          orderingClosed = true;
          localStorage.setItem(CLOSE_KEY, '1');
          render();
        }
        cartStatus.textContent =
          err.message || 'Error al enviar. Revisa que el servidor esté corriendo.';
        cartConfirm.disabled = false;
      });
  });

  if (orderSuccessClose) {
    orderSuccessClose.addEventListener('click', hideSuccess);
  }
  if (orderSuccessBackdrop) {
    orderSuccessBackdrop.addEventListener('click', hideSuccess);
  }

  // Asegura que ningún overlay quede bloqueando la página al cargar
  if (orderSuccess) {
    orderSuccess.classList.remove('is-visible');
    orderSuccess.hidden = true;
  }
  document.body.classList.remove('success-open', 'cart-open');
  cartSheet.classList.remove('is-visible');
  cartBackdrop.classList.remove('is-visible');
  cartSheet.hidden = true;
  cartBackdrop.hidden = true;
  setToggleState(false);

  if (expulsado) showExpulsadoBanner();

  checkMesaState(null);
  window.setInterval(function () {
    checkMesaState(null);
  }, 5000);

  render();
})();
