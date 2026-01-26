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
    emailRequired: string;
    invalidEmail: string;
    paymentCreated: string;
    paymentSuccess: string;
    purchaseCompleted: string;
    purchaseProcessing: string;
  };
  errors: {
    usernameRequired: string;
  };
  consent: {
    title: string;
    request: string;
    readMore: string;
    accept: string;
    accepted: string;
  };
  helpMenu: {
    title: string;
    offer: string;
    offerText: string;
    privacy: string;
    privacyText: string;
    contacts: string;
    contactsText: string;
    faq: string;
    faqText: string;
    revoke: string;
    revokeWarning: string;
    revokeConfirm: string;
    revokeSuccess: string;
    cancel: string;
    back: string;
  };
  delivery: {
    completed: string;
    refundNotice: string;
  };
  sellerInfo: {
    prePayment: string;
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
      emailRequired:
        '📧 Для оплаты через ЮKassa требуется email адрес\n\n' +
        'Пожалуйста, введите ваш email адрес:',
      invalidEmail:
        '❌ Неверный email адрес. Пожалуйста, введите корректный email.',
      paymentCreated:
        '✅ Платеж создан!\n\n' +
        '✨ Количество: {amount} ⭐\n' +
        '💰 Сумма: {price}\n\n' +
        'Нажмите кнопку ниже для перехода к оплате.\n\n' +
        '———\n' +
        '💡 Если вы оплатили, но звёзды не пришли — напишите нам: @onezee123 (ответ в течение 24ч).\n' +
        'Если дольше — пишите в группу @onezee\\_co.',
      paymentSuccess:
        '✅ Оплата успешно получена!\n\n' +
        '✨ Количество: {amount} ⭐\n' +
        '💰 Сумма: {price}\n\n' +
        '⏳ Идет процесс клейминга звезд...\n\n' +
        'Пожалуйста, подождите от 1 минуты до 5 минут.',
      purchaseCompleted:
        '✅ Покупка успешно завершена!\n\n' +
        '✨ Количество: {amount} ⭐\n' +
        '💰 Сумма: {price}\n\n' +
        '🎉 Звезды успешно отправлены получателю!',
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
    consent: {
      title: '🔒 Согласие на обработку персональных данных',
      request:
        '🔒 *Согласие на обработку персональных данных*\n\n' +
        'Для использования бота необходимо ваше согласие на обработку персональных данных в соответствии с ФЗ-152.\n\n' +
        '*Какие данные мы обрабатываем:*\n' +
        '• Telegram ID и username\n' +
        '• Email (для чека)\n' +
        '• Данные о заказах\n\n' +
        'Данные хранятся в России и не передаются третьим лицам, кроме платёжной системы для проведения оплаты.',
      readMore: '📋 Подробнее',
      accept: '✅ Даю согласие',
      accepted: '✅ Спасибо! Согласие на обработку персональных данных принято.',
    },
    helpMenu: {
      title: '📄 Помощь',
      offer: '📋 Оферта',
      offerText:
        '📋 *Договор публичной оферты*\n\n' +
        'Определяет условия покупки цифровых товаров.\n\n' +
        '*Ключевые положения:*\n' +
        '• Товар доставляется мгновенно после оплаты\n' +
        '• Возврат до получения товара — в любой момент\n' +
        '• После получения товара возврат невозможен\n' +
        '• Претензии: 7 дней с момента оплаты\n\n' +
        '👉 Читать полностью: {offerUrl}\n\n' +
        '———\n' +
        'ИП Шевелев Н.А. | ИНН 231220115444',
      privacy: '🔒 Политика конфиденциальности',
      privacyText:
        '🔒 *Политика конфиденциальности*\n\n' +
        '*Какие данные собираем:*\n' +
        '• Telegram ID, username\n' +
        '• Email (для чека)\n\n' +
        '*Зачем:*\n' +
        '• Исполнение заказов\n' +
        '• Отправка чеков по 54-ФЗ\n\n' +
        'Данные хранятся в России 🇷🇺\n' +
        'Не продаём и не передаём третьим лицам.\n\n' +
        '👉 Читать полностью: {privacyUrl}',
      contacts: '📞 Контакты',
      contactsText:
        '📞 *Контакты*\n\n' +
        '📧 Email: {supportEmail}\n' +
        '💬 Telegram: {supportTelegram}\n\n' +
        'Время ответа: до 24 часов\n\n' +
        '———\n' +
        'ИП Шевелев Никита Алексеевич\n' +
        'ИНН: 231220115444\n' +
        'ОГРНИП: 326237500027151\n' +
        'г. Краснодар',
      faq: '❓ FAQ',
      faqText:
        '❓ *Часто задаваемые вопросы*\n\n' +
        '*Как быстро придут звёзды?*\n' +
        'Мгновенно после оплаты. В редких случаях до 5 минут.\n\n' +
        '*Можно вернуть деньги?*\n' +
        'До получения — да. После — нет (цифровой товар).\n\n' +
        '*Безопасно ли платить?*\n' +
        'Да. Сертифицированный эквайринг Robokassa, чек по 54-ФЗ.\n\n' +
        '*Почему дешевле App Store?*\n' +
        'Без комиссии Apple/Google (30-40%).\n\n' +
        '*Какие данные собираете?*\n' +
        'Telegram ID и email для чека.\n\n' +
        '*Как удалить мои данные?*\n' +
        'Напишите {supportTelegram} или нажмите "Отозвать согласие".',
      revoke: '🚫 Отозвать согласие',
      revokeWarning:
        '⚠️ *Отзыв согласия на обработку данных*\n\n' +
        'После отзыва:\n' +
        '• Вы не сможете пользоваться ботом\n' +
        '• Ваши данные будут удалены в течение 30 дней\n' +
        '• Данные о платежах сохранятся 5 лет (требование закона)\n\n' +
        'Вы уверены?',
      revokeConfirm: '🚫 Да, отозвать',
      revokeSuccess:
        '✅ Согласие на обработку персональных данных отозвано.\n\n' +
        'Для продолжения использования бота отправьте /start',
      cancel: '◀️ Отмена',
      back: '◀️ Назад',
    },
    delivery: {
      completed:
        '✅ *Заказ выполнен!*\n\n' +
        '📦 Получено: {amount} Stars\n' +
        '💰 Сумма: {price}\n\n' +
        '———\n' +
        '📋 *Условия возврата:*\n' +
        'Согласно п. 4 ст. 26.1 Закона о защите прав потребителей, ' +
        'цифровой товар с индивидуальными свойствами возврату не подлежит после доставки.\n\n' +
        'По вопросам: {supportTelegram}\n\n' +
        'Спасибо за покупку!',
      refundNotice:
        'Возврат возможен, если товар не был получен. ' +
        'Срок обращения: 7 дней. Контакт: {supportTelegram}',
    },
    sellerInfo: {
      prePayment:
        '———\n' +
        '🏪 *Продавец:* ИП Шевелев Н.А.\n' +
        '📄 ИНН: 231220115444\n\n' +
        'Нажимая "Оплатить", вы соглашаетесь с [офертой]({offerUrl}).',
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
      emailRequired:
        '📧 Email address required for YooKassa payment\n\n' +
        'Please enter your email address:',
      invalidEmail: '❌ Invalid email address. Please enter a valid email.',
      paymentCreated:
        '✅ Payment created!\n\n' +
        '✨ Amount: {amount} ⭐\n' +
        '💰 Price: {price}\n\n' +
        'Click the button below to proceed to payment.\n\n' +
        '———\n' +
        '💡 If you paid but stars didn\'t arrive — contact us: @onezee123 (response within 24h).\n' +
        'If longer — write to @onezee\\_co group.',
      paymentSuccess:
        '✅ Payment received successfully!\n\n' +
        '✨ Amount: {amount} ⭐\n' +
        '💰 Price: {price}\n\n' +
        '⏳ Claiming stars in progress...\n\n' +
        'Please wait from 1 minute to 5 minutes.',
      purchaseCompleted:
        '✅ Purchase successfully completed!\n\n' +
        '✨ Amount: {amount} ⭐\n' +
        '💰 Price: {price}\n\n' +
        '🎉 Stars have been successfully sent to the recipient!',
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
    consent: {
      title: '🔒 Personal Data Processing Consent',
      request:
        '🔒 *Personal Data Processing Consent*\n\n' +
        'To use this bot, you need to consent to personal data processing in accordance with Russian law (FZ-152).\n\n' +
        '*What data we process:*\n' +
        '• Telegram ID and username\n' +
        '• Email (for receipts)\n' +
        '• Order data\n\n' +
        'Data is stored in Russia and not shared with third parties except payment processor.',
      readMore: '📋 Read more',
      accept: '✅ I consent',
      accepted: '✅ Thank you! Personal data processing consent accepted.',
    },
    helpMenu: {
      title: '📄 Help',
      offer: '📋 Terms of Service',
      offerText:
        '📋 *Terms of Service*\n\n' +
        'Defines the conditions for purchasing digital goods.\n\n' +
        '*Key points:*\n' +
        '• Product delivered instantly after payment\n' +
        '• Refund before delivery — anytime\n' +
        '• No refund after delivery\n' +
        '• Claims: 7 days from payment\n\n' +
        '👉 Read full: {offerUrl}\n\n' +
        '———\n' +
        'IE Shevelev N.A. | TIN 231220115444',
      privacy: '🔒 Privacy Policy',
      privacyText:
        '🔒 *Privacy Policy*\n\n' +
        '*Data we collect:*\n' +
        '• Telegram ID, username\n' +
        '• Email (for receipts)\n\n' +
        '*Purpose:*\n' +
        '• Order fulfillment\n' +
        '• Receipt issuance (54-FZ)\n\n' +
        'Data stored in Russia 🇷🇺\n' +
        'We do not sell or share with third parties.\n\n' +
        '👉 Read full: {privacyUrl}',
      contacts: '📞 Contacts',
      contactsText:
        '📞 *Contacts*\n\n' +
        '📧 Email: {supportEmail}\n' +
        '💬 Telegram: {supportTelegram}\n\n' +
        'Response time: up to 24 hours\n\n' +
        '———\n' +
        'IE Shevelev Nikita Alekseevich\n' +
        'TIN: 231220115444\n' +
        'OGRNIP: 326237500027151\n' +
        'Krasnodar, Russia',
      faq: '❓ FAQ',
      faqText:
        '❓ *Frequently Asked Questions*\n\n' +
        '*How fast will stars arrive?*\n' +
        'Instantly after payment. Rarely up to 5 minutes.\n\n' +
        '*Can I get a refund?*\n' +
        'Before delivery — yes. After — no (digital goods).\n\n' +
        '*Is it safe to pay?*\n' +
        'Yes. Certified payment processor with receipt.\n\n' +
        '*Why cheaper than App Store?*\n' +
        'No Apple/Google commission (30-40%).\n\n' +
        '*What data do you collect?*\n' +
        'Telegram ID and email for receipt.\n\n' +
        '*How to delete my data?*\n' +
        'Contact {supportTelegram} or click "Revoke consent".',
      revoke: '🚫 Revoke consent',
      revokeWarning:
        '⚠️ *Revoke Data Processing Consent*\n\n' +
        'After revoking:\n' +
        "• You won't be able to use the bot\n" +
        '• Your data will be deleted within 30 days\n' +
        '• Payment data kept 5 years (legal requirement)\n\n' +
        'Are you sure?',
      revokeConfirm: '🚫 Yes, revoke',
      revokeSuccess:
        '✅ Personal data processing consent revoked.\n\n' +
        'To continue using the bot, send /start',
      cancel: '◀️ Cancel',
      back: '◀️ Back',
    },
    delivery: {
      completed:
        '✅ *Order completed!*\n\n' +
        '📦 Received: {amount} Stars\n' +
        '💰 Amount: {price}\n\n' +
        '———\n' +
        '📋 *Refund policy:*\n' +
        'Digital goods with individual properties are not refundable after delivery ' +
        '(Consumer Protection Law, Art. 26.1).\n\n' +
        'Questions: {supportTelegram}\n\n' +
        'Thank you for your purchase!',
      refundNotice:
        'Refund available if product not received. ' +
        'Contact within 7 days: {supportTelegram}',
    },
    sellerInfo: {
      prePayment:
        '———\n' +
        '🏪 *Seller:* IE Shevelev N.A.\n' +
        '📄 TIN: 231220115444\n\n' +
        'By clicking "Pay", you agree to the [terms]({offerUrl}).',
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
