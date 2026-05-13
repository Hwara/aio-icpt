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
  const transactionId = request.readUInt16BE(0);
  const protocolId = request.readUInt16BE(2);
  const unitId = request.readUInt8(6);
  const functionCode = request.readUInt8(7);

  if (protocolId !== 0 || unitId !== options.unitId || functionCode !== 3) {
    return buildException(transactionId, unitId, 3, 1);
  }

  const startAddress = request.readUInt16BE(8);
  const quantity = request.readUInt16BE(10);
  const byteCount = quantity * 2;
  const response = Buffer.alloc(9 + byteCount);
  response.writeUInt16BE(transactionId, 0);
  response.writeUInt16BE(0, 2);
  response.writeUInt16BE(3 + byteCount, 4);
  response.writeUInt8(unitId, 6);
  response.writeUInt8(3, 7);
  response.writeUInt8(byteCount, 8);

  for (let index = 0; index < quantity; index += 1) {
    const value = options.holdingRegisters.get(startAddress + index) ?? 0;
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
