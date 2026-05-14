import { join } from "node:path";

import { SqliteRepository } from "../db/sqliteRepository.ts";
import { createMockModbusTcpServer, type MockModbusTcpServer } from "../protocols/modbusTcp/mockServer.ts";
import { executeModbusTcpRead } from "../protocols/modbusTcp/readService.ts";
import { ModbusTcpSession, type ModbusTcpConnectionConfig } from "../protocols/modbusTcp/session.ts";

export type SaveConnectionProfileRequest = {
  projectId: number;
  name: string;
  protocol: "modbus-tcp";
  config: {
    host: string;
    port: number;
    unitId: number;
    timeoutMs: number;
  };
};

export type ProjectRequest = {
  name: string;
  description: string;
};

export type ReadHoldingRegistersRequest = {
  connectionName: string;
  connection: SaveConnectionProfileRequest["config"];
  operation: {
    startAddress: number;
    quantity: number;
  };
};

export type ConnectionProfile = {
  id: number;
  projectId: number;
  name: string;
  protocol: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

export type TestRun = {
  id: number;
  connection_name: string;
  protocol: string;
  status: "success" | "failure";
  response_time_ms: number;
  started_at: string;
};

export type ProtocolLog = {
  id: number;
  test_run_id: number;
  timestamp: string;
  level: "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "RAW";
  protocol: string;
  direction: "TX" | "RX" | "NONE";
  message: string;
  raw_frame: string | null;
};

export type MeasurementRecord = {
  id: number;
  test_run_id: number;
  protocol: string;
  target: string;
  value: number;
  data_type: string;
  timestamp: string;
};

export type ReadHoldingRegistersResult = {
  testRunId: number;
  values: number[];
  txRawFrameHex: string;
  rxRawFrameHex: string;
  responseTimeMs: number;
};

export type ConnectionTestResult = {
  ok: boolean;
  profileId: number;
  protocol: "modbus-tcp";
  responseTimeMs: number;
  message: string;
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
   * Creates a project as the top-level workspace for profiles and test assets.
   */
  createProject(input: ProjectRequest): { id: number } {
    const project = normalizeProjectInput(input);
    return this.repository.createProject(project);
  }

  /**
   * Lists projects for renderer project selection.
   */
  listProjects(): Project[] {
    return this.repository.listProjects();
  }

  /**
   * Updates a project name and description.
   */
  updateProject(id: number, input: ProjectRequest): void {
    const project = normalizeProjectInput(input);
    this.repository.updateProject(id, project);
  }

  /**
   * Deletes a project and its owned connection profiles.
   */
  deleteProject(id: number): void {
    this.repository.deleteProject(id);
  }

  /**
   * Persists a reusable Modbus TCP connection profile through the repository boundary.
   */
  saveConnectionProfile(input: SaveConnectionProfileRequest): { id: number } {
    return this.repository.saveConnectionProfile(validateConnectionProfile(input));
  }

  /**
   * Updates a reusable Modbus TCP connection profile.
   */
  updateConnectionProfile(id: number, input: SaveConnectionProfileRequest): void {
    this.repository.updateConnectionProfile(id, validateConnectionProfile(input));
  }

  /**
   * Deletes a reusable Modbus TCP connection profile.
   */
  deleteConnectionProfile(id: number): void {
    this.repository.deleteConnectionProfile(id);
  }

  /**
   * Lists saved connection profiles for renderer display without exposing SQLite details.
   */
  listConnectionProfiles(projectId?: number): ConnectionProfile[] {
    return this.repository.listConnectionProfiles(projectId);
  }

  /**
   * Lists recently changed connection profiles across projects.
   */
  listRecentConnectionProfiles(limit = 5): ConnectionProfile[] {
    return this.repository.listRecentConnectionProfiles(limit);
  }

  /**
   * Opens and closes a saved profile to verify that the endpoint is reachable.
   */
  async testConnectionProfile(profileId: number): Promise<ConnectionTestResult> {
    const profile = this.repository.getConnectionProfile(profileId);
    if (!profile) {
      throw new Error("Connection profile not found");
    }

    const validated = validateConnectionProfile(profile);
    const session = new ModbusTcpSession(validated.config);
    const startedAt = performance.now();

    try {
      await session.connect();
      return {
        ok: true,
        profileId,
        protocol: "modbus-tcp",
        responseTimeMs: Math.round(performance.now() - startedAt),
        message: "Connection test succeeded.",
      };
    } finally {
      await session.disconnect();
    }
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
  async executeReadHoldingRegisters(input: ReadHoldingRegistersRequest): Promise<ReadHoldingRegistersResult> {
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
  listTestRuns(): TestRun[] {
    return this.repository.listTestRuns();
  }

  /**
   * Lists protocol logs, optionally scoped to a single stored test run.
   */
  listProtocolLogs(testRunId?: number): ProtocolLog[] {
    return this.repository.listProtocolLogs(testRunId);
  }

  /**
   * Lists measurement records, optionally scoped to a single stored test run.
   */
  listMeasurementRecords(testRunId?: number): MeasurementRecord[] {
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

function normalizeProjectInput(input: ProjectRequest): ProjectRequest {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Project name is required");
  }

  return {
    name,
    description: input.description.trim(),
  };
}

function validateConnectionProfile(input: SaveConnectionProfileRequest | ConnectionProfile): SaveConnectionProfileRequest {
  if (!Number.isInteger(input.projectId) || input.projectId <= 0) {
    throw new Error("Project is required");
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("Connection profile name is required");
  }

  if (input.protocol !== "modbus-tcp") {
    throw new Error("Only modbus-tcp connection profiles are supported in Phase 2");
  }

  const config = normalizeModbusTcpConfig(input.config);

  return {
    projectId: input.projectId,
    name,
    protocol: "modbus-tcp",
    config,
  };
}

function normalizeModbusTcpConfig(config: Record<string, unknown>): ModbusTcpConnectionConfig {
  const host = typeof config.host === "string" ? config.host.trim() : "";
  if (!host) {
    throw new Error("Modbus TCP host is required");
  }

  if (!isIntegerInRange(config.port, 1, 65535)) {
    throw new Error("Modbus TCP port must be an integer from 1 to 65535");
  }

  if (!isIntegerInRange(config.unitId, 1, 247)) {
    throw new Error("Modbus TCP unitId must be an integer from 1 to 247");
  }

  if (!Number.isInteger(config.timeoutMs) || Number(config.timeoutMs) <= 0) {
    throw new Error("Modbus TCP timeoutMs must be a positive integer");
  }

  return {
    host,
    port: Number(config.port),
    unitId: Number(config.unitId),
    timeoutMs: Number(config.timeoutMs),
  };
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
}
