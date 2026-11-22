/** Ajustes de la extensión (chrome.storage.sync: se comparten entre tus navegadores con la misma cuenta de Chrome). */
export const DEFAULT_SETTINGS = {
  autoMark: true,        // al terminar un capítulo (90 % del video), marcarlo solo con opción de deshacer
  suggestAdd: true,      // si el anime no está en tu lista, proponer agregarlo
  staleReminders: true,  // "¿Lo retomas o lo dejas?" para series pausadas
};

export async function getSettings() {
  const { settings = {} } = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

export async function setSetting(key, value) {
  const current = await getSettings();
  await chrome.storage.sync.set({ settings: { ...current, [key]: value } });
}
