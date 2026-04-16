import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '../locales/fr/translation.json';
import en from '../locales/en/translation.json';

const STORAGE_KEY = 'aimleads-language';

const getStoredLanguage = () => {
  if (typeof window === 'undefined') return 'fr';

  const stored = String(window.localStorage.getItem(STORAGE_KEY) || '').trim().toLowerCase();
  if (stored === 'fr' || stored === 'en') {
    return stored;
  }

  return 'fr';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
    },
    lng: getStoredLanguage(),
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en'],
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
  });

i18n.on('languageChanged', (language) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, String(language || 'fr').slice(0, 2).toLowerCase());
});

export default i18n;
