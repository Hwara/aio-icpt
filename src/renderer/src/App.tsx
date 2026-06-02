import { Cable, Database, Folder, Play, PlugZap, RadioTower, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Project = {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
};

type ConnectionConfig = {
  host: string;
  port: number;
  unitId: number;
  timeoutMs: number;
};

type ConnectionProfile = {
  id: number;
  projectId: number;
  name: string;
  protocol: "modbus-tcp";
  config: ConnectionConfig;
  createdAt: string;
  updatedAt: string;
};

type ConnectionTestResult = {
  ok: boolean;
  profileId: number;
  protocol: "modbus-tcp";
  responseTimeMs: number;
  message: string;
};

type ReadResult = {
  testRunId: number;
  values: number[];
  txRawFrameHex: string;
  rxRawFrameHex: string;
  responseTimeMs: number;
};

type ProtocolLog = {
  id: number;
  direction: "TX" | "RX" | "NONE";
  level: string;
  message: string;
  raw_frame: string;
  timestamp: string;
};

declare global {
  interface Window {
    aioIcpt?: {
      projects: {
        create(input: unknown): Promise<{ id: number }>;
        list(): Promise<Project[]>;
        update(id: number, input: unknown): Promise<void>;
        delete(id: number): Promise<void>;
      };
      connections: {
        save(input: unknown): Promise<{ id: number }>;
        update(id: number, input: unknown): Promise<void>;
        delete(id: number): Promise<void>;
        list(projectId?: number): Promise<ConnectionProfile[]>;
        recent(limit?: number): Promise<ConnectionProfile[]>;
        test(profileId: number): Promise<ConnectionTestResult>;
      };
      mock: {
        start(): Promise<{ host: string; port: number; unitId: number }>;
      };
      modbus: {
        readHoldingRegisters(input: unknown): Promise<ReadResult>;
      };
      logs: {
        list(testRunId?: number): Promise<ProtocolLog[]>;
      };
      runs: {
        list(): Promise<unknown[]>;
      };
      measurements: {
        list(testRunId?: number): Promise<unknown[]>;
      };
    };
  }
}

const defaultConfig: ConnectionConfig = {
  host: "127.0.0.1",
  port: 1502,
  unitId: 1,
  timeoutMs: 1000,
};

export function App(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>();
  const [projectName, setProjectName] = useState("Factory line A");
  const [projectDescription, setProjectDescription] = useState("Commissioning workspace");
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [recentProfiles, setRecentProfiles] = useState<ConnectionProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | undefined>();
  const [connectionName, setConnectionName] = useState("Local mock");
  const [config, setConfig] = useState<ConnectionConfig>(defaultConfig);
  const [startAddress, setStartAddress] = useState(0);
  const [quantity, setQuantity] = useState(2);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | undefined>();
  const [result, setResult] = useState<ReadResult | undefined>();
  const [logs, setLogs] = useState<ProtocolLog[]>([]);
  const [status, setStatus] = useState("프로젝트를 만들고 연결 프로파일을 저장하세요.");

  const apiAvailable = Boolean(window.aioIcpt);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const recentProjects = useMemo(() => projects.slice(0, 3), [projects]);
  const isCreatingProject = selectedProjectId === undefined;
  const isCreatingConnection = selectedProfileId === undefined;

  useEffect(() => {
    if (!apiAvailable) {
      setStatus("Electron preload API가 없어서 UI 미리보기 모드로 실행 중입니다.");
      return;
    }

    void loadProjects();
    void loadRecentProfiles();
  }, [apiAvailable]);

  useEffect(() => {
    if (!selectedProjectId || !window.aioIcpt) {
      setProfiles([]);
      setSelectedProfileId(undefined);
      return;
    }

    void loadProfiles(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!selectedProject) {
      return;
    }

    setProjectName(selectedProject.name);
    setProjectDescription(selectedProject.description);
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProfile) {
      return;
    }

    setConnectionName(selectedProfile.name);
    setConfig(selectedProfile.config);
  }, [selectedProfile]);

  async function loadProjects(): Promise<void> {
    if (!window.aioIcpt) return;
    const loadedProjects = await window.aioIcpt.projects.list();
    setProjects(loadedProjects);
    setSelectedProjectId((current) => current ?? loadedProjects[0]?.id);
  }

  async function loadProfiles(projectId: number): Promise<void> {
    if (!window.aioIcpt) return;
    const loadedProfiles = await window.aioIcpt.connections.list(projectId);
    setProfiles(loadedProfiles);
    setSelectedProfileId((current) =>
      loadedProfiles.some((profile) => profile.id === current) ? current : loadedProfiles[0]?.id,
    );
  }

  async function loadRecentProfiles(): Promise<void> {
    if (!window.aioIcpt) return;
    setRecentProfiles(await window.aioIcpt.connections.recent(3));
  }

  async function saveProject(): Promise<void> {
    if (!window.aioIcpt) return;
    try {
      if (selectedProjectId) {
        await window.aioIcpt.projects.update(selectedProjectId, {
          name: projectName,
          description: projectDescription,
        });
        setStatus(`Project #${selectedProjectId} updated.`);
      } else {
        const created = await window.aioIcpt.projects.create({
          name: projectName,
          description: projectDescription,
        });
        setSelectedProjectId(created.id);
        setStatus(`Project #${created.id} created.`);
      }
      await loadProjects();
    } catch (error) {
      console.error(error);
      setStatus(`Project save failed: ${getErrorMessage(error)}`);
    }
  }

  async function createNewProject(): Promise<void> {
    setSelectedProjectId(undefined);
    setProjectName("New project");
    setProjectDescription("");
    setProfiles([]);
    setSelectedProfileId(undefined);
    setConnectionTest(undefined);
    setStatus("Creating a new project. Save to add it to the project list.");
  }

  async function deleteProject(): Promise<void> {
    if (!window.aioIcpt || !selectedProjectId) return;
    try {
      await window.aioIcpt.projects.delete(selectedProjectId);
      setSelectedProjectId(undefined);
      setProfiles([]);
      setSelectedProfileId(undefined);
      setStatus(`Project #${selectedProjectId} deleted.`);
      await loadProjects();
      await loadRecentProfiles();
    } catch (error) {
      console.error(error);
      setStatus(`Project delete failed: ${getErrorMessage(error)}`);
    }
  }

  async function startMockServer(): Promise<void> {
    if (!window.aioIcpt) return;
    try {
      const mock = await window.aioIcpt.mock.start();
      setConfig((current) => ({ ...current, host: mock.host, port: mock.port, unitId: mock.unitId }));
      setStatus(`Mock Modbus TCP server listening on ${mock.host}:${mock.port}`);
    } catch (error) {
      console.error(error);
      setStatus(`Mock server start failed: ${getErrorMessage(error)}`);
    }
  }

  async function saveConnection(): Promise<void> {
    if (!window.aioIcpt || !selectedProjectId) return;
    const input = {
      projectId: selectedProjectId,
      name: connectionName,
      protocol: "modbus-tcp",
      config,
    };

    try {
      if (selectedProfileId) {
        await window.aioIcpt.connections.update(selectedProfileId, input);
        setStatus(`Connection profile #${selectedProfileId} updated.`);
      } else {
        const saved = await window.aioIcpt.connections.save(input);
        setSelectedProfileId(saved.id);
        setStatus(`Connection profile #${saved.id} saved.`);
      }
      await loadProfiles(selectedProjectId);
      await loadRecentProfiles();
    } catch (error) {
      console.error(error);
      setStatus(`Connection save failed: ${getErrorMessage(error)}`);
    }
  }

  async function createNewConnection(): Promise<void> {
    setSelectedProfileId(undefined);
    setConnectionName("New Modbus TCP profile");
    setConfig(defaultConfig);
    setConnectionTest(undefined);
    setStatus("Creating a new connection profile. Save to store it under the selected project.");
  }

  async function deleteConnection(): Promise<void> {
    if (!window.aioIcpt || !selectedProjectId || !selectedProfileId) return;
    try {
      await window.aioIcpt.connections.delete(selectedProfileId);
      setStatus(`Connection profile #${selectedProfileId} deleted.`);
      setSelectedProfileId(undefined);
      await loadProfiles(selectedProjectId);
      await loadRecentProfiles();
    } catch (error) {
      console.error(error);
      setStatus(`Connection delete failed: ${getErrorMessage(error)}`);
    }
  }

  async function testConnection(): Promise<void> {
    if (!window.aioIcpt || !selectedProfileId) return;
    try {
      const testResult = await window.aioIcpt.connections.test(selectedProfileId);
      setConnectionTest(testResult);
      setStatus(`${testResult.message} ${testResult.responseTimeMs}ms.`);
    } catch (error) {
      console.error(error);
      setConnectionTest(undefined);
      setStatus(`Connection test failed: ${getErrorMessage(error)}`);
    }
  }

  async function readRegisters(): Promise<void> {
    if (!window.aioIcpt) return;
    try {
      setStatus("Read Holding Registers 실행 중...");
      const readResult = await window.aioIcpt.modbus.readHoldingRegisters({
        connectionName,
        connection: config,
        operation: { startAddress, quantity },
      });
      const runLogs = await window.aioIcpt.logs.list(readResult.testRunId);
      setResult(readResult);
      setLogs(runLogs);
      const source = selectedProfileId
        ? `saved profile #${selectedProfileId}`
        : "unsaved connection settings";
      setStatus(
        `TestRun #${readResult.testRunId} 저장 완료. 응답 시간 ${readResult.responseTimeMs}ms. Read executed with ${source}.`,
      );
    } catch (error) {
      console.error(error);
      setResult(undefined);
      setLogs([]);
      setStatus(`Read Holding Registers failed: ${getErrorMessage(error)}`);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AIO-ICPT</p>
          <h1>Project Protocol Workspace</h1>
        </div>
        <div className="statusLine">{status}</div>
      </header>

      <section className="workspace phaseTwoWorkspace">
        <aside className="panel stackPanel">
          <PanelTitle icon={<Folder size={18} />} title="Projects" />
          <ModeBadge
            variant={isCreatingProject ? "draft" : "saved"}
            label={isCreatingProject ? "Creating new project" : `Editing Project #${selectedProjectId}`}
          />
          <div className="listBox">
            {projects.length === 0 ? (
              <p className="empty">No projects yet.</p>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  className={project.id === selectedProjectId ? "listItem selected" : "listItem"}
                  onClick={() => setSelectedProjectId(project.id)}
                  title={`Select ${project.name}`}
                >
                  <span>{project.name}</span>
                  <small>#{project.id}</small>
                </button>
              ))
            )}
          </div>

          <label>
            Project Name
            <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
          </label>
          <label>
            Description
            <input value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} />
          </label>
          <div className="buttonRow">
            <button onClick={createNewProject} disabled={!apiAvailable} title="New project">
              <Folder size={16} />
              New
            </button>
            <button onClick={saveProject} disabled={!apiAvailable} title="Save project">
              <Save size={16} />
              {isCreatingProject ? "Create" : "Update"}
            </button>
          </div>
          <button className="danger" onClick={deleteProject} disabled={!apiAvailable || !selectedProjectId} title="Delete project">
            <Trash2 size={16} />
            Delete Project
          </button>

          <RecentList title="Recent Projects" items={recentProjects.map((project) => project.name)} />
        </aside>

        <section className="panel stackPanel">
          <PanelTitle icon={<Cable size={18} />} title="Connection Profiles" />
          <ModeBadge
            variant={isCreatingConnection ? "draft" : "saved"}
            label={isCreatingConnection ? "Creating new connection" : `Editing Profile #${selectedProfileId}`}
          />
          <div className="listBox">
            {!selectedProjectId ? (
              <p className="empty">Select a project first.</p>
            ) : profiles.length === 0 ? (
              <p className="empty">No profiles in this project.</p>
            ) : (
              profiles.map((profile) => (
                <button
                  key={profile.id}
                  className={profile.id === selectedProfileId ? "listItem selected" : "listItem"}
                  onClick={() => setSelectedProfileId(profile.id)}
                  title={`Select ${profile.name}`}
                >
                  <span>{profile.name}</span>
                  <small>{profile.config.host}:{profile.config.port}</small>
                </button>
              ))
            )}
          </div>

          <label>
            Name
            <input value={connectionName} onChange={(event) => setConnectionName(event.target.value)} />
          </label>
          <label>
            Host
            <input value={config.host} onChange={(event) => setConfig({ ...config, host: event.target.value })} />
          </label>
          <div className="fieldGrid">
            <NumberField label="Port" value={config.port} onChange={(port) => setConfig({ ...config, port })} />
            <NumberField label="Unit ID" value={config.unitId} onChange={(unitId) => setConfig({ ...config, unitId })} />
          </div>
          <NumberField
            label="Timeout ms"
            value={config.timeoutMs}
            onChange={(timeoutMs) => setConfig({ ...config, timeoutMs })}
          />
          <div className="buttonRow">
            <button onClick={startMockServer} disabled={!apiAvailable} title="Start mock server">
              <RadioTower size={16} />
              Mock
            </button>
            <button onClick={saveConnection} disabled={!apiAvailable || !selectedProjectId} title="Save connection profile">
              <Save size={16} />
              {isCreatingConnection ? "Create" : "Update"}
            </button>
          </div>
          <div className="buttonRow">
            <button onClick={createNewConnection} disabled={!apiAvailable || !selectedProjectId} title="New connection profile">
              <Cable size={16} />
              New
            </button>
            <button
              onClick={deleteConnection}
              disabled={!apiAvailable || !selectedProfileId}
              title="Delete connection profile"
            >
              <Trash2 size={16} />
              Delete
            </button>
          </div>
          <button className="primary" onClick={testConnection} disabled={!apiAvailable || !selectedProfileId} title="Test connection">
            <PlugZap size={16} />
            Test Connection
          </button>
          <p className="inlineStatus">
            {connectionTest ? `${connectionTest.message} ${connectionTest.responseTimeMs}ms` : "No connection test yet."}
          </p>

          <RecentList title="Recent Connections" items={recentProfiles.map((profile) => profile.name)} />
        </section>

        <section className="panel runPanel">
          <PanelTitle icon={<Play size={18} />} title="Read Holding Registers" />
          <ModeBadge
            variant={isCreatingConnection ? "draft" : "saved"}
            label={isCreatingConnection ? "Draft connection" : `Saved Profile #${selectedProfileId}`}
          />
          <div className="fieldGrid">
            <NumberField label="Start Address" value={startAddress} onChange={setStartAddress} />
            <NumberField label="Quantity" value={quantity} onChange={setQuantity} />
          </div>
          <button className="primary" onClick={readRegisters} disabled={!apiAvailable} title="Run read operation">
            <Play size={16} />
            Execute Read
          </button>

          <div className="resultGrid">
            <div>
              <span>Decoded Values</span>
              <strong>{result ? result.values.join(", ") : "-"}</strong>
            </div>
            <div>
              <span>Response Time</span>
              <strong>{result ? `${result.responseTimeMs} ms` : "-"}</strong>
            </div>
            <div>
              <span>Test Run</span>
              <strong>{result ? `#${result.testRunId}` : "-"}</strong>
            </div>
          </div>

          <PanelTitle icon={<Database size={18} />} title="Raw / Structured Log" />
          <div className="logList">
            {logs.length === 0 ? (
              <p className="empty">No protocol logs yet.</p>
            ) : (
              logs.map((log) => (
                <article key={log.id} className="logRow">
                  <div className="logMeta">
                    <span>{log.level}</span>
                    <span>{log.direction}</span>
                  </div>
                  <p>{log.message}</p>
                  <code>{log.raw_frame}</code>
                </article>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }): React.JSX.Element {
  return (
    <div className="panelTitle">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function ModeBadge({ label, variant }: { label: string; variant: "draft" | "saved" }): React.JSX.Element {
  return <span className={`modeBadge ${variant}`}>{label}</span>;
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
}): React.JSX.Element {
  return (
    <label>
      {label}
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function RecentList({ title, items }: { title: string; items: string[] }): React.JSX.Element {
  return (
    <div className="recentBlock">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty">No recent items.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
