# 📊 База данных: Telegram Stars Shop

Документ только лишь для ознакомления и сохранения контекста по тому, как будет в будущем выглядеть база данных.
Далее документ удалится.

## ER-диаграмма

```
┌─────────────────┐
│     users       │
├─────────────────┤
│ id (PK)         │
│ telegramId      │───────────────┐
│ username        │               │
│ firstName       │               │
│ totalSpentRub   │               │
│ totalStars      │               │
│ ordersCount     │               │
└─────────────────┘               │
                                  │
                                  ▼
┌─────────────────┐         ┌─────────────────┐
│    payments     │◄────────│     orders      │
├─────────────────┤   1:1   ├─────────────────┤
│ id (PK)         │         │ id (PK)         │
│ orderId (FK)    │         │ orderNumber     │
│ externalId      │         │ userId (FK)     │────►
│ method          │         │ recipientTgId   │
│ status          │         │ starsAmount     │
│ amountRub       │         │ pricePerStar    │
│ feeRub          │         │ costPerStar     │
│ paidAt          │         │ totalPriceRub   │
└─────────────────┘         │ totalCostRub    │
                            │ profitRub       │
                            │ tonUsdRate      │
                            │ usdRubRate      │
┌─────────────────┐         │ status          │
│  crypto_swaps   │◄────────│ createdAt       │
├─────────────────┤   1:1   │ completedAt     │
│ id (PK)         │         └─────────────────┘
│ orderId (FK)    │                 │
│ fromCurrency    │                 │
│ fromAmount      │                 │
│ toCurrency      │                 │
│ toAmount        │                 │
│ rate            │                 │
│ txHash          │                 │
│ dexName         │                 │
│ status          │                 │
└─────────────────┘                 │
                                    │
┌─────────────────┐                 │
│ stars_purchases │◄────────────────┘
├─────────────────┤   1:1
│ id (PK)         │
│ orderId (FK)    │
│ starsAmount     │
│ tonSpent        │
│ recipientTgId   │
│ fragmentTxHash  │
│ status          │
└─────────────────┘


┌─────────────────┐         ┌─────────────────┐
│ rate_snapshots  │         │  tax_reports    │
├─────────────────┤         ├─────────────────┤
│ id (PK)         │         │ id (PK)         │
│ tonUsd          │         │ period          │
│ usdRub          │         │ totalRevenue    │
│ starCostRub     │         │ totalCost       │
│ createdAt       │         │ taxUsn6         │
└─────────────────┘         │ netProfit       │
                            └─────────────────┘

┌─────────────────┐
│ wallet_balances │
├─────────────────┤
│ id (PK)         │
│ walletAddress   │
│ usdtBalance     │
│ tonBalance      │
│ totalValueRub   │
│ recordedAt      │
└─────────────────┘
```

---

## SQL: Полезные запросы для отчётов

### 1. Ежедневная выручка и прибыль

```sql
SELECT 
  DATE(o.created_at) as date,
  COUNT(*) as orders_count,
  SUM(o.stars_amount) as stars_sold,
  SUM(o.total_price_rub) as revenue,
  SUM(o.total_cost_rub) as cost,
  SUM(o.profit_rub) as gross_profit,
  SUM(o.total_price_rub) * 0.06 as tax_usn,
  SUM(p.fee_rub) as acquiring_fees,
  SUM(o.profit_rub) - SUM(o.total_price_rub) * 0.06 - COALESCE(SUM(p.fee_rub), 0) as net_profit
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
WHERE o.status = 'completed'
GROUP BY DATE(o.created_at)
ORDER BY date DESC;
```

### 2. Месячный отчёт для налоговой

```sql
SELECT 
  DATE_FORMAT(o.created_at, '%Y-%m') as month,
  COUNT(*) as orders_count,
  SUM(o.total_price_rub) as total_revenue,
  SUM(o.total_price_rub) * 0.06 as tax_usn_6_percent,
  SUM(o.stars_amount) as total_stars_sold,
  AVG(o.price_per_star_rub) as avg_price_per_star,
  AVG(o.cost_per_star_rub) as avg_cost_per_star
FROM orders o
WHERE o.status = 'completed'
GROUP BY DATE_FORMAT(o.created_at, '%Y-%m')
ORDER BY month DESC;
```

### 3. Все операции за период (для документов)

```sql
SELECT 
  o.order_number,
  o.created_at,
  o.completed_at,
  u.telegram_id as buyer_telegram_id,
  u.username as buyer_username,
  o.recipient_telegram_id,
  o.recipient_username,
  o.stars_amount,
  o.price_per_star_rub,
  o.total_price_rub,
  o.cost_per_star_rub,
  o.total_cost_rub,
  o.profit_rub,
  o.ton_usd_rate,
  o.usd_rub_rate,
  p.method as payment_method,
  p.external_payment_id,
  p.fee_rub as acquiring_fee,
  cs.from_amount as usdt_spent,
  cs.to_amount as ton_received,
  cs.tx_hash as swap_tx_hash,
  sp.ton_spent as ton_for_stars,
  sp.fragment_tx_hash
FROM orders o
JOIN users u ON u.id = o.user_id
LEFT JOIN payments p ON p.order_id = o.id
LEFT JOIN crypto_swaps cs ON cs.order_id = o.id
LEFT JOIN stars_purchases sp ON sp.order_id = o.id
WHERE o.created_at BETWEEN '2025-01-01' AND '2025-12-31'
  AND o.status = 'completed'
ORDER BY o.created_at;
```

### 4. Крипто-операции (для документирования)

```sql
SELECT 
  cs.created_at,
  o.order_number,
  cs.from_currency,
  cs.from_amount,
  cs.to_currency,
  cs.to_amount,
  cs.rate as exchange_rate,
  cs.dex_name,
  cs.tx_hash,
  cs.tx_link,
  cs.network_fee,
  cs.slippage
FROM crypto_swaps cs
JOIN orders o ON o.id = cs.order_id
WHERE cs.status = 'completed'
ORDER BY cs.created_at DESC;
```

### 5. Топ покупателей

```sql
SELECT 
  u.telegram_id,
  u.username,
  u.first_name,
  u.orders_count,
  u.total_stars_purchased,
  u.total_spent_rub,
  u.created_at as first_purchase
FROM users u
WHERE u.orders_count > 0
ORDER BY u.total_spent_rub DESC
LIMIT 100;
```

### 6. Средние курсы по дням

```sql
SELECT 
  DATE(created_at) as date,
  AVG(ton_usd) as avg_ton_usd,
  AVG(usd_rub) as avg_usd_rub,
  AVG(star_cost_rub) as avg_star_cost,
  MIN(star_cost_rub) as min_star_cost,
  MAX(star_cost_rub) as max_star_cost
FROM rate_snapshots
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### 7. Экспорт для бухгалтерии (CSV-friendly)

```sql
SELECT 
  o.order_number as "Номер заказа",
  DATE_FORMAT(o.completed_at, '%d.%m.%Y') as "Дата",
  o.stars_amount as "Кол-во Stars",
  o.total_price_rub as "Сумма продажи (₽)",
  o.total_cost_rub as "Себестоимость (₽)",
  o.profit_rub as "Валовая прибыль (₽)",
  p.fee_rub as "Комиссия эквайринга (₽)",
  o.total_price_rub * 0.06 as "Налог УСН 6% (₽)",
  o.profit_rub - p.fee_rub - (o.total_price_rub * 0.06) as "Чистая прибыль (₽)",
  p.method as "Способ оплаты",
  p.external_payment_id as "ID платежа",
  cs.tx_hash as "TX USDT→TON",
  sp.fragment_tx_hash as "TX Fragment"
FROM orders o
LEFT JOIN payments p ON p.order_id = o.id
LEFT JOIN crypto_swaps cs ON cs.order_id = o.id
LEFT JOIN stars_purchases sp ON sp.order_id = o.id
WHERE o.status = 'completed'
  AND o.completed_at BETWEEN '2025-01-01' AND '2025-03-31'
ORDER BY o.completed_at;
```

---

## TypeORM: Примеры использования

### Создание заказа (полный flow)

```typescript
// src/services/order.service.ts

async createOrder(dto: CreateOrderDto): Promise<Order> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // 1. Получаем текущие курсы
    const rates = await this.ratesService.getCurrentRates();
    
    // 2. Рассчитываем цены
    const costPerStar = rates.starCostRub;
    const pricePerStar = costPerStar * (1 + this.MARKUP_PERCENT / 100);
    const totalPrice = pricePerStar * dto.starsAmount;
    const totalCost = costPerStar * dto.starsAmount;
    
    // 3. Создаём заказ
    const order = queryRunner.manager.create(Order, {
      orderNumber: await this.generateOrderNumber(),
      userId: dto.userId,
      recipientTelegramId: dto.recipientTelegramId,
      starsAmount: dto.starsAmount,
      pricePerStarRub: pricePerStar,
      costPerStarRub: costPerStar,
      totalPriceRub: totalPrice,
      totalCostRub: totalCost,
      profitRub: totalPrice - totalCost,
      tonUsdRate: rates.tonUsd,
      usdRubRate: rates.usdRub,
      starCostTon: rates.starCostTon,
      status: OrderStatus.CREATED,
    });
    
    await queryRunner.manager.save(order);
    
    // 4. Создаём платёж в ЮКассе
    const payment = await this.createPayment(queryRunner, order);
    
    await queryRunner.commitTransaction();
    
    return order;
    
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

### Обработка успешной оплаты

```typescript
async processPaymentSuccess(paymentId: string): Promise<void> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const payment = await queryRunner.manager.findOne(Payment, {
      where: { externalPaymentId: paymentId },
      relations: ['order'],
    });

    // 1. Обновляем статус платежа
    payment.status = PaymentStatus.SUCCEEDED;
    payment.paidAt = new Date();
    await queryRunner.manager.save(payment);

    // 2. Обновляем статус заказа
    const order = payment.order;
    order.status = OrderStatus.PAYMENT_RECEIVED;
    await queryRunner.manager.save(order);

    // 3. Запускаем swap USDT → TON
    const swap = await this.cryptoService.swapUsdtToTon(
      queryRunner,
      order,
    );

    // 4. Покупаем Stars на Fragment
    const purchase = await this.fragmentService.buyStars(
      queryRunner,
      order,
      swap.toAmount,
    );

    // 5. Финализируем заказ
    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();
    await queryRunner.manager.save(order);

    // 6. Обновляем статистику пользователя
    await queryRunner.manager.increment(
      User,
      { id: order.userId },
      'totalSpentRub',
      order.totalPriceRub,
    );
    await queryRunner.manager.increment(
      User,
      { id: order.userId },
      'totalStarsPurchased',
      order.starsAmount,
    );
    await queryRunner.manager.increment(
      User,
      { id: order.userId },
      'ordersCount',
      1,
    );

    await queryRunner.commitTransaction();

  } catch (error) {
    await queryRunner.rollbackTransaction();
    // Помечаем заказ как failed
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

### Генерация налогового отчёта

```typescript
async generateTaxReport(year: number, quarter: number): Promise<TaxReport> {
  const periodStart = new Date(year, (quarter - 1) * 3, 1);
  const periodEnd = new Date(year, quarter * 3, 0);

  const stats = await this.orderRepository
    .createQueryBuilder('o')
    .select('COUNT(*)', 'ordersCount')
    .addSelect('SUM(o.starsAmount)', 'totalStars')
    .addSelect('SUM(o.totalPriceRub)', 'totalRevenue')
    .addSelect('SUM(o.totalCostRub)', 'totalCost')
    .addSelect('SUM(o.profitRub)', 'grossProfit')
    .where('o.status = :status', { status: OrderStatus.COMPLETED })
    .andWhere('o.completedAt BETWEEN :start AND :end', {
      start: periodStart,
      end: periodEnd,
    })
    .getRawOne();

  const fees = await this.paymentRepository
    .createQueryBuilder('p')
    .select('SUM(p.feeRub)', 'totalFees')
    .innerJoin('p.order', 'o')
    .where('o.status = :status', { status: OrderStatus.COMPLETED })
    .andWhere('o.completedAt BETWEEN :start AND :end', {
      start: periodStart,
      end: periodEnd,
    })
    .getRawOne();

  const taxUsn6 = stats.totalRevenue * 0.06;
  const netProfit = stats.grossProfit - taxUsn6 - (fees.totalFees || 0);

  const report = this.taxReportRepository.create({
    period: `${year}-Q${quarter}`,
    periodStart,
    periodEnd,
    totalRevenueRub: stats.totalRevenue,
    ordersCount: stats.ordersCount,
    totalStarsSold: stats.totalStars,
    totalCostRub: stats.totalCost,
    totalFeesRub: fees.totalFees || 0,
    taxUsn6,
    grossProfit: stats.grossProfit,
    netProfit,
  });

  return this.taxReportRepository.save(report);
}
```

---

## Миграция: создание таблиц

```typescript
// src/migrations/1735500000000-CreateStarsShopTables.ts

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStarsShopTables1735500000000 implements MigrationInterface {
  name = 'CreateStarsShopTables1735500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Users
    await queryRunner.query(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        is_premium BOOLEAN DEFAULT false,
        total_spent_rub DECIMAL(12,2) DEFAULT 0,
        total_stars_purchased INT DEFAULT 0,
        orders_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Orders
    await queryRunner.query(`
      CREATE TYPE order_status AS ENUM (
        'created', 'payment_pending', 'payment_received',
        'swap_pending', 'swap_completed',
        'stars_pending', 'stars_sent',
        'completed', 'failed', 'refunded', 'cancelled'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number VARCHAR(50) UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id),
        recipient_telegram_id BIGINT NOT NULL,
        recipient_username VARCHAR(255),
        stars_amount INT NOT NULL,
        price_per_star_rub DECIMAL(10,4) NOT NULL,
        cost_per_star_rub DECIMAL(10,4) NOT NULL,
        total_price_rub DECIMAL(12,2) NOT NULL,
        total_cost_rub DECIMAL(12,2) NOT NULL,
        profit_rub DECIMAL(12,2) NOT NULL,
        ton_usd_rate DECIMAL(10,4) NOT NULL,
        usd_rub_rate DECIMAL(10,4) NOT NULL,
        star_cost_ton DECIMAL(10,6) NOT NULL,
        status order_status DEFAULT 'created',
        fail_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // Payments
    await queryRunner.query(`
      CREATE TYPE payment_status AS ENUM (
        'pending', 'waiting_for_capture', 'succeeded', 'cancelled', 'refunded'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE payment_method AS ENUM (
        'yookassa', 'sbp', 'bank_card', 'crypto'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID UNIQUE REFERENCES orders(id),
        external_payment_id VARCHAR(255),
        method payment_method NOT NULL,
        status payment_status DEFAULT 'pending',
        amount_rub DECIMAL(12,2) NOT NULL,
        fee_rub DECIMAL(8,2),
        fee_percent DECIMAL(5,2),
        receipt_url TEXT,
        raw_response JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP
      )
    `);

    // Crypto Swaps
    await queryRunner.query(`
      CREATE TYPE swap_status AS ENUM (
        'pending', 'processing', 'completed', 'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE crypto_swaps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID UNIQUE REFERENCES orders(id),
        from_currency VARCHAR(10) DEFAULT 'USDT',
        from_amount DECIMAL(18,8) NOT NULL,
        to_currency VARCHAR(10) DEFAULT 'TON',
        to_amount DECIMAL(18,8) NOT NULL,
        rate DECIMAL(18,8) NOT NULL,
        dex_name VARCHAR(50),
        tx_hash VARCHAR(255),
        tx_link TEXT,
        network_fee DECIMAL(18,8),
        slippage DECIMAL(5,2),
        status swap_status DEFAULT 'pending',
        fail_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // Stars Purchases
    await queryRunner.query(`
      CREATE TYPE stars_purchase_status AS ENUM (
        'pending', 'processing', 'completed', 'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE stars_purchases (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id UUID UNIQUE REFERENCES orders(id),
        stars_amount INT NOT NULL,
        ton_spent DECIMAL(18,8) NOT NULL,
        price_per_star_ton DECIMAL(10,6) NOT NULL,
        recipient_telegram_id BIGINT NOT NULL,
        fragment_tx_hash VARCHAR(255),
        fragment_tx_link TEXT,
        fragment_response JSONB,
        status stars_purchase_status DEFAULT 'pending',
        fail_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
      )
    `);

    // Rate Snapshots
    await queryRunner.query(`
      CREATE TABLE rate_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ton_usd DECIMAL(10,4) NOT NULL,
        usd_rub DECIMAL(10,4) NOT NULL,
        star_cost_ton DECIMAL(10,6) NOT NULL,
        star_cost_rub DECIMAL(10,4) NOT NULL,
        source VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tax Reports
    await queryRunner.query(`
      CREATE TABLE tax_reports (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        period VARCHAR(20) NOT NULL,
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_revenue_rub DECIMAL(15,2) NOT NULL,
        orders_count INT NOT NULL,
        total_stars_sold INT NOT NULL,
        total_cost_rub DECIMAL(15,2) NOT NULL,
        total_fees_rub DECIMAL(15,2) NOT NULL,
        tax_usn6 DECIMAL(12,2) NOT NULL,
        insurance_contributions DECIMAL(12,2),
        gross_profit DECIMAL(15,2) NOT NULL,
        net_profit DECIMAL(15,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Wallet Balances
    await queryRunner.query(`
      CREATE TABLE wallet_balances (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address VARCHAR(255) NOT NULL,
        usdt_balance DECIMAL(18,8) NOT NULL,
        ton_balance DECIMAL(18,8) NOT NULL,
        total_value_rub DECIMAL(12,2) NOT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes
    await queryRunner.query(`CREATE INDEX idx_orders_user_id ON orders(user_id)`);
    await queryRunner.query(`CREATE INDEX idx_orders_status ON orders(status)`);
    await queryRunner.query(`CREATE INDEX idx_orders_created_at ON orders(created_at)`);
    await queryRunner.query(`CREATE INDEX idx_payments_external_id ON payments(external_payment_id)`);
    await queryRunner.query(`CREATE INDEX idx_rate_snapshots_created ON rate_snapshots(created_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE wallet_balances`);
    await queryRunner.query(`DROP TABLE tax_reports`);
    await queryRunner.query(`DROP TABLE rate_snapshots`);
    await queryRunner.query(`DROP TABLE stars_purchases`);
    await queryRunner.query(`DROP TYPE stars_purchase_status`);
    await queryRunner.query(`DROP TABLE crypto_swaps`);
    await queryRunner.query(`DROP TYPE swap_status`);
    await queryRunner.query(`DROP TABLE payments`);
    await queryRunner.query(`DROP TYPE payment_method`);
    await queryRunner.query(`DROP TYPE payment_status`);
    await queryRunner.query(`DROP TABLE orders`);
    await queryRunner.query(`DROP TYPE order_status`);
    await queryRunner.query(`DROP TABLE users`);
  }
}
```

---

#database #typeorm #nestjs #schema
