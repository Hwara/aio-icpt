import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildReadHoldingRegistersRequest,
  parseReadHoldingRegistersResponse,
} from "../src/core/protocols/modbusTcp/frames.ts";

test("builds a Modbus TCP Read Holding Registers request frame", () => {
  const frame = buildReadHoldingRegistersRequest({
    transactionId: 1,
    unitId: 7,
    startAddress: 0,
    quantity: 2,
  });

  assert.equal(frame.toString("hex"), "000100000006070300000002");
});

test("parses a Modbus TCP Read Holding Registers response", () => {
  const response = Buffer.from("000100000007070304007b00c8", "hex");

  const result = parseReadHoldingRegistersResponse(response, {
    transactionId: 1,
    unitId: 7,
    quantity: 2,
  });

  assert.deepEqual(result.values, [123, 200]);
  assert.equal(result.rawFrameHex, "00 01 00 00 00 07 07 03 04 00 7B 00 C8");
});

test("rejects a response with a mismatched transaction id", () => {
  const response = Buffer.from("000200000007070304007b00c8", "hex");

  assert.throws(
    () =>
      parseReadHoldingRegistersResponse(response, {
        transactionId: 1,
        unitId: 7,
        quantity: 2,
      }),
    /transaction id/i,
  );
});

test("reports a Modbus exception response", () => {
  const response = Buffer.from("000100000003078302", "hex");

  assert.throws(
    () =>
      parseReadHoldingRegistersResponse(response, {
        transactionId: 1,
        unitId: 7,
        quantity: 2,
      }),
    /exception 2/i,
  );
});

test("rejects a response with a mismatched MBAP length", () => {
  const response = Buffer.from("000100000006070304007b00c8", "hex");

  assert.throws(
    () =>
      parseReadHoldingRegistersResponse(response, {
        transactionId: 1,
        unitId: 7,
        quantity: 2,
      }),
    /MBAP length/i,
  );
});
