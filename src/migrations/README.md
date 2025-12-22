# Migrations

Typeorm migrations live here.

See `package.json`, `scripts` section.

Script `yarn typeorm migration:create` allows you to populate a migration.

When used `yarn typeorm migration:create src/migrations/Initial -p`, it populates a migration
named `src/migrations/<timestamp>-Initial.ts`. So, don't forget to specify
destination directory and don't try to place timestamp by yourself.
