import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddYooKassaPayments1768995058575 implements MigrationInterface {
  name = 'AddYooKassaPayments1768995058575';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."payments_status_enum" AS ENUM(
                'pending',
                'waiting_for_capture',
                'succeeded',
                'canceled'
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "payments" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" character varying NOT NULL,
                "recipient_username" character varying NOT NULL,
                "stars_amount" integer NOT NULL,
                "price_rub" numeric(10, 2) NOT NULL,
                "yookassa_payment_id" character varying,
                "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending',
                "confirmation_url" text,
                "stars_purchase_id" uuid,
                "is_test_purchase" boolean NOT NULL DEFAULT false,
                "error" text,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_8b18d150c22263214f8edbf0746" UNIQUE ("yookassa_payment_id"),
                CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_c03e246610f914a0d678beb1e8" ON "payments" ("stars_purchase_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_8b18d150c22263214f8edbf074" ON "payments" ("yookassa_payment_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_427785468fb7d2733f59e7d7d3" ON "payments" ("user_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."IDX_427785468fb7d2733f59e7d7d3"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_8b18d150c22263214f8edbf074"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_c03e246610f914a0d678beb1e8"
        `);
    await queryRunner.query(`
            DROP TABLE "payments"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."payments_status_enum"
        `);
  }
}
