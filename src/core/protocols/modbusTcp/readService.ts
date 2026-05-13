import type { SqliteRepository } from "../../db/sqliteRepository.ts";
import { ModbusTcpSession, type ModbusTcpConnectionConfig } from "./session.ts";

export type ExecuteModbusTcpReadInput = {
  repository: SqliteRepository;
  connectionName: string;
  connection: ModbusTcpConnectionConfig;
  operation: {
    startAddress: number;
    quantity: number;
  };
};

export type ExecuteModbusTcpReadResult = {
  testRunId: number;
  values: number[];
  txRawFrameHex: string;
  rxRawFrameHex: string;
  responseTimeMs: number;
};

/**
 * Runs the current Modbus TCP read use case end to end.
 *
 * The use case coordinates protocol I/O through ModbusTcpSession and persists
 * the test run, raw logs, and decoded values through the repository boundary.
 */
export async function executeModbusTcpRead(
  input: ExecuteModbusTcpReadInput,
): Promise<ExecuteModbusTcpReadResult> {
  const session = new ModbusTcpSession(input.connection);
  await session.connect();

  try {
    const result = await session.readHoldingRegisters(input.operation);
    const run = input.repository.transaction(() => {
      const createdRun = input.repository.createTestRun({
        connectionName: input.connectionName,
        protocol: "modbus-tcp",
        status: "success",
        responseTimeMs: result.responseTimeMs,
      });

      input.repository.addProtocolLog({
        testRunId: createdRun.id,
        level: "RAW",
        protocol: "modbus-tcp",
        direction: "TX",
        message: "Read Holding Registers request",
        rawFrame: result.txRawFrameHex,
      });
      input.repository.addProtocolLog({
        testRunId: createdRun.id,
        level: "RAW",
        protocol: "modbus-tcp",
        direction: "RX",
        message: "Read Holding Registers response",
        rawFrame: result.rxRawFrameHex,
      });

      result.values.forEach((value, index) => {
        input.repository.addMeasurementRecord({
          testRunId: createdRun.id,
          protocol: "modbus-tcp",
          target: `holding-register:${input.operation.startAddress + index}`,
          value,
          dataType: "uint16",
        });
      });

      return createdRun;
    });

    return {
      testRunId: run.id,
      values: result.values,
      txRawFrameHex: result.txRawFrameHex,
      rxRawFrameHex: result.rxRawFrameHex,
      responseTimeMs: result.responseTimeMs,
    };
  } finally {
    await session.disconnect();
  }
}
