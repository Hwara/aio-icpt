import net from "node:net";

export type MockModbusTcpServerOptions = {
  host: string;
  port: number;
  unitId: number;
  holdingRegisters: Map<number, number>;
};

export type MockModbusTcpServer = {
  port: number;
  close(): Promise<void>;
};

/**
 * Starts a local Modbus TCP mock server for deterministic development tests.
 *
 * The mock implements the current Function Code 03 slice and returns exception
 * frames for unsupported or malformed requests that contain enough header data.
 */
export async function createMockModbusTcpServer(
  options: MockModbusTcpServerOptions,
): Promise<MockModbusTcpServer> {
  const server = net.createServer((socket) => {
    socket.on("data", (request) => {
      socket.write(buildResponse(request, options));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock Modbus TCP server did not expose a TCP address");
  }

  return {
    port: address.port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function buildResponse(request: Buffer, options: MockModbusTcpServerOptions): Buffer {
  if (request.length < 8) {
    // Too short to recover transaction/unit/function fields for an exception frame.
    return Buffer.alloc(0);
  }

  const transactionId = request.readUInt16BE(0);
  const protocolId = request.readUInt16BE(2);
  const unitId = request.readUInt8(6);
  const functionCode = request.readUInt8(7);

  if (protocolId !== 0 || unitId !== options.unitId || functionCode !== 3) {
    return buildException(transactionId, unitId, functionCode, 1);
  }

  if (request.length < 12) {
    return buildException(transactionId, unitId, functionCode, 3);
  }

  const startAddress = request.readUInt16BE(8);
  const quantity = request.readUInt16BE(10);
  if (quantity < 1 || quantity > 125 || startAddress + quantity > 0x10000) {
    return buildException(transactionId, unitId, functionCode, 3);
  }

  const byteCount = quantity * 2;
  const response = Buffer.alloc(9 + byteCount);
  response.writeUInt16BE(transactionId, 0);
  response.writeUInt16BE(0, 2);
  response.writeUInt16BE(3 + byteCount, 4);
  response.writeUInt8(unitId, 6);
  response.writeUInt8(3, 7);
  response.writeUInt8(byteCount, 8);

  for (let index = 0; index < quantity; index += 1) {
    const address = startAddress + index;
    const value = options.holdingRegisters.get(address) ?? 0;
    response.writeUInt16BE(value, 9 + index * 2);
  }

  return response;
}

function buildException(
  transactionId: number,
  unitId: number,
  functionCode: number,
  exceptionCode: number,
): Buffer {
  const response = Buffer.alloc(9);
  response.writeUInt16BE(transactionId, 0);
  response.writeUInt16BE(0, 2);
  response.writeUInt16BE(3, 4);
  response.writeUInt8(unitId, 6);
  response.writeUInt8(functionCode | 0x80, 7);
  response.writeUInt8(exceptionCode, 8);
  return response;
}
