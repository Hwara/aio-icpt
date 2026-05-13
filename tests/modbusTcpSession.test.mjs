import { test } from "node:test";
import assert from "node:assert/strict";

import { createMockModbusTcpServer } from "../src/core/protocols/modbusTcp/mockServer.ts";
import { ModbusTcpSession } from "../src/core/protocols/modbusTcp/session.ts";

test("reads holding registers from the built-in mock server", async () => {
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
    const session = new ModbusTcpSession({
      host: "127.0.0.1",
      port: server.port,
      unitId: 1,
      timeoutMs: 500,
    });

    await session.connect();
    const result = await session.readHoldingRegisters({ startAddress: 0, quantity: 2 });
    await session.disconnect();

    assert.deepEqual(result.values, [123, 200]);
    assert.match(result.txRawFrameHex, /^00 01 00 00 00 06 01 03/);
    assert.match(result.rxRawFrameHex, /^00 01 00 00 00 07 01 03/);
    assert.ok(result.responseTimeMs >= 0);
  } finally {
    await server.close();
  }
});
