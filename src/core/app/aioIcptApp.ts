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

export type ProjectSettingsExport = {
  schemaVersion: 1;
  exportedAt: string;
  project: ProjectRequest;
  connectionProfiles: Array<Omit<SaveConnectionProfileRequest, "projectId">>;
};

export type ImportProjectSettingsResult = {
  projectId: number;
  connectionProfileIds: number[];
};

type ConnectionProfileInputLike = {
  projectId: number;
  name: string;
  protocol: unknown;
  config: Record<string, unknown>;
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
    this.repository.ensureDefaultProject();
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
  listConnectionProfiles(projectId: number): ConnectionProfile[] {
    if (!Number.isInteger(projectId) || projectId <= 0) {
      throw new Error("Project is required");
    }

    return this.repository.listConnectionProfiles(projectId);
  }

  /**
   * Lists recently changed connection profiles across projects.
   */
  listRecentConnectionProfiles(limit = 5): ConnectionProfile[] {
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 20) : 5;
    return this.repository.listRecentConnectionProfiles(safeLimit);
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
    } catch (error) {
      return {
        ok: false,
        profileId,
        protocol: "modbus-tcp",
        responseTimeMs: Math.round(performance.now() - startedAt),
        message: `Connection test failed: ${getErrorMessage(error)}`,
      };
    } finally {
      await session.disconnect();
    }
  }

  /**
   * Builds a portable settings snapshot for one project.
   *
   * Runtime identifiers and test history are intentionally excluded so the
   * payload can be imported as a fresh project on another workstation.
   */
  exportProjectSettings(projectId: number): ProjectSettingsExport {
    const project = this.repository.listProjects().find((item) => item.id === projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      project: {
        name: project.name,
        description: project.description,
      },
      connectionProfiles: this.repository.listConnectionProfiles(projectId).map((profile) => {
        const validated = validateConnectionProfile(profile);

        return {
          name: validated.name,
          protocol: validated.protocol,
          config: validated.config,
        };
      }),
    };
  }

  /**
   * Imports portable project settings as a new project.
   *
   * Existing projects and profiles are never overwritten; imported profiles are
   * re-owned by the newly created project.
   */
  importProjectSettings(payload: unknown): ImportProjectSettingsResult {
    const imported = validateProjectSettingsImport(payload);

    return this.repository.transaction(() => {
      const project = this.createProject(imported.project);
      const connectionProfileIds = imported.connectionProfiles.map((profile) => {
        const saved = this.saveConnectionProfile({
          projectId: project.id,
          ...profile,
        });
        return saved.id;
      });

      return {
        projectId: project.id,
        connectionProfileIds,
      };
    });
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

function validateConnectionProfile(
  input: SaveConnectionProfileRequest | ConnectionProfile | ConnectionProfileInputLike,
): SaveConnectionProfileRequest {
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

function validateProjectSettingsImport(payload: unknown): ProjectSettingsExport {
  if (!isRecord(payload)) {
    throw new Error("Project settings import payload must be an object");
  }

  if (payload.schemaVersion !== 1) {
    throw new Error("Unsupported project settings schemaVersion");
  }

  if (!isRecord(payload.project)) {
    throw new Error("Project settings project must be an object");
  }

  const project = normalizeProjectInput({
    name: typeof payload.project.name === "string" ? payload.project.name : "",
    description: typeof payload.project.description === "string" ? payload.project.description : "",
  });

  if (!Array.isArray(payload.connectionProfiles)) {
    throw new Error("Project settings connectionProfiles must be an array");
  }

  const connectionProfiles = payload.connectionProfiles.map((profile) => {
    if (!isRecord(profile)) {
      throw new Error("Project settings connection profile must be an object");
    }

    const validated = validateConnectionProfile({
      projectId: 1,
      name: typeof profile.name === "string" ? profile.name : "",
      protocol: profile.protocol,
      config: isRecord(profile.config) ? profile.config : {},
    });

    return {
      name: validated.name,
      protocol: validated.protocol,
      config: validated.config,
    };
  });

  return {
    schemaVersion: 1,
    exportedAt: typeof payload.exportedAt === "string" ? payload.exportedAt : new Date().toISOString(),
    project,
    connectionProfiles,
  };
}

export function parseProjectSettingsJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Selected file is not a valid JSON project settings file");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
