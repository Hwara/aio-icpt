import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { SqliteRepository } from "../src/core/db/sqliteRepository.ts";

function waitForTimestampTick() {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

test("stores a test run, protocol logs, and measurement records in SQLite", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    const run = repository.createTestRun({
      connectionName: "Local mock",
      protocol: "modbus-tcp",
      status: "success",
      responseTimeMs: 12,
    });

    repository.addProtocolLog({
      testRunId: run.id,
      level: "RAW",
      protocol: "modbus-tcp",
      direction: "TX",
      message: "Read Holding Registers request",
      rawFrame: "00 01 00 00 00 06 01 03 00 00 00 02",
    });

    repository.addMeasurementRecord({
      testRunId: run.id,
      protocol: "modbus-tcp",
      target: "holding-register:0",
      value: 123,
      dataType: "uint16",
    });

    const runs = repository.listTestRuns();
    const logs = repository.listProtocolLogs(run.id);
    const measurements = repository.listMeasurementRecords(run.id);

    assert.equal(runs.length, 1);
    assert.equal(logs.length, 1);
    assert.equal(measurements.length, 1);
    assert.equal(measurements[0].value, 123);
  } finally {
    repository.close();
  }
});

test("stores and lists Modbus TCP connection profiles", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    const project = repository.createProject({
      name: "Factory line A",
      description: "Commissioning bench",
    });

    const profile = repository.saveConnectionProfile({
      projectId: project.id,
      name: "Local mock",
      protocol: "modbus-tcp",
      config: {
        host: "127.0.0.1",
        port: 1502,
        unitId: 1,
        timeoutMs: 1000,
      },
    });

    const profiles = repository.listConnectionProfiles(project.id);

    assert.equal(profile.id, 1);
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].projectId, project.id);
    assert.equal(profiles[0].name, "Local mock");
    assert.equal(profiles[0].config.host, "127.0.0.1");
  } finally {
    repository.close();
  }
});

test("touches the owning project when a connection profile is created, updated, or deleted", async () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    const project = repository.createProject({
      name: "Factory line A",
      description: "Commissioning bench",
    });
    const initialProject = repository.listProjects().find((item) => item.id === project.id);

    await waitForTimestampTick();
    const profile = repository.saveConnectionProfile({
      projectId: project.id,
      name: "Local mock",
      protocol: "modbus-tcp",
      config: { host: "127.0.0.1", port: 1502, unitId: 1, timeoutMs: 1000 },
    });
    const afterCreate = repository.listProjects().find((item) => item.id === project.id);

    await waitForTimestampTick();
    repository.updateConnectionProfile(profile.id, {
      projectId: project.id,
      name: "Local mock updated",
      protocol: "modbus-tcp",
      config: { host: "127.0.0.1", port: 1503, unitId: 1, timeoutMs: 1000 },
    });
    const afterUpdate = repository.listProjects().find((item) => item.id === project.id);

    await waitForTimestampTick();
    repository.deleteConnectionProfile(profile.id);
    const afterDelete = repository.listProjects().find((item) => item.id === project.id);

    assert.ok(afterCreate.updatedAt > initialProject.updatedAt);
    assert.ok(afterUpdate.updatedAt > afterCreate.updatedAt);
    assert.ok(afterDelete.updatedAt > afterUpdate.updatedAt);
  } finally {
    repository.close();
  }
});

test("migrates legacy connection profiles without project_id once", () => {
  const directory = mkdtempSync(join(tmpdir(), "aio-icpt-legacy-"));
  const filename = join(directory, "aio-icpt.sqlite");
  const legacyDb = new DatabaseSync(filename);

  try {
    legacyDb.exec(`
      CREATE TABLE connection_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacyDb
      .prepare(
        `INSERT INTO connection_profiles
          (name, protocol, config_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        "Legacy PLC",
        "modbus-tcp",
        JSON.stringify({ host: "127.0.0.1", port: 1502, unitId: 1, timeoutMs: 1000 }),
        "2026-06-02T00:00:00.000Z",
        "2026-06-02T00:00:00.000Z",
      );
    legacyDb.close();

    const repository = new SqliteRepository(filename);
    repository.migrate();

    const projects = repository.listProjects();
    const profiles = repository.listConnectionProfiles(projects[0].id);

    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, "Migrated Phase 1 project");
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].name, "Legacy PLC");

    repository.migrate();

    assert.equal(repository.listProjects().length, 1);
    assert.equal(repository.listConnectionProfiles(projects[0].id).length, 1);
    repository.close();
  } finally {
    try {
      legacyDb.close();
    } catch {
      // The connection is already closed after the legacy schema is created.
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test("backfills legacy connection profiles when project_id column exists with null rows", () => {
  const directory = mkdtempSync(join(tmpdir(), "aio-icpt-partial-"));
  const filename = join(directory, "aio-icpt.sqlite");
  const db = new DatabaseSync(filename);

  try {
    db.exec(`
      CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE connection_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    db
      .prepare(
        `INSERT INTO connection_profiles
          (project_id, name, protocol, config_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        null,
        "Partially migrated PLC",
        "modbus-tcp",
        JSON.stringify({ host: "127.0.0.1", port: 1502, unitId: 1, timeoutMs: 1000 }),
        "2026-06-02T00:00:00.000Z",
        "2026-06-02T00:00:00.000Z",
      );
    db.close();

    const repository = new SqliteRepository(filename);
    try {
      repository.migrate();

      const projects = repository.listProjects();
      const profiles = repository.listConnectionProfiles(projects[0].id);

      assert.equal(projects.length, 1);
      assert.equal(profiles.length, 1);
      assert.equal(profiles[0].name, "Partially migrated PLC");

      repository.migrate();

      assert.equal(repository.listProjects().length, 1);
      assert.equal(repository.listConnectionProfiles(projects[0].id).length, 1);
    } finally {
      repository.close();
    }
  } finally {
    try {
      db.close();
    } catch {
      // The connection is already closed before SqliteRepository opens it.
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test("creates, updates, lists, and deletes projects", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    const first = repository.createProject({
      name: "Factory line A",
      description: "Initial checkout",
    });
    const second = repository.createProject({
      name: "Factory line B",
      description: "",
    });

    repository.updateProject(first.id, {
      name: "Factory line A - updated",
      description: "Updated description",
    });

    const projects = repository.listProjects();

    assert.equal(projects.length, 2);
    assert.ok(projects.some((project) => project.id === second.id));

    const updated = projects.find((project) => project.id === first.id);
    assert.equal(updated.name, "Factory line A - updated");
    assert.equal(updated.description, "Updated description");

    repository.deleteProject(first.id);

    const remainingProjects = repository.listProjects();

    assert.equal(remainingProjects.length, 1);
    assert.equal(remainingProjects[0].id, second.id);
  } finally {
    repository.close();
  }
});

test("ensures a default project when no projects exist", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    const ensured = repository.ensureDefaultProject();
    const projects = repository.listProjects();

    assert.equal(projects.length, 1);
    assert.equal(ensured.id, projects[0].id);
    assert.equal(projects[0].name, "Default project");
    assert.equal(projects[0].description, "Automatically created startup workspace.");
  } finally {
    repository.close();
  }
});

test("does not create a default project when a project already exists", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    const existing = repository.createProject({
      name: "Factory line A",
      description: "Initial checkout",
    });
    const ensured = repository.ensureDefaultProject();
    const projects = repository.listProjects();

    assert.equal(projects.length, 1);
    assert.equal(ensured.id, existing.id);
    assert.equal(projects[0].name, "Factory line A");
  } finally {
    repository.close();
  }
});

test("updates, deletes, and scopes connection profiles by project", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    const firstProject = repository.createProject({ name: "Factory line A", description: "" });
    const secondProject = repository.createProject({ name: "Factory line B", description: "" });

    const profile = repository.saveConnectionProfile({
      projectId: firstProject.id,
      name: "Local mock",
      protocol: "modbus-tcp",
      config: { host: "127.0.0.1", port: 1502, unitId: 1, timeoutMs: 1000 },
    });

    repository.saveConnectionProfile({
      projectId: secondProject.id,
      name: "Remote PLC",
      protocol: "modbus-tcp",
      config: { host: "192.168.0.20", port: 502, unitId: 2, timeoutMs: 1500 },
    });

    repository.updateConnectionProfile(profile.id, {
      projectId: firstProject.id,
      name: "Local mock updated",
      protocol: "modbus-tcp",
      config: { host: "127.0.0.1", port: 1503, unitId: 1, timeoutMs: 1200 },
    });

    const firstProjectProfiles = repository.listConnectionProfiles(firstProject.id);
    const secondProjectProfiles = repository.listConnectionProfiles(secondProject.id);

    assert.equal(firstProjectProfiles.length, 1);
    assert.equal(firstProjectProfiles[0].name, "Local mock updated");
    assert.equal(firstProjectProfiles[0].config.port, 1503);
    assert.equal(secondProjectProfiles.length, 1);
    assert.equal(secondProjectProfiles[0].name, "Remote PLC");

    repository.deleteConnectionProfile(profile.id);

    assert.equal(repository.listConnectionProfiles(firstProject.id).length, 0);
  } finally {
    repository.close();
  }
});

test("requires connection profiles to belong to an existing project", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    assert.throws(
      () =>
        repository.saveConnectionProfile({
          projectId: 999,
          name: "Orphan profile",
          protocol: "modbus-tcp",
          config: { host: "127.0.0.1", port: 1502, unitId: 1, timeoutMs: 1000 },
        }),
      /constraint/i,
    );
  } finally {
    repository.close();
  }
});

test("deleting a project deletes its connection profiles", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    const project = repository.createProject({ name: "Factory line A", description: "" });
    repository.saveConnectionProfile({
      projectId: project.id,
      name: "Local mock",
      protocol: "modbus-tcp",
      config: { host: "127.0.0.1", port: 1502, unitId: 1, timeoutMs: 1000 },
    });

    repository.deleteProject(project.id);

    assert.equal(repository.listConnectionProfiles(project.id).length, 0);
  } finally {
    repository.close();
  }
});

test("enforces foreign keys for protocol logs and measurements", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    assert.throws(
      () =>
        repository.addProtocolLog({
          testRunId: 999,
          level: "RAW",
          protocol: "modbus-tcp",
          direction: "TX",
          message: "orphan log",
        }),
      /constraint/i,
    );

    assert.throws(
      () =>
        repository.addMeasurementRecord({
          testRunId: 999,
          protocol: "modbus-tcp",
          target: "holding-register:0",
          value: 123,
          dataType: "uint16",
        }),
      /constraint/i,
    );
  } finally {
    repository.close();
  }
});

test("rolls back a transaction when a write fails", () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  try {
    assert.throws(
      () =>
        repository.transaction(() => {
          repository.createTestRun({
            connectionName: "Local mock",
            protocol: "modbus-tcp",
            status: "success",
            responseTimeMs: 12,
          });
          repository.addProtocolLog({
            testRunId: 999,
            level: "RAW",
            protocol: "modbus-tcp",
            direction: "TX",
            message: "orphan log",
          });
        }),
      /constraint/i,
    );

    assert.equal(repository.listTestRuns().length, 0);
  } finally {
    repository.close();
  }
});
