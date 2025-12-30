import { MigrationInterface, QueryRunner } from "typeorm";

export class Initial1767122472414 implements MigrationInterface {
    name = 'Initial1767122472414'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "user" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" character varying NOT NULL,
                "username" character varying,
                "language" character varying NOT NULL DEFAULT 'en',
                "in_white_list" boolean NOT NULL DEFAULT false,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_758b8ce7c18b9d347461b30228d" UNIQUE ("user_id"),
                CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_758b8ce7c18b9d347461b30228" ON "user" ("user_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_758b8ce7c18b9d347461b30228"
        `);
        await queryRunner.query(`
            DROP TABLE "user"
        `);
    }

}
