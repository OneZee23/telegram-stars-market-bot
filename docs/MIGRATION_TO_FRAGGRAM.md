# Миграция на fraggram.ru

## Идея

Перенести всю инфраструктуру телеграм магазина на новый сервер с доменом `fraggram.ru`.

## Что нужно сделать

### 1. Инфраструктура

- Новый сервер для развертывания приложения
- Домен `fraggram.ru` с настройкой DNS (A-запись)
- Nginx reverse proxy с SSL (Let's Encrypt)
- Docker Compose для оркестрации сервисов

### 2. Docker Compose структура

- Приложение (NestJS)
- PostgreSQL (БД)
- Nginx (reverse proxy + SSL)
- Возможно Redis (если понадобится)

### 3. Конфигурация

- Обновить `PUBLIC_URL` на `https://fraggram.ru`
- Настроить webhook URL для ЮКассы: `https://fraggram.ru/api/payment/webhook`
- Настроить webhook URL для Telegram: `https://fraggram.ru/telegram/webhook`

### 4. Миграция данных

- Экспорт БД со старого сервера
- Импорт на новый сервер
- Проверка целостности данных

### 5. Деплой

- Настроить CI/CD для автоматического деплоя
- Или ручной деплой через Docker Compose

## Файлы для создания

- `docker-compose.yml` - основная конфигурация
- `docker-compose.prod.yml` - production overrides
- `nginx/nginx.conf` - конфигурация Nginx
- `nginx/ssl/` - SSL сертификаты (или Let's Encrypt)
- `.env.production` - production переменные окружения
- `Dockerfile` - образ приложения (если нужен)

## Примечания

- Сделать отдельно, после завершения интеграции ЮКассы
- Убедиться, что все сервисы работают корректно перед миграцией
- Настроить мониторинг и логирование на новом сервере
