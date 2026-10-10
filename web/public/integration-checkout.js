(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let config, order, piAuth;
  const state = text => { $('checkoutState').textContent = text; };
  async function api(action, body) {
    const token = localStorage.getItem('cohiba_human_signal_token');
    if (body && !token) throw Error('Hãy đăng nhập COHIBA trước.');
    const response = await fetch('/api/integrations/checkout/' + action, {
      method: body ? 'POST' : 'GET', headers: {'content-type': 'application/json', ...(token ? {authorization: 'Bearer ' + token} : {})},
      ...(body ? {body: JSON.stringify(body)} : {})
    });
    const result = await response.json(); if (!response.ok) throw Error(result.error || 'Kết nối chưa sẵn sàng.'); return result;
  }
  function render(value) {
    order = value; $('checkoutOrderId').value = value.id;
    localStorage.setItem('cohiba_checkout_order', value.id);
    state(value.id + '\n' + value.label + ' · ' + value.amount + ' ' + value.asset + '\n' + value.network + '\nVí nhận: ' + value.recipient + '\nTrạng thái: ' + value.status +
      (value.receipt ? '\nGiao dịch: ' + value.receipt.transactionId : '\nHạn tạo thanh toán: ' + value.expiresAt));
    $('checkoutPay').disabled = value.status === 'SETTLED' || Date.parse(value.expiresAt) <= Date.now();
    $('checkoutVerify').disabled = false;
  }
  async function piSession() {
    if (piAuth) return piAuth;
    if (!window.Pi) await new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://sdk.minepi.com/pi-sdk.js';
      script.onload = resolve; script.onerror = () => reject(Error('Không tải được Pi SDK.')); document.head.append(script);
    });
    window.Pi.init({version: '2.0', sandbox: config.pi.network === 'Pi Testnet'});
    const incomplete = [];
    const auth = await window.Pi.authenticate(['payments'], payment => incomplete.push(payment.identifier));
    piAuth = auth; // Memory only. The server verifies /me on every payment callback.
    for (const paymentId of incomplete) render(await api('pi/reconcile', {paymentId, accessToken: auth.accessToken}));
    return auth;
  }
  $('checkoutCreate').onclick = async () => {
    const button = $('checkoutCreate'); button.disabled = true;
    try { render(await api('order', {sku: $('checkoutSku').value, asset: $('checkoutAsset').value})); }
    catch (e) {state(e.message);} finally {button.disabled = false;}
  };
  $('checkoutRecover').onclick = async () => {
    try {render(await api('status', {orderId: $('checkoutOrderId').value.trim()}));} catch (e) {state(e.message);}
  };
  $('checkoutPay').onclick = async () => {
    const button = $('checkoutPay'); button.disabled = true;
    try {
      if (!order) throw Error('Tạo hoặc tải đơn hàng trước.');
      if (order.asset === 'PI') {
        const chosen = order, auth = await piSession();
        if (order.id !== chosen.id) throw Error('Đã đối soát đơn trước. Hãy tải lại đơn muốn thanh toán.');
        window.Pi.createPayment(chosen.paymentData, {
          onReadyForServerApproval: async paymentId => {try {render(await api('pi/approve', {orderId: chosen.id, paymentId, accessToken: auth.accessToken}));} catch (e) {state(e.message);}},
          onReadyForServerCompletion: async (paymentId, txid) => {try {render(await api('pi/complete', {orderId: chosen.id, paymentId, txid, accessToken: auth.accessToken}));} catch (e) {state(e.message + '\nBấm đối soát để kiểm tra lại.');}},
          onCancel: () => state('Đã hủy trong ví Pi. Chưa ghi nhận thanh toán.'),
          onError: () => state('Ví Pi báo lỗi. Hãy đối soát trước khi tạo thanh toán khác.')
        });
      } else {
        const wallet = window.phantom?.solana || window.solana;
        if (!wallet?.signAndSendTransaction) throw Error('Mở trang bằng trình duyệt ví Solana.');
        const connected = await wallet.connect();
        if (connected.publicKey.toString() !== order.payer) throw Error('Dùng đúng ví Solana đã xác minh trong hồ sơ COHIBA.');
        const prepared = await api('ousd/prepare', {orderId: order.id});
        const transaction = window.cohibaSolana.Transaction.from(Uint8Array.from(atob(prepared.transaction), c => c.charCodeAt(0)));
        const sent = await wallet.signAndSendTransaction(transaction); $('checkoutSignature').value = sent.signature;
        state('Đã gửi. Chờ Solana finalized rồi bấm đối soát.\n' + sent.signature);
      }
    } catch (e) {state(e.message);} finally {button.disabled = !order || order.status === 'SETTLED';}
  };
  $('checkoutVerify').onclick = async () => {
    try {
      if (!order) throw Error('Tải đơn hàng trước.');
      if (order.asset === 'PI') {
        const auth = await piSession(); const fresh = await api('status', {orderId: order.id});
        if (!fresh.paymentId) throw Error('Đơn chưa có mã thanh toán Pi.');
        render(await api('pi/reconcile', {paymentId: fresh.paymentId, accessToken: auth.accessToken}));
      } else render(await api('ousd/settle', {orderId: order.id, signature: $('checkoutSignature').value.trim()}));
    } catch (e) {state(e.message);}
  };
  (async () => {
    try {
      config = await api('config');
      for (const item of config.catalog) {const option = document.createElement('option'); option.value = item.sku; option.textContent = item.label; $('checkoutSku').append(option);}
      for (const [asset, ready] of [['PI', config.pi], ['OUSD', config.ousd]]) {const option = document.createElement('option'); option.value = asset; option.textContent = asset; option.disabled = !ready.enabled; $('checkoutAsset').append(option);}
      $('checkoutAsset').value = config.pi.enabled ? 'PI' : config.ousd.enabled ? 'OUSD' : '';
      $('checkoutCreate').disabled = !config.pi.enabled && !config.ousd.enabled;
      $('checkoutOrderId').value = localStorage.getItem('cohiba_checkout_order') || '';
      state(config.pi.enabled || config.ousd.enabled ? 'Chọn dịch vụ và tài sản để tạo đơn hàng.' : 'Thanh toán chưa được bật. Bạn vẫn có thể liên kết tài khoản Pi và dùng yêu cầu ví OUSD ở trên.');
    } catch (e) {state(e.message);}
  })();
})();
