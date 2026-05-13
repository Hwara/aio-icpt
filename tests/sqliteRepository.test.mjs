import { test } from "node:test";
import assert from "node:assert/strict";

import { SqliteRepository } from "../src/core/db/sqliteRepository.ts";

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
    const profile = repository.saveConnectionProfile({
      name: "Local mock",
      protocol: "modbus-tcp",
      config: {
        host: "127.0.0.1",
        port: 1502,
        unitId: 1,
        timeoutMs: 1000,
      },
    });

    const profiles = repository.listConnectionProfiles();

    assert.equal(profile.id, 1);
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].name, "Local mock");
    assert.equal(profiles[0].config.host, "127.0.0.1");
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
