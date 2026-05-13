import { DatabaseSync } from "node:sqlite";

export type TestRunInput = {
  connectionName: string;
  protocol: string;
  status: "success" | "failure";
  responseTimeMs: number;
};

export type ProtocolLogInput = {
  testRunId: number;
  level: "TRACE" | "DEBUG" | "INFO" | "WARN" | "ERROR" | "RAW";
  protocol: string;
  direction: "TX" | "RX" | "NONE";
  message: string;
  rawFrame?: string;
};

export type MeasurementRecordInput = {
  testRunId: number;
  protocol: string;
  target: string;
  value: number;
  dataType: string;
};

export type ConnectionProfileInput = {
  name: string;
  protocol: string;
  config: Record<string, unknown>;
};

/**
 * SQLite-backed repository for the current local persistence boundary.
 *
 * Core use cases depend on this class instead of issuing SQL directly, so
 * storage details remain isolated from protocol and IPC code.
 */
export class SqliteRepository {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  /**
   * Creates the minimal Phase 1 tables if they do not already exist.
   */
  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        connection_name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        status TEXT NOT NULL,
        response_time_ms INTEGER NOT NULL,
        started_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS protocol_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_run_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        protocol TEXT NOT NULL,
        direction TEXT NOT NULL,
        message TEXT NOT NULL,
        raw_frame TEXT,
        FOREIGN KEY (test_run_id) REFERENCES test_runs(id)
      );

      CREATE TABLE IF NOT EXISTS measurement_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_run_id INTEGER NOT NULL,
        protocol TEXT NOT NULL,
        target TEXT NOT NULL,
        value REAL NOT NULL,
        data_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (test_run_id) REFERENCES test_runs(id)
      );

      CREATE TABLE IF NOT EXISTS connection_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Stores a protocol connection profile with protocol-specific config as JSON.
   */
  saveConnectionProfile(input: ConnectionProfileInput): { id: number } {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO connection_profiles
          (name, protocol, config_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.name, input.protocol, JSON.stringify(input.config), now, now);

    return { id: Number(result.lastInsertRowid) };
  }

  /**
   * Returns saved connection profiles as renderer-friendly objects.
   */
  listConnectionProfiles(): any[] {
    return this.db
      .prepare("SELECT * FROM connection_profiles ORDER BY id DESC")
      .all()
      .map((profile: any) => ({
        id: profile.id,
        name: profile.name,
        protocol: profile.protocol,
        config: JSON.parse(profile.config_json),
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
      }));
  }

  /**
   * Records one protocol test execution summary.
   */
  createTestRun(input: TestRunInput): { id: number } {
    const result = this.db
      .prepare(
        `INSERT INTO test_runs
          (connection_name, protocol, status, response_time_ms, started_at)
          VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.connectionName, input.protocol, input.status, input.responseTimeMs, new Date().toISOString());

    return { id: Number(result.lastInsertRowid) };
  }

  /**
   * Runs related repository writes atomically.
   *
   * Use cases call this when a test run, protocol logs, and measurements must
   * either all persist together or all roll back together.
   */
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Appends one structured protocol log row to an existing test run.
   */
  addProtocolLog(input: ProtocolLogInput): void {
    this.db
      .prepare(
        `INSERT INTO protocol_logs
          (test_run_id, timestamp, level, protocol, direction, message, raw_frame)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.testRunId,
        new Date().toISOString(),
        input.level,
        input.protocol,
        input.direction,
        input.message,
        input.rawFrame ?? null,
      );
  }

  /**
   * Appends one decoded measurement value to an existing test run.
   */
  addMeasurementRecord(input: MeasurementRecordInput): void {
    this.db
      .prepare(
        `INSERT INTO measurement_records
          (test_run_id, protocol, target, value, data_type, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.testRunId, input.protocol, input.target, input.value, input.dataType, new Date().toISOString());
  }

  /**
   * Lists stored test run summaries with the newest run first.
   */
  listTestRuns(): any[] {
    return this.db.prepare("SELECT * FROM test_runs ORDER BY id DESC").all();
  }

  /**
   * Lists protocol logs globally or for a specific test run.
   */
  listProtocolLogs(testRunId?: number): any[] {
    if (testRunId === undefined) {
      return this.db.prepare("SELECT * FROM protocol_logs ORDER BY id ASC").all();
    }
    return this.db.prepare("SELECT * FROM protocol_logs WHERE test_run_id = ? ORDER BY id ASC").all(testRunId);
  }

  /**
   * Lists decoded measurement records globally or for a specific test run.
   */
  listMeasurementRecords(testRunId?: number): any[] {
    if (testRunId === undefined) {
      return this.db.prepare("SELECT * FROM measurement_records ORDER BY id ASC").all();
    }
    return this.db
      .prepare("SELECT * FROM measurement_records WHERE test_run_id = ? ORDER BY id ASC")
      .all(testRunId);
  }

  /**
   * Closes the underlying SQLite connection.
   */
  close(): void {
    this.db.close();
  }
}
