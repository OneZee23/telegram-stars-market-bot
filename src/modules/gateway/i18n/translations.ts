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
    testModeSelectAmount: string;
    enterCustomAmount: string;
    usernameRequired: string;
    soon: string;
    enterAmountPrompt: string;
    invalidAmount: string;
    selectedAmount: string;
    processing: string;
    testPurchaseSuccess: string;
    purchaseError: string;
    notInWhitelist: string;
    alreadyClaimed: string;
    queueBusy: string;
    only50StarsAvailable: string;
    insufficientBalance: string;
    paymentRequired: string;
    payButton: string;
    purchaseProcessing: string;
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
      selectAmount:
        'Пожалуйста, выберите количество Telegram Stars, используя кнопки ниже:',
      testModeSelectAmount:
        '🎁 Тестовый режим\n\nВы можете получить 50 звезд бесплатно (только один раз):',
      enterCustomAmount: 'Ввести количество',
      usernameRequired:
        'Для покупки звезд необходимо установить username в настройках Telegram.',
      soon: '*soon',
      enterAmountPrompt:
        'Введите количество звезд (минимум 500, максимум 200000):',
      invalidAmount: 'Неверное количество. Введите число от 500 до 200000.',
      selectedAmount: 'Выбрано: {amount} звезд',
      processing: '⏳ Обработка запроса...',
      testPurchaseSuccess:
        '✅ Спасибо за тестирование!\n\n' +
        'Звезды скоро придут на ваш аккаунт. Пожалуйста, проверьте:\n' +
        '• Сообщения от Telegram\n' +
        '• Баланс звезд в настройках\n\n' +
        'Если что-то пошло не так, сообщите об этом в группе {channel} в комментариях к посту дня 14/30 челленджа: {post}',
      purchaseError: '❌ Ошибка при покупке: {error}',
      notInWhitelist:
        '🔒 Доступ ограничен\n\n' +
        'В данный момент тестирование доступно только для пользователей из whitelist.\n\n' +
        'Ваш User ID: `{userId}`\n\n' +
        'Чтобы попасть в whitelist для тестирования:\n' +
        '1. Перейдите в канал {channel}\n' +
        '2. Найдите пост дня 14/30 челленджа: {post}\n' +
        '3. Узнайте подробности о том, как добавить себя в whitelist\n\n' +
        'После добавления в whitelist вы сможете получить 50 звезд бесплатно!',
      alreadyClaimed:
        '🚫 Тестовые звезды уже получены\n\n' +
        'Вы уже получили 50 тестовых звезд. Тестирование доступно только один раз.\n\n' +
        'Следите за новостями в канале {channel} и в посте дня 14/30 челленджа: {post}',
      queueBusy:
        '⏳ Очередь занята\n\n' +
        'В данный момент обрабатывается другая покупка. Пожалуйста, попробуйте через несколько секунд.\n\n' +
        'Система обрабатывает покупки последовательно, чтобы избежать ошибок.',
      only50StarsAvailable:
        '🎁 Тестовый режим\n\n' +
        'В данный момент для тестирования доступна только покупка 50 звезд.\n\n' +
        'Вернитесь назад и выберите "50 ⭐" для получения бесплатных тестовых звезд.',
      insufficientBalance:
        '❌ Недостаточно средств\n\n' +
        'На сервере недостаточно средств для обработки покупки. Пожалуйста, попробуйте позже или свяжитесь с администратором @onezee123.',
      paymentRequired:
        '💳 Оплата {amount} звезд\n\n' +
        'Нажмите кнопку ниже для оплаты через ЮKassa (СБП):',
      payButton: '💳 Оплатить через ЮKassa',
      purchaseProcessing:
        '⏳ Идет покупка и отправка звезд...\n\n' +
        'Пожалуйста, подождите от 1 минуты до 5 минут (в редких случаях).\n\n' +
        'Если процесс займет дольше, напишите администратору: @onezee123',
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
      selectAmount:
        'Please select the quantity of Telegram Stars using the buttons below:',
      testModeSelectAmount:
        '🎁 Test Mode\n\nYou can get 50 stars for free (one time only):',
      enterCustomAmount: 'Enter custom amount',
      usernameRequired:
        'To buy stars, you need to set a username in Telegram settings.',
      soon: '*soon',
      enterAmountPrompt:
        'Enter the number of stars (minimum 500, maximum 200000):',
      invalidAmount: 'Invalid amount. Enter a number between 500 and 200000.',
      selectedAmount: 'Selected: {amount} stars',
      processing: '⏳ Processing request...',
      testPurchaseSuccess:
        '✅ Thank you for testing!\n\n' +
        'Stars will arrive on your account soon. Please check:\n' +
        '• Messages from Telegram\n' +
        '• Stars balance in settings\n\n' +
        'If something went wrong, please report it in the group {channel} in the comments to the post of day 14/30 challenge: {post}',
      purchaseError: '❌ Purchase error: {error}',
      notInWhitelist:
        '🔒 Access Restricted\n\n' +
        'Currently, testing is only available for whitelisted users.\n\n' +
        'Your User ID: `{userId}`\n\n' +
        'To get whitelisted for testing:\n' +
        '1. Go to channel {channel}\n' +
        '2. Find the post of day 14/30 challenge: {post}\n' +
        '3. Learn how to add yourself to the whitelist\n\n' +
        'After being added to the whitelist, you will be able to get 50 stars for free!',
      alreadyClaimed:
        '🚫 Test stars already claimed\n\n' +
        'You have already received 50 test stars. Testing is available only once.\n\n' +
        'Follow the news in channel {channel} and in the post of day 14/30 challenge: {post}',
      queueBusy:
        '⏳ Queue is busy\n\n' +
        'Another purchase is currently being processed. Please try again in a few seconds.\n\n' +
        'The system processes purchases sequentially to avoid errors.',
      only50StarsAvailable:
        '🎁 Test Mode\n\n' +
        'Currently, only 50 stars purchase is available for testing.\n\n' +
        'Go back and select "50 ⭐" to get free test stars.',
      insufficientBalance:
        '❌ Insufficient funds\n\n' +
        'Server has insufficient funds to process the purchase. Please try again later or contact administrator @onezee123.',
      paymentRequired:
        '💳 Payment for {amount} stars\n\n' +
        'Click the button below to pay via YooKassa (SBP):',
      payButton: '💳 Pay via YooKassa',
      purchaseProcessing:
        '⏳ Purchase and sending stars in progress...\n\n' +
        'Please wait from 1 minute to 5 minutes (in rare cases).\n\n' +
        'If the process takes longer, contact administrator: @onezee123',
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
