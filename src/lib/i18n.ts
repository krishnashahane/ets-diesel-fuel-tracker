// Lightweight, dependency-free i18n for the login / account screens.
// 7 languages: English, Hindi, Marathi, Gujarati, Telugu, Tamil, Kannada.
// Translations reviewed for accuracy of UI terminology.

export const LANGS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'mr', label: 'मराठी' },
  { code: 'gu', label: 'ગુજરાતી' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
] as const;

export type Lang = (typeof LANGS)[number]['code'];

export const STORAGE_KEY = 'sfm.lang';

type Key =
  | 'brandName'
  | 'welcomeBack'
  | 'subtitle'
  | 'username'
  | 'usernamePlaceholder'
  | 'password'
  | 'signIn'
  | 'signingIn'
  | 'showPassword'
  | 'hidePassword'
  | 'loginFailed'
  | 'networkError'
  | 'secured'
  | 'language';

const DICT: Record<Lang, Record<Key, string>> = {
  en: {
    brandName: 'SFM Diesel Management',
    welcomeBack: 'Welcome back',
    subtitle: 'Sign in to continue to your dashboard.',
    username: 'Username',
    usernamePlaceholder: 'e.g. admin',
    password: 'Password',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    loginFailed: 'Login failed',
    networkError: 'Network error. Please retry.',
    secured: 'Secured connection · Activity is logged & audited.',
    language: 'Language',
  },
  hi: {
    brandName: 'SFM डीज़ल प्रबंधन',
    welcomeBack: 'वापसी पर स्वागत है',
    subtitle: 'अपने डैशबोर्ड पर जारी रखने के लिए साइन इन करें।',
    username: 'उपयोगकर्ता नाम',
    usernamePlaceholder: 'जैसे admin',
    password: 'पासवर्ड',
    signIn: 'साइन इन करें',
    signingIn: 'साइन इन हो रहा है…',
    showPassword: 'पासवर्ड दिखाएं',
    hidePassword: 'पासवर्ड छिपाएं',
    loginFailed: 'लॉगिन विफल रहा',
    networkError: 'नेटवर्क त्रुटि। कृपया पुनः प्रयास करें।',
    secured: 'सुरक्षित कनेक्शन · गतिविधि लॉग और ऑडिट की जाती है।',
    language: 'भाषा',
  },
  mr: {
    brandName: 'SFM डिझेल व्यवस्थापन',
    welcomeBack: 'पुन्हा स्वागत आहे',
    subtitle: 'तुमच्या डॅशबोर्डवर सुरू ठेवण्यासाठी साइन इन करा.',
    username: 'वापरकर्तानाव',
    usernamePlaceholder: 'उदा. admin',
    password: 'पासवर्ड',
    signIn: 'साइन इन करा',
    signingIn: 'साइन इन होत आहे…',
    showPassword: 'पासवर्ड दाखवा',
    hidePassword: 'पासवर्ड लपवा',
    loginFailed: 'लॉगिन अयशस्वी',
    networkError: 'नेटवर्क त्रुटी. कृपया पुन्हा प्रयत्न करा.',
    secured: 'सुरक्षित कनेक्शन · क्रियाकलाप लॉग आणि ऑडिट केले जातात.',
    language: 'भाषा',
  },
  gu: {
    brandName: 'SFM ડીઝલ વ્યવસ્થાપન',
    welcomeBack: 'ફરી સ્વાગત છે',
    subtitle: 'તમારા ડેશબોર્ડ પર ચાલુ રાખવા માટે સાઇન ઇન કરો.',
    username: 'વપરાશકર્તા નામ',
    usernamePlaceholder: 'દા.ત. admin',
    password: 'પાસવર્ડ',
    signIn: 'સાઇન ઇન કરો',
    signingIn: 'સાઇન ઇન થઈ રહ્યું છે…',
    showPassword: 'પાસવર્ડ બતાવો',
    hidePassword: 'પાસવર્ડ છુપાવો',
    loginFailed: 'લૉગિન નિષ્ફળ',
    networkError: 'નેટવર્ક ભૂલ. કૃપા કરીને ફરી પ્રયાસ કરો.',
    secured: 'સુરક્ષિત કનેક્શન · પ્રવૃત્તિ લૉગ અને ઑડિટ થાય છે.',
    language: 'ભાષા',
  },
  te: {
    brandName: 'SFM డీజిల్ నిర్వహణ',
    welcomeBack: 'మళ్ళీ స్వాగతం',
    subtitle: 'మీ డాష్‌బోర్డ్‌కు కొనసాగించడానికి సైన్ ఇన్ చేయండి.',
    username: 'వినియోగదారు పేరు',
    usernamePlaceholder: 'ఉదా. admin',
    password: 'పాస్‌వర్డ్',
    signIn: 'సైన్ ఇన్ చేయండి',
    signingIn: 'సైన్ ఇన్ అవుతోంది…',
    showPassword: 'పాస్‌వర్డ్ చూపించు',
    hidePassword: 'పాస్‌వర్డ్ దాచు',
    loginFailed: 'లాగిన్ విఫలమైంది',
    networkError: 'నెట్‌వర్క్ లోపం. దయచేసి మళ్ళీ ప్రయత్నించండి.',
    secured: 'సురక్షిత కనెక్షన్ · కార్యకలాపం లాగ్ మరియు ఆడిట్ చేయబడుతుంది.',
    language: 'భాష',
  },
  ta: {
    brandName: 'SFM டீசல் மேலாண்மை',
    welcomeBack: 'மீண்டும் வரவேற்கிறோம்',
    subtitle: 'உங்கள் டாஷ்போர்டுக்குத் தொடர உள்நுழையவும்.',
    username: 'பயனர் பெயர்',
    usernamePlaceholder: 'எ.கா. admin',
    password: 'கடவுச்சொல்',
    signIn: 'உள்நுழையவும்',
    signingIn: 'உள்நுழைகிறது…',
    showPassword: 'கடவுச்சொல்லைக் காட்டு',
    hidePassword: 'கடவுச்சொல்லை மறை',
    loginFailed: 'உள்நுழைவு தோல்வியடைந்தது',
    networkError: 'நெட்வொர்க் பிழை. மீண்டும் முயற்சிக்கவும்.',
    secured: 'பாதுகாப்பான இணைப்பு · செயல்பாடு பதிவு செய்யப்பட்டு தணிக்கை செய்யப்படுகிறது.',
    language: 'மொழி',
  },
  kn: {
    brandName: 'SFM ಡೀಸೆಲ್ ನಿರ್ವಹಣೆ',
    welcomeBack: 'ಮತ್ತೆ ಸ್ವಾಗತ',
    subtitle: 'ನಿಮ್ಮ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್‌ಗೆ ಮುಂದುವರಿಯಲು ಸೈನ್ ಇನ್ ಮಾಡಿ.',
    username: 'ಬಳಕೆದಾರ ಹೆಸರು',
    usernamePlaceholder: 'ಉದಾ. admin',
    password: 'ಪಾಸ್‌ವರ್ಡ್',
    signIn: 'ಸೈನ್ ಇನ್ ಮಾಡಿ',
    signingIn: 'ಸೈನ್ ಇನ್ ಆಗುತ್ತಿದೆ…',
    showPassword: 'ಪಾಸ್‌ವರ್ಡ್ ತೋರಿಸಿ',
    hidePassword: 'ಪಾಸ್‌ವರ್ಡ್ ಮರೆಮಾಡಿ',
    loginFailed: 'ಲಾಗಿನ್ ವಿಫಲವಾಗಿದೆ',
    networkError: 'ನೆಟ್‌ವರ್ಕ್ ದೋಷ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    secured: 'ಸುರಕ್ಷಿತ ಸಂಪರ್ಕ · ಚಟುವಟಿಕೆ ಲಾಗ್ ಮತ್ತು ಆಡಿಟ್ ಮಾಡಲಾಗುತ್ತದೆ.',
    language: 'ಭಾಷೆ',
  },
};

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && LANGS.some((l) => l.code === v);
}

/** Resolve initial language: stored choice → browser locale → English. */
export function detectLang(): Lang {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* localStorage unavailable */
  }
  const nav = (navigator.language || '').slice(0, 2).toLowerCase();
  return isLang(nav) ? nav : 'en';
}

export function t(lang: Lang, key: Key): string {
  return (DICT[lang] ?? DICT.en)[key] ?? DICT.en[key];
}
