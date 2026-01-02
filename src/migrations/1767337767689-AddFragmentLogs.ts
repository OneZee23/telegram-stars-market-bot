import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFragmentLogs1767337767689 implements MigrationInterface {
  name = 'AddFragmentLogs1767337767689';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TYPE "public"."stars_purchases_status_enum" AS ENUM('pending', 'processing', 'completed', 'failed')
        `);
    await queryRunner.query(`
            CREATE TABLE "stars_purchases" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" character varying NOT NULL,
                "recipient_username" character varying NOT NULL,
                "stars_amount" integer NOT NULL,
                "fragment_request_id" character varying,
                "tx_hash" character varying,
                "status" "public"."stars_purchases_status_enum" NOT NULL DEFAULT 'pending',
                "error" text,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_aa347e4afb0223985023d005e98" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_46a31800c501e1a7ecbd322970" ON "stars_purchases" ("fragment_request_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "IDX_17e02c258c800ab239b9fc460b" ON "stars_purchases" ("user_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."IDX_17e02c258c800ab239b9fc460b"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."IDX_46a31800c501e1a7ecbd322970"
        `);
    await queryRunner.query(`
            DROP TABLE "stars_purchases"
        `);
    await queryRunner.query(`
            DROP TYPE "public"."stars_purchases_status_enum"
        `);
  }
}
