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

export type ProjectInput = {
  name: string;
  description: string;
};

export type ConnectionProfileInput = {
  projectId: number;
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
  private transactionDepth = 0;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  /**
   * Creates the minimal Phase 1 tables if they do not already exist.
   */
  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

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
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        protocol TEXT NOT NULL,
        config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    this.addProjectIdToLegacyConnectionProfiles();
  }

  /**
   * Creates a project as the top-level unit for profiles and test assets.
   */
  createProject(input: ProjectInput): { id: number } {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO projects
          (name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?)`,
      )
      .run(input.name, input.description, now, now);

    return { id: Number(result.lastInsertRowid) };
  }

  /**
   * Ensures the app has a startup workspace for project-owned assets.
   */
  ensureDefaultProject(): { id: number } {
    const project: any = this.db
      .prepare("SELECT id FROM projects ORDER BY updated_at DESC, id DESC LIMIT 1")
      .get();

    if (project) {
      return { id: project.id };
    }

    return this.createProject({
      name: "Default project",
      description: "Automatically created startup workspace.",
    });
  }

  /**
   * Lists projects with the most recently changed project first.
   */
  listProjects(): any[] {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY updated_at DESC, id DESC")
      .all()
      .map((project: any) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
      }));
  }

  /**
   * Updates a project display name and description.
   */
  updateProject(id: number, input: ProjectInput): void {
    const result = this.db
      .prepare(
        `UPDATE projects
          SET name = ?, description = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(input.name, input.description, new Date().toISOString(), id);

    if (result.changes === 0) {
      throw new Error("Project not found");
    }
  }

  /**
   * Deletes a project and its owned connection profiles.
   */
  deleteProject(id: number): void {
    const result = this.db.prepare("DELETE FROM projects WHERE id = ?").run(id);

    if (result.changes === 0) {
      throw new Error("Project not found");
    }
  }

  /**
   * Stores a protocol connection profile with protocol-specific config as JSON.
   */
  saveConnectionProfile(input: ConnectionProfileInput): { id: number } {
    const now = new Date().toISOString();
    return this.transaction(() => {
      const result = this.db
        .prepare(
          `INSERT INTO connection_profiles
            (project_id, name, protocol, config_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(input.projectId, input.name, input.protocol, JSON.stringify(input.config), now, now);
      this.touchProject(input.projectId);

      return { id: Number(result.lastInsertRowid) };
    });
  }

  /**
   * Updates an existing protocol connection profile.
   */
  updateConnectionProfile(id: number, input: ConnectionProfileInput): void {
    this.transaction(() => {
      const existing = this.getConnectionProfile(id);
      const result = this.db
        .prepare(
          `UPDATE connection_profiles
            SET project_id = ?, name = ?, protocol = ?, config_json = ?, updated_at = ?
            WHERE id = ?`,
        )
        .run(input.projectId, input.name, input.protocol, JSON.stringify(input.config), new Date().toISOString(), id);

      if (result.changes === 0 || !existing) {
        throw new Error("Connection profile not found");
      }

      this.touchProject(existing.projectId);
      if (existing.projectId !== input.projectId) {
        this.touchProject(input.projectId);
      }
    });
  }

  /**
   * Deletes a saved protocol connection profile.
   */
  deleteConnectionProfile(id: number): void {
    this.transaction(() => {
      const existing = this.getConnectionProfile(id);
      const result = this.db.prepare("DELETE FROM connection_profiles WHERE id = ?").run(id);

      if (result.changes === 0 || !existing) {
        throw new Error("Connection profile not found");
      }

      this.touchProject(existing.projectId);
    });
  }

  /**
   * Returns saved connection profiles for one project as renderer-friendly objects.
   */
  listConnectionProfiles(projectId?: number): any[] {
    const rows =
      projectId === undefined
        ? this.db.prepare("SELECT * FROM connection_profiles ORDER BY updated_at DESC, id DESC").all()
        : this.db
            .prepare("SELECT * FROM connection_profiles WHERE project_id = ? ORDER BY updated_at DESC, id DESC")
            .all(projectId);

    return rows.map((profile: any) => ({
      id: profile.id,
      projectId: profile.project_id,
      name: profile.name,
      protocol: profile.protocol,
      config: JSON.parse(profile.config_json),
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    }));
  }

  /**
   * Returns one connection profile by id.
   */
  getConnectionProfile(id: number): any | undefined {
    const profile: any = this.db.prepare("SELECT * FROM connection_profiles WHERE id = ?").get(id);
    if (!profile) {
      return undefined;
    }

    return {
      id: profile.id,
      projectId: profile.project_id,
      name: profile.name,
      protocol: profile.protocol,
      config: JSON.parse(profile.config_json),
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    };
  }

  /**
   * Lists the most recently changed connection profiles across projects.
   */
  listRecentConnectionProfiles(limit: number): any[] {
    return this.db
      .prepare("SELECT * FROM connection_profiles ORDER BY updated_at DESC, id DESC LIMIT ?")
      .all(limit)
      .map((profile: any) => ({
        id: profile.id,
        projectId: profile.project_id,
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
    if (this.transactionDepth > 0) {
      this.transactionDepth += 1;
      try {
        return fn();
      } finally {
        this.transactionDepth -= 1;
      }
    }

    this.db.exec("BEGIN");
    this.transactionDepth = 1;
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.transactionDepth = 0;
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

  private addProjectIdToLegacyConnectionProfiles(): void {
    const columns: any[] = this.db.prepare("PRAGMA table_info(connection_profiles)").all();
    if (columns.some((column) => column.name === "project_id")) {
      return;
    }

    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO projects
          (name, description, created_at, updated_at)
          VALUES (?, ?, ?, ?)`,
      )
      .run("Migrated Phase 1 project", "Automatically created for existing connection profiles.", now, now);

    this.db.exec("ALTER TABLE connection_profiles ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE");
    this.db
      .prepare("UPDATE connection_profiles SET project_id = ? WHERE project_id IS NULL")
      .run(Number(result.lastInsertRowid));
  }

  private touchProject(projectId: number): void {
    this.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), projectId);
  }
}
