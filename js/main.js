'use strict';

// ============================================================
// ゲーム初期化
// ============================================================

function initGame() {
  state = createInitialState();
  prevPrices = { ...state.market.prices };
  addLog('化学プラント経営ゲームへようこそ！', 'log-info');
  addLog('まずは「プラント」タブから製造プラントを建設しましょう。', 'log-info');

  initEventHandlers();
  render();
}

function initEventHandlers() {
  // タブ切り替え
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`).classList.add('active');
      activeTab = tab;
      renderTab(tab);
    });
  });

  // ターン終了
  document.getElementById('btn-end-turn').addEventListener('click', handleEndTurn);

  // モーダル閉じる
  document.getElementById('modal-close').addEventListener('click', hideModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) {
      hideModal();
    }
  });

  // Escキーでモーダルを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal();
  });
}

// ゲーム開始
document.addEventListener('DOMContentLoaded', initGame);
