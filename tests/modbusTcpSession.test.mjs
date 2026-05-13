import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";

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

  let session = null;
  try {
    session = new ModbusTcpSession({
      host: "127.0.0.1",
      port: server.port,
      unitId: 1,
      timeoutMs: 500,
    });

    await session.connect();
    const result = await session.readHoldingRegisters({ startAddress: 0, quantity: 2 });

    assert.deepEqual(result.values, [123, 200]);
    assert.match(result.txRawFrameHex, /^00 01 00 00 00 06 01 03/);
    assert.match(result.rxRawFrameHex, /^00 01 00 00 00 07 01 03/);
    assert.ok(result.responseTimeMs >= 0);
  } finally {
    if (session) {
      await session.disconnect().catch(() => {});
    }
    await server.close();
  }
});

test("mock server exception response keeps the request function code", async () => {
  const server = await createMockModbusTcpServer({
    host: "127.0.0.1",
    port: 0,
    unitId: 1,
    holdingRegisters: new Map(),
  });

  const socket = net.createConnection({ host: "127.0.0.1", port: server.port });

  try {
    const response = await new Promise((resolve, reject) => {
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.write(Buffer.from("000100000006010400000001", "hex"));
      });
      socket.once("data", resolve);
    });

    assert.equal(response.readUInt8(7), 0x84);
    assert.equal(response.readUInt8(8), 1);
  } finally {
    socket.destroy();
    await server.close();
  }
});

test("mock server rejects out-of-range read quantities", async () => {
  const server = await createMockModbusTcpServer({
    host: "127.0.0.1",
    port: 0,
    unitId: 1,
    holdingRegisters: new Map(),
  });

  const socket = net.createConnection({ host: "127.0.0.1", port: server.port });

  try {
    const response = await new Promise((resolve, reject) => {
      socket.once("error", reject);
      socket.once("connect", () => {
        socket.write(Buffer.from("00010000000601030000007e", "hex"));
      });
      socket.once("data", resolve);
    });

    assert.equal(response.readUInt8(7), 0x83);
    assert.equal(response.readUInt8(8), 3);
  } finally {
    socket.destroy();
    await server.close();
  }
});

test("request timeout resets the socket before the next operation", async () => {
  const silentServer = net.createServer((socket) => {
    socket.on("data", () => {});
  });
  await new Promise((resolve, reject) => {
    silentServer.once("error", reject);
    silentServer.listen(0, "127.0.0.1", resolve);
  });

  const address = silentServer.address();
  assert.ok(address && typeof address !== "string");

  const session = new ModbusTcpSession({
    host: "127.0.0.1",
    port: address.port,
    unitId: 1,
    timeoutMs: 20,
  });

  try {
    await session.connect();
    await assert.rejects(() => session.readHoldingRegisters({ startAddress: 0, quantity: 1 }), /timed out/i);
    await assert.rejects(
      () => session.readHoldingRegisters({ startAddress: 0, quantity: 1 }),
      /not connected/i,
    );
  } finally {
    await session.disconnect().catch(() => {});
    await new Promise((resolve) => silentServer.close(resolve));
  }
});
