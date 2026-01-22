# ⭐ Telegram Stars Shop

> Automated Telegram Stars marketplace — 25-34% cheaper than official prices

**Status:** 🚧 MVP in Development | **Started:** Dec 19, 2025 | **Format:** Proof of Work

---

## TL;DR

Telegram Stars can be bought via Fragment for $0.015/star vs $0.024/star on Apple/Google Play (30-40% difference). This bot automates the process: buys Stars via Fragment API using TON and sells them to users cheaper with SBP/card payments.

**Target audience:** Russian-speaking Telegram users (initially).

---

## The Idea

The project started with a simple observation: Telegram Stars are available through Fragment at $0.015/star, while official stores charge $0.024/star — a 30-40% markup.

However, buying via Fragment requires KYC, a TON wallet, and crypto knowledge — a high entry barrier.

**Solution:** An automated shop that purchases Stars via Fragment (TON) and resells them below official prices, accepting SBP/card payments.

First post: [Day 0/30 in Telegram channel](https://t.me/onezee_co)

Development follows a "Proof of Work" format: the entire process from idea to first sales is documented openly.

---

## Economics

- **Cost basis:** ~0.67 ₽/⭐ (via Fragment, USDT → TON swap)
- **Sale price:** ~0.79 ₽/⭐ for 50 stars (~20% markup)
- **User savings:** ~12-15% vs Apple/Google Play and competitors

### MVP Goal

At least 1 real sale within 30 days from start (by Jan 18, 2026).

---

## Tech Stack

```
Backend:     TypeScript, NestJS
Database:    PostgreSQL, TypeORM
Bot:         Telegram Bot API (Inline buttons)
Payments:    YooKassa (SBP, cards)
Crypto:      Fragment API, TON
Infra:       Docker, DigitalOcean, Grafana
```

---

## Documentation

Full project documentation is in [`docs/`](./docs/):

| Document | Description |
|----------|-------------|
| [📋 Business Requirements](./docs/BUSINESS_REQUIREMENTS.md) | Functional & non-functional requirements, profitability analysis, target audience |
| [🔧 Technical Specification](./docs/TECHNICAL_SPECIFICATION.md) | Architecture, tech stack, system components, integrations, deployment |
| [⚠️ Edge Cases](./docs/EDGE_CASES.md) | Edge cases, error handling, system scenarios, monitoring |

---

## Quick Start

### Running Tests

1. **Start PostgreSQL in Docker:**

   ```bash
   docker run -d \
     --name telegram-stars-market-postgres \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=postgres \
     -p 5432:5432 \
     postgres
   ```

2. **Create `.env` file in project root:**

    ```env
    ENV=dev
    PORT=3000
    APP_NAME=telegram-stars-market-service

    # Use for local dev: lt --port 3000 or ngrok
    PUBLIC_URL=https://asd.ngrok-free.app

    DB_HOST=localhost
    DB_PORT=5432
    DB_NAME=postgres
    DB_USER=postgres
    DB_PASS=postgres
    DB_LOG=false
    DB_SYNC=false
    DB_MIGRATE=false

    TYPEORM_CLI_HOST=localhost
    TYPEORM_CLI_PORT=5432
    TYPEORM_CLI_USERNAME=postgres
    TYPEORM_CLI_PASSWORD=postgres
    TYPEORM_CLI_DATABASE=postgres

    # Telegram bot config (test values OK)
    BOT_TOKEN=8001958772:asd
    TELEGRAM_WEBHOOK_API_KEY=asd

    # Fragment API config
    # Get cookies and API hash after manual auth on fragment.com
    # See docs for detailed instructions
    FRAGMENT_COOKIES={"stel_ssid":"...","stel_ton_token":"..."}
    FRAGMENT_API_HASH=...
    FRAGMENT_MNEMONIC=word1 word2 ... word24
    TONCENTER_RPC_URL=https://toncenter.com/api/v2/jsonRPC
    TONCENTER_RPC_API_KEY=...

    # DEX config (USDT → TON swap)
    DEX_PROVIDER=stonfi
    USDT_JETTON_ADDRESS=EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs
    SWAP_SLIPPAGE_TOLERANCE=1
    SWAP_RESERVE_PERCENT=5
    MIN_TON_FOR_FEES=100000000

    # Pricing config
    USD_RUB_RATE=78
    PRICE_50_STARS_USD=0.75
    USDT_RESERVE_MULTIPLIER=1.133
    ACQUIRER_FEE_PERCENT=3
    AVAILABLE_STAR_AMOUNTS=50
    ```

3. **Run tests:**

**Via VSCode/Cursor Testing:**
- Open any test file (e.g., `test/e2e/app.e2e.spec.ts`)
- Click "Run Test" or use Testing panel in Cursor
- Tests run automatically using `.env` settings

**Via CLI:**

  ```bash
  # All e2e tests
  npm run test:e2e

  # Unit tests
  npm test

  # Coverage
  npm run test:cov
  ```

## Implemented Features

### ✅ Fragment API Integration

- Purchase Telegram Stars via Fragment API
- Sign and send transactions to TON blockchain
- Cookie and API hash management for auth
- Rate limit and error handling
- USDT → TON swap via Ston.Fi (Omniston SDK) for cost optimization

### ✅ Telegram Bot

- `/start` command with main menu
- Inline buttons for navigation
- Recipient selection (self/other)
- Star amount selection (dynamic config, min 50)
- Purchase flow: USDT balance check → payment → whitelist/claim validation → USDT→TON swap → Fragment purchase
- Multi-language (Russian/English)
- Bot: [@fraggram_bot](https://t.me/fraggram_bot)

### ✅ Database

- User storage (`UserEntity`)
- Purchase storage (`StarsPurchaseEntity`)
- Purchase status tracking (PENDING, PROCESSING, COMPLETED, FAILED)
- Query optimization indexes

### ✅ Whitelist System

- Whitelist management via `assets/whitelist.txt`
- Auto-sync on app startup
- Test purchase of 50 stars for whitelist users (one-time)
- Whitelist check on star amount selection

### ✅ User Handling

- Auto-create users in DB on first interaction
- Metadata updates (username, language)
- Logging of all bot interactions

### ✅ Concurrent Purchase Protection

- `isProcessingPurchase` flag prevents simultaneous purchases
- `QUEUE_BUSY` error on parallel purchase attempts
- Re-check USDT balance before purchase (race condition protection)
- In-memory transaction queue (TODO: replace with RabbitMQ for production and for more productivity)

### ✅ Proxy Management

- Dynamic multi-proxy system with auto failover
- Proxy health tracking
- Proxy expiration alerts

### ✅ Payment Integration (YooKassa)

- YooKassa payment gateway integration
- SBP and card payments
- Webhook handling for payment status updates
- Payment entity tracking
- Receipt generation

### ✅ Monitoring

- Public channel [@fraggram_alerts](https://t.me/fraggram_alerts) for alerts and stats
- Logging of all purchases, errors, and important events
- Real-time system transparency

---

## Roadmap for MVP

### Completed ✅

- [x] Market and competitor analysis
- [x] Business requirements and technical spec
- [x] MVP Development
  - [x] Telegram Bot (Inline buttons)
  - [x] Backend API (NestJS)
  - [x] Fragment API integration
  - [x] Database for purchase storage
  - [x] Whitelist system for testing
  - [x] User handling on interaction
  - [x] Interaction logging
  - [x] USDT → TON swap via Ston.Fi
  - [x] Monitoring via Telegram channel
  - [x] Proxy optimization with failover
  - [x] E2E tests for user flow
  - [x] YooKassa payment integration

### In Progress 🚧

- [ ] Final pricing calculations and price list (100, 200 and more stars)
- [ ] Business registration (IP)
- [ ] Production payment gateway setup
- [ ] Beta testing
- [ ] MVP launch

---

## Development Format

The project is developed openly (open-source) in a "Proof of Work" format:

- All stages are documented
- Code is published in this repository
- Progress is tracked in daily posts in [Telegram channel](https://t.me/onezee_co)
- Project status notifications go to public [dev group](https://t.me/fraggram_alerts)
- Can be run locally and contribute to development

---

## Contributing

The project is actively under development. If you want to help or have questions — create Issues or PRs.

You can run the project locally and test it. Environment setup instructions will be added later.

---

## License

MIT

---

## Links

- [Telegram Channel](https://t.me/onezee_co) — daily progress
- [YouTube](https://www.youtube.com/c/onezee) — final video will be here
