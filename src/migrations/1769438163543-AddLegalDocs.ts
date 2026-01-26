import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLegalDocs1769438163543 implements MigrationInterface {
    name = 'AddLegalDocs1769438163543'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "user_consent" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "user_id" character varying NOT NULL,
                "username" character varying,
                "consent_type" character varying NOT NULL,
                "consent_version" character varying NOT NULL,
                "is_granted" boolean NOT NULL DEFAULT false,
                "granted_at" TIMESTAMP,
                "revoked_at" TIMESTAMP,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_b22925348311c2e41cc80b05171" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_7f4be1cae475481490ac565e23" ON "user_consent" ("user_id", "consent_type")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX "public"."IDX_7f4be1cae475481490ac565e23"
        `);
        await queryRunner.query(`
            DROP TABLE "user_consent"
        `);
    }

}
