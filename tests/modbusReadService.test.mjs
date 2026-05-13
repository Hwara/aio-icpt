import { test } from "node:test";
import assert from "node:assert/strict";

import { SqliteRepository } from "../src/core/db/sqliteRepository.ts";
import { createMockModbusTcpServer } from "../src/core/protocols/modbusTcp/mockServer.ts";
import { executeModbusTcpRead } from "../src/core/protocols/modbusTcp/readService.ts";

test("executes a Modbus TCP read and stores run, raw logs, and measurements", async () => {
  const repository = new SqliteRepository(":memory:");
  repository.migrate();

  const server = await createMockModbusTcpServer({
    host: "127.0.0.1",
    port: 0,
    unitId: 1,
    holdingRegisters: new Map([
      [0, 123],
      [1, 200],
    ]),
  });

  try {
    const result = await executeModbusTcpRead({
      repository,
      connectionName: "Local mock",
      connection: {
        host: "127.0.0.1",
        port: server.port,
        unitId: 1,
        timeoutMs: 500,
      },
      operation: {
        startAddress: 0,
        quantity: 2,
      },
    });

    assert.deepEqual(result.values, [123, 200]);
    assert.equal(repository.listTestRuns().length, 1);
    assert.equal(repository.listProtocolLogs(result.testRunId).length, 2);
    assert.equal(repository.listMeasurementRecords(result.testRunId).length, 2);
  } finally {
    await server.close();
    repository.close();
  }
});
