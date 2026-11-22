/**
 * Notificaciones compatibles con Chrome y Firefox.
 * Firefox no admite botones, requireInteraction ni priority en chrome.notifications: ahí se quitan y
 * la acción principal (el primer botón) se hace al hacer clic en la notificación, con una pista en el texto.
 */
export const IS_FIREFOX = typeof navigator !== 'undefined' && /Firefox\//.test(navigator.userAgent);

export function notify(id, { title, message, buttons, requireInteraction, priority, clickHint }) {
  const iconUrl = 'icons/icon128.png';
  const opts = IS_FIREFOX
    ? { type: 'basic', iconUrl, title, message: clickHint ? `${message}\n👉 ${clickHint}` : message }
    : {
      type: 'basic', iconUrl, title, message,
      ...(buttons ? { buttons } : {}), ...(requireInteraction ? { requireInteraction } : {}), ...(priority ? { priority } : {}),
    };
  return id ? chrome.notifications.create(id, opts) : chrome.notifications.create(opts);
}
