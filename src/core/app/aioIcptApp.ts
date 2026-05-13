import { join } from "node:path";

import { SqliteRepository } from "../db/sqliteRepository.ts";
import { createMockModbusTcpServer, type MockModbusTcpServer } from "../protocols/modbusTcp/mockServer.ts";
import { executeModbusTcpRead } from "../protocols/modbusTcp/readService.ts";

export type SaveConnectionProfileRequest = {
  name: string;
  protocol: "modbus-tcp";
  config: {
    host: string;
    port: number;
    unitId: number;
    timeoutMs: number;
  };
};

export type ReadHoldingRegistersRequest = {
  connectionName: string;
  connection: SaveConnectionProfileRequest["config"];
  operation: {
    startAddress: number;
    quantity: number;
  };
};

export class AioIcptApp {
  private readonly repository: SqliteRepository;
  private mockServer: MockModbusTcpServer | undefined;

  constructor(dataDirectory: string) {
    this.repository = new SqliteRepository(join(dataDirectory, "aio-icpt.sqlite"));
    this.repository.migrate();
  }

  saveConnectionProfile(input: SaveConnectionProfileRequest): { id: number } {
    return this.repository.saveConnectionProfile(input);
  }

  listConnectionProfiles(): any[] {
    return this.repository.listConnectionProfiles();
  }

  async startMockServer(): Promise<{ host: string; port: number; unitId: number }> {
    if (this.mockServer) {
      return { host: "127.0.0.1", port: this.mockServer.port, unitId: 1 };
    }

    this.mockServer = await createMockModbusTcpServer({
      host: "127.0.0.1",
      port: 0,
      unitId: 1,
      holdingRegisters: new Map([
        [0, 123],
        [1, 200],
        [2, 3300],
        [3, 4400],
      ]),
    });

    return { host: "127.0.0.1", port: this.mockServer.port, unitId: 1 };
  }

  async executeReadHoldingRegisters(input: ReadHoldingRegistersRequest): Promise<any> {
    return await executeModbusTcpRead({
      repository: this.repository,
      connectionName: input.connectionName,
      connection: input.connection,
      operation: input.operation,
    });
  }

  listTestRuns(): any[] {
    return this.repository.listTestRuns();
  }

  listProtocolLogs(testRunId?: number): any[] {
    return this.repository.listProtocolLogs(testRunId);
  }

  listMeasurementRecords(testRunId?: number): any[] {
    return this.repository.listMeasurementRecords(testRunId);
  }

  async close(): Promise<void> {
    if (this.mockServer) {
      await this.mockServer.close();
      this.mockServer = undefined;
    }
    this.repository.close();
  }
}
