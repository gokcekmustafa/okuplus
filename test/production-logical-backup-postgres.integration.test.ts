import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  buildProductionBackupIdentitySql,
  runBackupAfterIdentityCheck,
  validateProductionBackupRole,
  type ProductionBackupIdentity,
} from "../scripts/production-logical-backup-contract.js";

const databaseUrl = process.env.PSQL_DATABASE_URL;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const schemaName = `backup_it_${suffix}`;
const fullRole = `backup_full_${suffix}`;
const missingTableRole = `backup_table_${suffix}`;
const missingSequenceRole = `backup_seq_${suffix}`;
const missingLargeObjectRole = `backup_lo_${suffix}`;
const noRlsBypassRole = `backup_rls_${suffix}`;
const directWriterRole = `backup_write_${suffix}`;
const columnWriterRole = `backup_column_${suffix}`;
const sequenceWriterRole = `backup_seqwrite_${suffix}`;
const membershipRole = `backup_member_${suffix}`;
const ownerRole = `backup_owner_${suffix}`;
const applicationRole = `backup_app_${suffix}`;
const superuserRole = `backup_super_${suffix}`;
const adminRole = `backup_admin_${suffix}`;
const groupRole = `backup_group_${suffix}`;
const otherDatabase = `backup_owner_db_${suffix}`;
const roleNames = [
  fullRole,
  missingTableRole,
  missingSequenceRole,
  missingLargeObjectRole,
  noRlsBypassRole,
  directWriterRole,
  columnWriterRole,
  sequenceWriterRole,
  membershipRole,
  ownerRole,
  applicationRole,
  superuserRole,
  adminRole,
  groupRole,
];

const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres("production backup identity SQL on PostgreSQL 18", () => {
  let admin: PrismaClient;
  let ownerDatabaseClient: PrismaClient | undefined;
  let databaseName = "";
  let largeObjectOid: number | undefined;

  function identifier(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
  }

  async function createRole(
    name: string,
    attributes = "LOGIN NOINHERIT BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION",
  ): Promise<void> {
    await admin.$executeRawUnsafe(`CREATE ROLE ${identifier(name)} ${attributes}`);
    await admin.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${identifier(databaseName)} TO ${identifier(name)}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT USAGE ON SCHEMA ${identifier(schemaName)} TO ${identifier(name)}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT SELECT ON ALL TABLES IN SCHEMA ${identifier(schemaName)} TO ${identifier(name)}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT SELECT ON ALL SEQUENCES IN SCHEMA ${identifier(schemaName)} TO ${identifier(name)}`,
    );
    if (largeObjectOid !== undefined) {
      await admin.$executeRawUnsafe(
        `GRANT SELECT ON LARGE OBJECT ${largeObjectOid} TO ${identifier(name)}`,
      );
    }
  }

  async function readIdentity(
    roleName: string,
    approvedBackupRole = roleName,
    approvedApplicationRole = applicationRole,
  ): Promise<ProductionBackupIdentity> {
    if (!admin) throw new Error("test database is not initialized");
    return admin.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${identifier(roleName)}`);
      const rows = await transaction.$queryRawUnsafe<Array<{ identity: string }>>(
        buildProductionBackupIdentitySql(approvedBackupRole, approvedApplicationRole),
      );
      const row = rows[0];
      if (!row) throw new Error("identity query returned no row");
      const parsed = JSON.parse(row.identity) as ProductionBackupIdentity["role"] & {
        database: string;
      };
      const { database, ...role } = parsed;
      return { database, role };
    });
  }

  async function grantCompleteRead(name: string): Promise<void> {
    await admin.$executeRawUnsafe(
      `DO $grant$
      DECLARE target_schema record;
      BEGIN
        FOR target_schema IN
          SELECT nspname FROM pg_namespace
          WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'
        LOOP
          EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', target_schema.nspname, '${name}');
          EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO %I', target_schema.nspname, '${name}');
          EXECUTE format('GRANT SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I', target_schema.nspname, '${name}');
        END LOOP;
        FOR target_schema IN SELECT oid FROM pg_largeobject_metadata LOOP
          EXECUTE format('GRANT SELECT ON LARGE OBJECT %s TO %I', target_schema.oid, '${name}');
        END LOOP;
      END
      $grant$`,
    );
  }

  beforeAll(async () => {
    if (!databaseUrl) return;
    const parsed = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      throw new Error("PostgreSQL backup integration tests require a loopback-only test database");
    }
    admin = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const versionRows = await admin.$queryRaw<Array<{ version: number; database: string }>>`
      SELECT current_setting('server_version_num')::integer AS version, current_database() AS database
    `;
    const version = versionRows[0];
    if (!version || version.version < 180000 || version.version >= 190000) {
      throw new Error("PostgreSQL backup integration tests require PostgreSQL 18");
    }
    databaseName = version.database;

    await admin.$executeRawUnsafe(`CREATE SCHEMA ${identifier(schemaName)}`);
    await admin.$executeRawUnsafe(
      `CREATE TABLE ${identifier(schemaName)}.read_fixture (id integer PRIMARY KEY, value text NOT NULL)`,
    );
    await admin.$executeRawUnsafe(
      `CREATE TABLE ${identifier(schemaName)}.rls_fixture (id integer PRIMARY KEY, value text NOT NULL)`,
    );
    await admin.$executeRawUnsafe(
      `ALTER TABLE ${identifier(schemaName)}.rls_fixture ENABLE ROW LEVEL SECURITY`,
    );
    await admin.$executeRawUnsafe(`CREATE SEQUENCE ${identifier(schemaName)}.read_fixture_seq`);
    const loRows = await admin.$queryRaw<Array<{ oid: number }>>`
      SELECT lo_create(0)::integer AS oid
    `;
    largeObjectOid = loRows[0]?.oid;
    if (!largeObjectOid) throw new Error("test large object could not be created");

    await createRole(fullRole);
    await createRole(missingTableRole);
    await createRole(missingSequenceRole);
    await createRole(missingLargeObjectRole);
    await createRole(
      noRlsBypassRole,
      "LOGIN NOINHERIT NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION",
    );
    await createRole(directWriterRole);
    await createRole(columnWriterRole);
    await createRole(sequenceWriterRole);
    await createRole(membershipRole);
    await createRole(ownerRole);
    await createRole(applicationRole);
    await createRole(
      superuserRole,
      "LOGIN NOINHERIT BYPASSRLS SUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION",
    );
    await createRole(
      adminRole,
      "LOGIN NOINHERIT BYPASSRLS NOSUPERUSER NOCREATEDB CREATEROLE NOREPLICATION",
    );
    for (const name of roleNames) {
      if (name !== groupRole) await grantCompleteRead(name);
    }
    await admin.$executeRawUnsafe(
      `REVOKE SELECT ON ${identifier(schemaName)}.read_fixture FROM ${identifier(missingTableRole)}`,
    );
    await admin.$executeRawUnsafe(
      `REVOKE SELECT ON SEQUENCE ${identifier(schemaName)}.read_fixture_seq FROM ${identifier(missingSequenceRole)}`,
    );
    await admin.$executeRawUnsafe(
      `REVOKE SELECT ON LARGE OBJECT ${largeObjectOid} FROM ${identifier(missingLargeObjectRole)}`,
    );
  }, 30000);

  afterAll(async () => {
    if (!admin) return;
    await ownerDatabaseClient?.$disconnect();
    await admin
      .$executeRawUnsafe(`DROP DATABASE IF EXISTS ${identifier(otherDatabase)}`)
      .catch(() => undefined);
    await admin
      .$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${identifier(schemaName)} CASCADE`)
      .catch(() => undefined);
    if (largeObjectOid !== undefined) {
      await admin.$queryRawUnsafe(`SELECT lo_unlink(${largeObjectOid})`).catch(() => undefined);
    }
    await admin
      .$executeRawUnsafe(`REVOKE ${identifier(groupRole)} FROM ${identifier(membershipRole)}`)
      .catch(() => undefined);
    for (const name of roleNames) {
      await admin.$executeRawUnsafe(`DROP OWNED BY ${identifier(name)}`).catch(() => undefined);
    }
    for (const name of roleNames) {
      await admin
        .$executeRawUnsafe(`DROP ROLE IF EXISTS ${identifier(name)}`)
        .catch(() => undefined);
    }
    await admin.$disconnect();
  }, 30000);

  it("executes PG18's comma-separated privilege-list signatures in the real identity query", async () => {
    const version = await admin.$queryRaw<
      Array<{ tablePrivilege: boolean; sequencePrivilege: boolean }>
    >`
      SELECT
        has_table_privilege(current_user, 'pg_catalog.pg_class', 'SELECT, INSERT') AS "tablePrivilege",
        has_sequence_privilege(
          current_user,
          ${`${schemaName}.read_fixture_seq`}::regclass,
          'SELECT, USAGE'
        ) AS "sequencePrivilege"
    `;
    expect(version[0]?.tablePrivilege).toBe(true);
    expect(version[0]?.sequencePrivilege).toBe(true);
    const identity = await readIdentity(fullRole);
    expect(identity.role.approvedRoleMatches).toBe(true);
  });

  it("accepts a separate BYPASSRLS backup role with complete SELECT access", async () => {
    const dump = vi.fn(async () => undefined);
    await runBackupAfterIdentityCheck(() => readIdentity(fullRole), databaseName, vi.fn(), dump);
    expect(dump).toHaveBeenCalledOnce();
  });

  it.each([
    ["table SELECT", missingTableRole, "allTableLikeRelationsSelectable"],
    ["sequence SELECT", missingSequenceRole, "allSequencesSelectable"],
    ["large-object SELECT", missingLargeObjectRole, "allLargeObjectsSelectable"],
  ] as const)("rejects missing %s access", async (_label, role, field) => {
    const identity = await readIdentity(role);
    expect(identity.role[field]).toBe(false);
    expect(validateProductionBackupRole(identity.role)).toEqual({
      ok: false,
      reason: "DATABASE_ROLE_READ_PRIVILEGES_INCOMPLETE",
    });
  });

  it("rejects RLS tables when the backup role does not bypass row security", async () => {
    const identity = await readIdentity(noRlsBypassRole);
    expect(identity.role.hasRlsTables).toBe(true);
    expect(identity.role.bypassesRls).toBe(false);
    expect(validateProductionBackupRole(identity.role)).toEqual({
      ok: false,
      reason: "DATABASE_RLS_BYPASS_REQUIRED",
    });
  });

  it("rejects direct and PUBLIC-derived write or schema-management privileges", async () => {
    await admin.$executeRawUnsafe(
      `GRANT UPDATE ON ${identifier(schemaName)}.read_fixture TO ${identifier(directWriterRole)}`,
    );
    const direct = await readIdentity(directWriterRole);
    expect(direct.role.hasWritePrivileges).toBe(true);

    await admin.$executeRawUnsafe(
      `GRANT INSERT (value) ON ${identifier(schemaName)}.read_fixture TO ${identifier(columnWriterRole)}`,
    );
    const columnWrite = await readIdentity(columnWriterRole);
    expect(columnWrite.role.hasWritePrivileges).toBe(true);

    await admin.$executeRawUnsafe(
      `GRANT USAGE ON SEQUENCE ${identifier(schemaName)}.read_fixture_seq TO ${identifier(sequenceWriterRole)}`,
    );
    const sequenceWrite = await readIdentity(sequenceWriterRole);
    expect(sequenceWrite.role.hasWritePrivileges).toBe(true);

    await admin.$executeRawUnsafe(
      `GRANT INSERT ON ${identifier(schemaName)}.read_fixture TO PUBLIC`,
    );
    try {
      const publicTableWrite = await readIdentity(fullRole);
      expect(publicTableWrite.role.hasWritePrivileges).toBe(true);
    } finally {
      await admin.$executeRawUnsafe(
        `REVOKE INSERT ON ${identifier(schemaName)}.read_fixture FROM PUBLIC`,
      );
    }

    await admin.$executeRawUnsafe(`GRANT CREATE ON SCHEMA ${identifier(schemaName)} TO PUBLIC`);
    try {
      const publicSchemaCreate = await readIdentity(fullRole);
      expect(publicSchemaCreate.role.hasWritePrivileges).toBe(true);
    } finally {
      await admin.$executeRawUnsafe(
        `REVOKE CREATE ON SCHEMA ${identifier(schemaName)} FROM PUBLIC`,
      );
    }

    await admin.$executeRawUnsafe(`GRANT CREATE ON DATABASE ${identifier(databaseName)} TO PUBLIC`);
    try {
      const publicDatabaseCreate = await readIdentity(fullRole);
      expect(publicDatabaseCreate.role.hasWritePrivileges).toBe(true);
    } finally {
      await admin.$executeRawUnsafe(
        `REVOKE CREATE ON DATABASE ${identifier(databaseName)} FROM PUBLIC`,
      );
    }
  });

  it("rejects memberships and object ownership, including ownership in another database", async () => {
    await admin.$executeRawUnsafe(
      `CREATE ROLE ${identifier(groupRole)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`,
    );
    await admin.$executeRawUnsafe(
      `GRANT ${identifier(groupRole)} TO ${identifier(membershipRole)}`,
    );
    const memberIdentity = await readIdentity(membershipRole);
    expect(memberIdentity.role.hasRoleMemberships).toBe(true);
    expect(validateProductionBackupRole(memberIdentity.role)).toEqual({
      ok: false,
      reason: "DATABASE_ROLE_PRIVILEGES_TOO_BROAD",
    });

    await admin.$executeRawUnsafe(`CREATE DATABASE ${identifier(otherDatabase)}`);
    const otherUrl = new URL(databaseUrl!);
    otherUrl.pathname = `/${otherDatabase}`;
    ownerDatabaseClient = new PrismaClient({ datasources: { db: { url: otherUrl.toString() } } });
    await ownerDatabaseClient.$executeRawUnsafe(
      `CREATE SCHEMA ${identifier(`owned_${suffix}`)} AUTHORIZATION ${identifier(ownerRole)}`,
    );
    const ownerIdentity = await readIdentity(ownerRole);
    expect(ownerIdentity.role.hasWritePrivileges).toBe(true);
    expect(validateProductionBackupRole(ownerIdentity.role)).toEqual({
      ok: false,
      reason: "DATABASE_ROLE_NOT_READ_ONLY",
    });
  }, 30000);

  it("rejects the application, superuser, and role-administration logins", async () => {
    const appIdentity = await readIdentity(applicationRole, applicationRole, applicationRole);
    expect(appIdentity.role.applicationRole).toBe(true);
    expect(validateProductionBackupRole(appIdentity.role)).toEqual({
      ok: false,
      reason: "DATABASE_ROLE_IS_APPLICATION_ROLE",
    });

    const superuserIdentity = await readIdentity(superuserRole);
    expect(superuserIdentity.role.superuser).toBe(true);
    expect(validateProductionBackupRole(superuserIdentity.role)).toEqual({
      ok: false,
      reason: "DATABASE_ROLE_PRIVILEGES_TOO_BROAD",
    });

    const adminIdentity = await readIdentity(adminRole);
    expect(adminIdentity.role.canManageRolesOrDatabases).toBe(true);
    expect(validateProductionBackupRole(adminIdentity.role)).toEqual({
      ok: false,
      reason: "DATABASE_ROLE_PRIVILEGES_TOO_BROAD",
    });
  });

  it("never starts the dump when the real identity query fails", async () => {
    const publicCanReadRoles = await admin.$queryRaw<Array<{ allowed: boolean }>>`
      SELECT has_table_privilege(${fullRole}, 'pg_catalog.pg_roles', 'SELECT') AS allowed
    `;
    await admin.$executeRawUnsafe("REVOKE SELECT ON pg_catalog.pg_roles FROM PUBLIC");
    const dump = vi.fn(async () => undefined);
    try {
      await expect(
        runBackupAfterIdentityCheck(() => readIdentity(fullRole), databaseName, vi.fn(), dump),
      ).rejects.toThrow();
      expect(dump).not.toHaveBeenCalled();
    } finally {
      if (publicCanReadRoles[0]?.allowed) {
        await admin.$executeRawUnsafe("GRANT SELECT ON pg_catalog.pg_roles TO PUBLIC");
      }
    }
  });
});
