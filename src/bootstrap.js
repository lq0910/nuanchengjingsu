/**
 * 功能：先显示内联加载页，再载入游戏样式和资源；启动失败时提供重试。
 * 时间：2026-11-20 | 作者：lq
 */
async function boot() {
  try {
    // 动态入口让构建产物的游戏样式不阻塞加载页首绘，并将样式和模块加载错误纳入重试流程。
    const { startGame } = await import('./main.js');
    await startGame();
    document.querySelector('#stage').inert = false;
    document.querySelector('#game-loading').hidden = true;
  } catch (error) {
    console.error('Game failed to load', error);
    document.querySelector('#boot-status').textContent = '游戏加载失败，请刷新重试。';
    document.querySelector('#boot-spinner').hidden = true;
    document.querySelector('#boot-retry').hidden = false;
  }
}

void boot();
