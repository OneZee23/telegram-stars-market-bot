export interface Translations {
  mainMenu: {
    title: string;
    help: string;
    buyStars: string;
    back: string;
  };
  help: {
    title: string;
    description: string;
    channelLink: string;
  };
  buyStars: {
    selectRecipient: string;
    forMyself: string;
    forOther: string;
    forOtherLocked: string;
    selectAmount: string;
    enterCustomAmount: string;
    usernameRequired: string;
    soon: string;
    enterAmountPrompt: string;
    invalidAmount: string;
    selectedAmount: string;
  };
  errors: {
    usernameRequired: string;
  };
}

export const translations: Record<string, Translations> = {
  ru: {
    mainMenu: {
      title: 'Добро пожаловать! Выберите действие:',
      help: 'Помощь',
      buyStars: 'Купить звезды',
      back: '← Назад',
    },
    help: {
      title: '📚 Помощь',
      description:
        'Этот бот позволяет покупать Telegram Stars по выгодной цене.\n\n' +
        'Telegram Stars — это внутренняя валюта Telegram, которую можно использовать для покупки подписок, стикеров и других товаров в Telegram.\n\n' +
        'Мы предлагаем Stars дешевле официальной цены.\n\n' +
        'Подписывайтесь на наш канал для новостей и обновлений:',
      channelLink: '📢 Канал OneZee',
    },
    buyStars: {
      selectRecipient: 'Выберите получателя звезд:',
      forMyself: 'Себе',
      forOther: 'Другому',
      forOtherLocked: '🔒 Другому',
      selectAmount: 'Выберите количество звезд:',
      enterCustomAmount: 'Ввести количество',
      usernameRequired:
        'Для покупки звезд необходимо установить username в настройках Telegram.',
      soon: '*soon',
      enterAmountPrompt:
        'Введите количество звезд (минимум 500, максимум 200000):',
      invalidAmount: 'Неверное количество. Введите число от 500 до 200000.',
      selectedAmount: 'Выбрано: {amount} звезд',
    },
    errors: {
      usernameRequired:
        '❌ Для покупки звезд необходимо установить username в настройках Telegram.\n\n' +
        'Как установить username:\n' +
        '1. Откройте настройки Telegram\n' +
        '2. Перейдите в раздел "Имя пользователя"\n' +
        '3. Установите уникальный username\n\n' +
        'После установки username попробуйте снова.',
    },
  },
  en: {
    mainMenu: {
      title: 'Welcome! Choose an action:',
      help: 'Help',
      buyStars: 'Buy Stars',
      back: '← Back',
    },
    help: {
      title: '📚 Help',
      description:
        'This bot allows you to buy Telegram Stars at a better price.\n\n' +
        "Telegram Stars is Telegram's internal currency that can be used to purchase subscriptions, stickers, and other items in Telegram.\n\n" +
        'We offer Stars cheaper than the official price.\n\n' +
        'Subscribe to our channel for news and updates:',
      channelLink: '📢 OneZee Channel',
    },
    buyStars: {
      selectRecipient: 'Select star recipient:',
      forMyself: 'Myself',
      forOther: 'Other',
      forOtherLocked: '🔒 Other',
      selectAmount: 'Select the number of stars:',
      enterCustomAmount: 'Enter custom amount',
      usernameRequired:
        'To buy stars, you need to set a username in Telegram settings.',
      soon: '*soon',
      enterAmountPrompt:
        'Enter the number of stars (minimum 500, maximum 200000):',
      invalidAmount: 'Invalid amount. Enter a number between 500 and 200000.',
      selectedAmount: 'Selected: {amount} stars',
    },
    errors: {
      usernameRequired:
        '❌ To buy stars, you need to set a username in Telegram settings.\n\n' +
        'How to set username:\n' +
        '1. Open Telegram settings\n' +
        '2. Go to "Username" section\n' +
        '3. Set a unique username\n\n' +
        'After setting the username, please try again.',
    },
  },
};

export function getLanguage(languageCode?: string): string {
  if (!languageCode) return 'en';
  const lang = languageCode.toLowerCase().split('-')[0];
  return lang === 'ru' ? 'ru' : 'en';
}

export function getTranslations(languageCode?: string): Translations {
  const lang = getLanguage(languageCode);
  return translations[lang] || translations.en;
}
