export type ReadHoldingRegistersRequest = {
  transactionId: number;
  unitId: number;
  startAddress: number;
  quantity: number;
};

export type ReadHoldingRegistersResult = {
  values: number[];
  rawFrameHex: string;
};

export function formatFrameHex(frame: Buffer): string {
  return [...frame].map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

export function buildReadHoldingRegistersRequest(request: ReadHoldingRegistersRequest): Buffer {
  validateUInt16("transactionId", request.transactionId);
  validateUInt8("unitId", request.unitId);
  validateUInt16("startAddress", request.startAddress);

  if (request.quantity < 1 || request.quantity > 125) {
    throw new Error("quantity must be between 1 and 125");
  }

  const frame = Buffer.alloc(12);
  frame.writeUInt16BE(request.transactionId, 0);
  frame.writeUInt16BE(0, 2);
  frame.writeUInt16BE(6, 4);
  frame.writeUInt8(request.unitId, 6);
  frame.writeUInt8(3, 7);
  frame.writeUInt16BE(request.startAddress, 8);
  frame.writeUInt16BE(request.quantity, 10);
  return frame;
}

export function parseReadHoldingRegistersResponse(
  frame: Buffer,
  expected: ReadHoldingRegistersRequest,
): ReadHoldingRegistersResult {
  if (frame.length < 9) {
    throw new Error("Modbus TCP response is too short");
  }

  const transactionId = frame.readUInt16BE(0);
  const protocolId = frame.readUInt16BE(2);
  const unitId = frame.readUInt8(6);
  const functionCode = frame.readUInt8(7);

  if (transactionId !== expected.transactionId) {
    throw new Error(`Unexpected transaction id ${transactionId}`);
  }
  if (protocolId !== 0) {
    throw new Error(`Unexpected protocol id ${protocolId}`);
  }
  if (unitId !== expected.unitId) {
    throw new Error(`Unexpected unit id ${unitId}`);
  }

  if (functionCode === 0x83) {
    throw new Error(`Modbus exception ${frame.readUInt8(8)}`);
  }
  if (functionCode !== 3) {
    throw new Error(`Unexpected function code ${functionCode}`);
  }

  const byteCount = frame.readUInt8(8);
  const expectedByteCount = expected.quantity * 2;
  if (byteCount !== expectedByteCount) {
    throw new Error(`Expected ${expectedByteCount} data bytes, received ${byteCount}`);
  }
  if (frame.length < 9 + byteCount) {
    throw new Error("Modbus TCP response data is incomplete");
  }

  const values: number[] = [];
  for (let offset = 9; offset < 9 + byteCount; offset += 2) {
    values.push(frame.readUInt16BE(offset));
  }

  return {
    values,
    rawFrameHex: formatFrameHex(frame),
  };
}

function validateUInt8(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`${name} must be an unsigned 8-bit integer`);
  }
}

function validateUInt16(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${name} must be an unsigned 16-bit integer`);
  }
}
