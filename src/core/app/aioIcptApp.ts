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

/**
 * Application root for the current AIO-ICPT vertical slice.
 *
 * Main process IPC handlers call this facade instead of reaching into the
 * repository or protocol implementations directly, keeping Electron-specific
 * code outside the Core layer.
 */
export class AioIcptApp {
  private readonly repository: SqliteRepository;
  private mockServer: MockModbusTcpServer | undefined;
  private startingMockServer: Promise<MockModbusTcpServer> | undefined;

  constructor(dataDirectory: string) {
    this.repository = new SqliteRepository(join(dataDirectory, "aio-icpt.sqlite"));
    this.repository.migrate();
  }

  /**
   * Persists a reusable Modbus TCP connection profile through the repository boundary.
   */
  saveConnectionProfile(input: SaveConnectionProfileRequest): { id: number } {
    return this.repository.saveConnectionProfile(input);
  }

  /**
   * Lists saved connection profiles for renderer display without exposing SQLite details.
   */
  listConnectionProfiles(): any[] {
    return this.repository.listConnectionProfiles();
  }

  /**
   * Starts or reuses the built-in Modbus TCP mock server for local test runs.
   */
  async startMockServer(): Promise<{ host: string; port: number; unitId: number }> {
    if (this.mockServer) {
      return { host: "127.0.0.1", port: this.mockServer.port, unitId: 1 };
    }

    // Share one startup promise so concurrent IPC calls do not create multiple servers.
    this.startingMockServer ??= createMockModbusTcpServer({
      host: "127.0.0.1",
      port: 0,
      unitId: 1,
      holdingRegisters: new Map([
        [0, 123],
        [1, 200],
        [2, 3300],
        [3, 4400],
      ]),
    })
      .then((mockServer) => {
        this.mockServer = mockServer;
        return mockServer;
      })
      .finally(() => {
        this.startingMockServer = undefined;
      });

    const mockServer = await this.startingMockServer;
    return { host: "127.0.0.1", port: mockServer.port, unitId: 1 };
  }

  /**
   * Executes the Modbus TCP read use case and stores the resulting run data.
   */
  async executeReadHoldingRegisters(input: ReadHoldingRegistersRequest): Promise<any> {
    return await executeModbusTcpRead({
      repository: this.repository,
      connectionName: input.connectionName,
      connection: input.connection,
      operation: input.operation,
    });
  }

  /**
   * Lists stored test runs for history-oriented renderer views.
   */
  listTestRuns(): any[] {
    return this.repository.listTestRuns();
  }

  /**
   * Lists protocol logs, optionally scoped to a single stored test run.
   */
  listProtocolLogs(testRunId?: number): any[] {
    return this.repository.listProtocolLogs(testRunId);
  }

  /**
   * Lists measurement records, optionally scoped to a single stored test run.
   */
  listMeasurementRecords(testRunId?: number): any[] {
    return this.repository.listMeasurementRecords(testRunId);
  }

  /**
   * Releases resources owned by the application root.
   *
   * Repository shutdown is always attempted even if mock server shutdown fails.
   */
  async close(): Promise<void> {
    try {
      if (this.mockServer) {
        const mockServer = this.mockServer;
        this.mockServer = undefined;
        await mockServer.close();
      }
    } finally {
      this.repository.close();
    }
  }
}
