// 1) Al cargar la página (solo el marco principal) avisa al service worker para que muestre en el
//    icono si reconoce el anime (✓ en tu lista, + si no lo tienes).
// 2) Detecta cuando un video está por terminar (90 %) y avisa para marcar el capítulo.
// No lee ni envía nada de la página: el service worker usa solo la URL y el título de la pestaña.
(() => {
  const send = (msg) => {
    try { chrome.runtime.sendMessage(msg); } catch { /* la extensión se recargó: no hay a quién avisar */ }
  };

  if (window.top === window) {
    send({ type: 'page-loaded' });
    // Sitios de una sola página: el título cambia al pasar al siguiente capítulo
    let lastTitle = document.title;
    let lastUrl = location.href;
    setInterval(() => {
      if (document.title !== lastTitle || location.href !== lastUrl) {
        lastTitle = document.title;
        lastUrl = location.href;
        send({ type: 'page-loaded' });
      }
    }, 3000);
  }

  const reported = new WeakSet();
  document.addEventListener('timeupdate', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || reported.has(v)) return;
    const d = v.duration;
    if (!Number.isFinite(d) || d < 300) return; // ignora anuncios y clips cortos (< 5 min)
    if (v.currentTime / d < 0.9) return;
    reported.add(v);
    send({ type: 'video-almost-done' });
  }, true); // fase de captura: timeupdate no burbujea
})();
