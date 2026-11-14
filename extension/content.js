// Detecta cuando un video está por terminar (90 %) y avisa al service worker, que decide
// si la pestaña corresponde a un anime de tu lista y ofrece marcar el capítulo.
// No lee ni envía nada de la página salvo que hay un video casi terminado.
(() => {
  const reported = new WeakSet();

  document.addEventListener('timeupdate', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLVideoElement) || reported.has(v)) return;
    const d = v.duration;
    if (!Number.isFinite(d) || d < 300) return; // ignora anuncios y clips cortos (< 5 min)
    if (v.currentTime / d < 0.9) return;
    reported.add(v);
    try {
      chrome.runtime.sendMessage({ type: 'video-almost-done' });
    } catch {
      /* la extensión se recargó: no hay a quién avisar */
    }
  }, true); // fase de captura: timeupdate no burbujea
})();
