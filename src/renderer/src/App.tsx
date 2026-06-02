import {
  Cable,
  Database,
  Download,
  Folder,
  Pencil,
  Play,
  PlugZap,
  Plus,
  RadioTower,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
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

type ProjectDialogState = {
  mode: "create" | "edit";
  id?: number;
  name: string;
  description: string;
};

type ConnectionDialogState = {
  mode: "create" | "edit";
  id?: number;
  name: string;
  protocol: "modbus-tcp";
  config: ConnectionConfig;
};

type ImportSettingsResult =
  | { canceled: true }
  | { canceled: false; projectId: number; connectionProfileIds: number[] };

type ExportSettingsResult = {
  canceled: boolean;
  filePath?: string;
};

declare global {
  interface Window {
    aioIcpt?: {
      projects: {
        create(input: unknown): Promise<{ id: number }>;
        list(): Promise<Project[]>;
        update(id: number, input: unknown): Promise<void>;
        delete(id: number): Promise<void>;
        exportSettings(projectId: number): Promise<ExportSettingsResult>;
        importSettings(): Promise<ImportSettingsResult>;
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
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [recentProfiles, setRecentProfiles] = useState<ConnectionProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | undefined>();
  const [projectDialog, setProjectDialog] = useState<ProjectDialogState | undefined>();
  const [connectionDialog, setConnectionDialog] = useState<ConnectionDialogState | undefined>();
  const [startAddress, setStartAddress] = useState(0);
  const [quantity, setQuantity] = useState(2);
  const [connectionTest, setConnectionTest] = useState<ConnectionTestResult | undefined>();
  const [result, setResult] = useState<ReadResult | undefined>();
  const [logs, setLogs] = useState<ProtocolLog[]>([]);
  const [status, setStatus] = useState("프로젝트와 장비 연결을 선택하세요.");

  const apiAvailable = Boolean(window.aioIcpt);
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const recentProjects = useMemo(() => projects.slice(0, 3), [projects]);

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

  async function loadProjects(preferredProjectId?: number): Promise<Project[]> {
    if (!window.aioIcpt) return [];
    const loadedProjects = await window.aioIcpt.projects.list();
    setProjects(loadedProjects);
    setSelectedProjectId((current) => {
      if (preferredProjectId && loadedProjects.some((project) => project.id === preferredProjectId)) {
        return preferredProjectId;
      }
      return loadedProjects.some((project) => project.id === current) ? current : loadedProjects[0]?.id;
    });
    return loadedProjects;
  }

  async function loadProfiles(projectId: number, preferredProfileId?: number): Promise<ConnectionProfile[]> {
    if (!window.aioIcpt) return [];
    const loadedProfiles = await window.aioIcpt.connections.list(projectId);
    setProfiles(loadedProfiles);
    setSelectedProfileId((current) => {
      if (preferredProfileId && loadedProfiles.some((profile) => profile.id === preferredProfileId)) {
        return preferredProfileId;
      }
      return loadedProfiles.some((profile) => profile.id === current) ? current : loadedProfiles[0]?.id;
    });
    return loadedProfiles;
  }

  async function loadRecentProfiles(): Promise<void> {
    if (!window.aioIcpt) return;
    setRecentProfiles(await window.aioIcpt.connections.recent(3));
  }

  function openCreateProjectDialog(): void {
    setProjectDialog({ mode: "create", name: "New project", description: "" });
  }

  function openEditProjectDialog(): void {
    if (!selectedProject) return;
    setProjectDialog({
      mode: "edit",
      id: selectedProject.id,
      name: selectedProject.name,
      description: selectedProject.description,
    });
  }

  async function saveProjectDialog(): Promise<void> {
    if (!window.aioIcpt || !projectDialog) return;

    try {
      if (projectDialog.mode === "edit" && projectDialog.id) {
        await window.aioIcpt.projects.update(projectDialog.id, {
          name: projectDialog.name,
          description: projectDialog.description,
        });
        setStatus(`Project #${projectDialog.id} updated.`);
        setProjectDialog(undefined);
        await loadProjects(projectDialog.id);
      } else {
        const created = await window.aioIcpt.projects.create({
          name: projectDialog.name,
          description: projectDialog.description,
        });
        setStatus(`Project #${created.id} created.`);
        setProjectDialog(undefined);
        await loadProjects(created.id);
      }
    } catch (error) {
      console.error(error);
      setStatus(`Project save failed: ${getErrorMessage(error)}`);
    }
  }

  async function deleteProject(): Promise<void> {
    if (!window.aioIcpt || !selectedProjectId) return;
    const profileCount = profiles.length;
    const confirmed = window.confirm(
      `Delete project "${selectedProject?.name ?? `#${selectedProjectId}`}"? This will also delete ${profileCount} device connection(s).`,
    );
    if (!confirmed) return;

    try {
      await window.aioIcpt.projects.delete(selectedProjectId);
      setSelectedProjectId(undefined);
      setProfiles([]);
      setSelectedProfileId(undefined);
      setConnectionTest(undefined);
      setStatus(`Project #${selectedProjectId} deleted.`);
      await loadProjects();
      await loadRecentProfiles();
    } catch (error) {
      console.error(error);
      setStatus(`Project delete failed: ${getErrorMessage(error)}`);
    }
  }

  async function exportProjectSettings(): Promise<void> {
    if (!window.aioIcpt || !selectedProjectId) return;

    try {
      const exported = await window.aioIcpt.projects.exportSettings(selectedProjectId);
      setStatus(exported.canceled ? "Project settings export canceled." : `Project settings exported to ${exported.filePath}.`);
    } catch (error) {
      console.error(error);
      setStatus(`Project settings export failed: ${getErrorMessage(error)}`);
    }
  }

  async function importProjectSettings(): Promise<void> {
    if (!window.aioIcpt) return;

    try {
      const imported = await window.aioIcpt.projects.importSettings();
      if (imported.canceled) {
        setStatus("Project settings import canceled.");
        return;
      }

      setStatus(
        `Project settings imported as Project #${imported.projectId} with ${imported.connectionProfileIds.length} connection profile(s).`,
      );
      await loadProjects(imported.projectId);
      await loadProfiles(imported.projectId, imported.connectionProfileIds[0]);
      await loadRecentProfiles();
    } catch (error) {
      console.error(error);
      setStatus(`Project settings import failed: ${getErrorMessage(error)}`);
    }
  }

  function openCreateConnectionDialog(initialConfig = defaultConfig): void {
    if (!selectedProjectId) return;
    setConnectionDialog({
      mode: "create",
      name: "New Modbus TCP device",
      protocol: "modbus-tcp",
      config: initialConfig,
    });
  }

  function openEditConnectionDialog(): void {
    if (!selectedProfile) return;
    setConnectionDialog({
      mode: "edit",
      id: selectedProfile.id,
      name: selectedProfile.name,
      protocol: "modbus-tcp",
      config: selectedProfile.config,
    });
  }

  async function saveConnectionDialog(): Promise<void> {
    if (!window.aioIcpt || !selectedProjectId || !connectionDialog) return;

    const input = {
      projectId: selectedProjectId,
      name: connectionDialog.name,
      protocol: connectionDialog.protocol,
      config: connectionDialog.config,
    };

    try {
      if (connectionDialog.mode === "edit" && connectionDialog.id) {
        await window.aioIcpt.connections.update(connectionDialog.id, input);
        setStatus(`Device connection #${connectionDialog.id} updated.`);
        setConnectionDialog(undefined);
        await loadProfiles(selectedProjectId, connectionDialog.id);
      } else {
        const saved = await window.aioIcpt.connections.save(input);
        setStatus(`Device connection #${saved.id} created.`);
        setConnectionDialog(undefined);
        await loadProfiles(selectedProjectId, saved.id);
      }
      await loadRecentProfiles();
    } catch (error) {
      console.error(error);
      setStatus(`Device connection save failed: ${getErrorMessage(error)}`);
    }
  }

  async function deleteConnection(): Promise<void> {
    if (!window.aioIcpt || !selectedProjectId || !selectedProfileId) return;
    const confirmed = window.confirm(
      `Delete device connection "${selectedProfile?.name ?? `#${selectedProfileId}`}"?`,
    );
    if (!confirmed) return;

    try {
      await window.aioIcpt.connections.delete(selectedProfileId);
      setSelectedProfileId(undefined);
      setConnectionTest(undefined);
      setStatus(`Device connection #${selectedProfileId} deleted.`);
      await loadProfiles(selectedProjectId);
      await loadRecentProfiles();
    } catch (error) {
      console.error(error);
      setStatus(`Device connection delete failed: ${getErrorMessage(error)}`);
    }
  }

  async function startMockServer(): Promise<void> {
    if (!window.aioIcpt || !selectedProjectId) return;

    try {
      const mock = await window.aioIcpt.mock.start();
      openCreateConnectionDialog({
        ...defaultConfig,
        host: mock.host,
        port: mock.port,
        unitId: mock.unitId,
      });
      setStatus(`Mock Modbus TCP server listening on ${mock.host}:${mock.port}. Complete the dialog to save it.`);
    } catch (error) {
      console.error(error);
      setStatus(`Mock server start failed: ${getErrorMessage(error)}`);
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
    if (!window.aioIcpt || !selectedProfile) return;

    try {
      setStatus("Read Holding Registers 실행 중...");
      const readResult = await window.aioIcpt.modbus.readHoldingRegisters({
        connectionName: selectedProfile.name,
        connection: selectedProfile.config,
        operation: { startAddress, quantity },
      });
      const runLogs = await window.aioIcpt.logs.list(readResult.testRunId);
      setResult(readResult);
      setLogs(runLogs);
      setStatus(
        `TestRun #${readResult.testRunId} 저장 완료. 응답 시간 ${readResult.responseTimeMs}ms. Read executed with device connection #${selectedProfile.id}.`,
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
          <h1>Project Device Workspace</h1>
        </div>
        <div className="statusLine">{status}</div>
      </header>

      <section className="workspace phaseTwoWorkspace">
        <aside className="panel stackPanel">
          <PanelTitle icon={<Folder size={18} />} title="Projects" />
          <div className="buttonRow">
            <button onClick={openCreateProjectDialog} disabled={!apiAvailable} title="Create project">
              <Plus size={16} />
              Create
            </button>
            <button onClick={openEditProjectDialog} disabled={!apiAvailable || !selectedProject} title="Edit project">
              <Pencil size={16} />
              Edit
            </button>
          </div>
          <div className="buttonRow">
            <button onClick={importProjectSettings} disabled={!apiAvailable} title="Import project settings">
              <Upload size={16} />
              Import
            </button>
            <button onClick={exportProjectSettings} disabled={!apiAvailable || !selectedProject} title="Export project settings">
              <Download size={16} />
              Export
            </button>
          </div>
          <button className="danger" onClick={deleteProject} disabled={!apiAvailable || !selectedProject} title="Delete project">
            <Trash2 size={16} />
            Delete Project
          </button>

          <div className="listBox tallList">
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

          <SummaryBlock
            title="Selected Project"
            rows={[
              ["Name", selectedProject?.name ?? "-"],
              ["Description", selectedProject?.description || "-"],
              ["Device Connections", String(profiles.length)],
            ]}
          />
          <RecentList title="Recent Projects" items={recentProjects.map((project) => project.name)} />
        </aside>

        <section className="panel stackPanel">
          <PanelTitle icon={<Cable size={18} />} title="Device Connections" />
          <div className="buttonRow">
            <button
              onClick={() => openCreateConnectionDialog()}
              disabled={!apiAvailable || !selectedProject}
              title="Create device connection"
            >
              <Plus size={16} />
              Create
            </button>
            <button onClick={openEditConnectionDialog} disabled={!apiAvailable || !selectedProfile} title="Edit device connection">
              <Pencil size={16} />
              Edit
            </button>
          </div>
          <div className="buttonRow">
            <button onClick={startMockServer} disabled={!apiAvailable || !selectedProject} title="Start mock server">
              <RadioTower size={16} />
              Mock
            </button>
            <button onClick={deleteConnection} disabled={!apiAvailable || !selectedProfile} title="Delete device connection">
              <Trash2 size={16} />
              Delete
            </button>
          </div>
          <button className="primary" onClick={testConnection} disabled={!apiAvailable || !selectedProfile} title="Test connection">
            <PlugZap size={16} />
            Test Connection
          </button>

          <div className="listBox tallList">
            {!selectedProjectId ? (
              <p className="empty">Select a project first.</p>
            ) : profiles.length === 0 ? (
              <p className="empty">No device connections in this project.</p>
            ) : (
              profiles.map((profile) => (
                <button
                  key={profile.id}
                  className={profile.id === selectedProfileId ? "listItem selected" : "listItem"}
                  onClick={() => setSelectedProfileId(profile.id)}
                  title={`Select ${profile.name}`}
                >
                  <span>{profile.name}</span>
                  <small>
                    {profile.config.host}:{profile.config.port}
                  </small>
                </button>
              ))
            )}
          </div>

          <SummaryBlock
            title="Selected Device Connection"
            rows={[
              ["Name", selectedProfile?.name ?? "-"],
              ["Protocol", selectedProfile?.protocol ?? "-"],
              ["Endpoint", selectedProfile ? `${selectedProfile.config.host}:${selectedProfile.config.port}` : "-"],
              ["Unit ID", selectedProfile ? String(selectedProfile.config.unitId) : "-"],
              ["Timeout", selectedProfile ? `${selectedProfile.config.timeoutMs} ms` : "-"],
            ]}
          />
          <p className="inlineStatus">
            {connectionTest ? `${connectionTest.message} ${connectionTest.responseTimeMs}ms` : "No connection test yet."}
          </p>
          <RecentList title="Recent Device Connections" items={recentProfiles.map((profile) => profile.name)} />
        </section>

        <section className="panel runPanel">
          <PanelTitle icon={<Play size={18} />} title="Read Holding Registers" />
          <ModeBadge
            variant={selectedProfile ? "saved" : "draft"}
            label={selectedProfile ? `Using Device Connection #${selectedProfile.id}` : "Select a device connection"}
          />
          <div className="fieldGrid">
            <NumberField label="Start Address" value={startAddress} onChange={setStartAddress} />
            <NumberField label="Quantity" value={quantity} onChange={setQuantity} />
          </div>
          <button className="primary" onClick={readRegisters} disabled={!apiAvailable || !selectedProfile} title="Run read operation">
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

      {projectDialog ? (
        <ProjectDialog
          dialog={projectDialog}
          onChange={setProjectDialog}
          onCancel={() => setProjectDialog(undefined)}
          onSave={saveProjectDialog}
        />
      ) : null}

      {connectionDialog ? (
        <ConnectionDialog
          dialog={connectionDialog}
          onChange={setConnectionDialog}
          onCancel={() => setConnectionDialog(undefined)}
          onSave={saveConnectionDialog}
        />
      ) : null}
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

function SummaryBlock({ title, rows }: { title: string; rows: Array<[string, string]> }): React.JSX.Element {
  return (
    <div className="summaryBlock">
      <h3>{title}</h3>
      {rows.map(([label, value]) => (
        <div key={label} className="summaryRow">
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
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

function ProjectDialog({
  dialog,
  onChange,
  onCancel,
  onSave,
}: {
  dialog: ProjectDialogState;
  onChange(dialog: ProjectDialogState): void;
  onCancel(): void;
  onSave(): void;
}): React.JSX.Element {
  return (
    <Modal title={dialog.mode === "create" ? "Create Project" : "Edit Project"} onCancel={onCancel}>
      <label>
        Project Name
        <input value={dialog.name} onChange={(event) => onChange({ ...dialog, name: event.target.value })} />
      </label>
      <label>
        Description
        <textarea
          value={dialog.description}
          onChange={(event) => onChange({ ...dialog, description: event.target.value })}
        />
      </label>
      <div className="buttonRow">
        <button onClick={onCancel} title="Cancel project edit">
          <X size={16} />
          Cancel
        </button>
        <button className="primary inlinePrimary" onClick={onSave} title="Save project">
          <Save size={16} />
          Save
        </button>
      </div>
    </Modal>
  );
}

function ConnectionDialog({
  dialog,
  onChange,
  onCancel,
  onSave,
}: {
  dialog: ConnectionDialogState;
  onChange(dialog: ConnectionDialogState): void;
  onCancel(): void;
  onSave(): void;
}): React.JSX.Element {
  return (
    <Modal title={dialog.mode === "create" ? "Create Device Connection" : "Edit Device Connection"} onCancel={onCancel}>
      <label>
        Name
        <input value={dialog.name} onChange={(event) => onChange({ ...dialog, name: event.target.value })} />
      </label>
      <label>
        Protocol
        <input value={dialog.protocol} disabled />
      </label>
      <label>
        Host
        <input
          value={dialog.config.host}
          onChange={(event) => onChange({ ...dialog, config: { ...dialog.config, host: event.target.value } })}
        />
      </label>
      <div className="fieldGrid">
        <NumberField
          label="Port"
          value={dialog.config.port}
          onChange={(port) => onChange({ ...dialog, config: { ...dialog.config, port } })}
        />
        <NumberField
          label="Unit ID"
          value={dialog.config.unitId}
          onChange={(unitId) => onChange({ ...dialog, config: { ...dialog.config, unitId } })}
        />
      </div>
      <NumberField
        label="Timeout ms"
        value={dialog.config.timeoutMs}
        onChange={(timeoutMs) => onChange({ ...dialog, config: { ...dialog.config, timeoutMs } })}
      />
      <div className="buttonRow">
        <button onClick={onCancel} title="Cancel connection edit">
          <X size={16} />
          Cancel
        </button>
        <button className="primary inlinePrimary" onClick={onSave} title="Save device connection">
          <Save size={16} />
          Save
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onCancel,
}: {
  title: string;
  children: React.ReactNode;
  onCancel(): void;
}): React.JSX.Element {
  return (
    <div className="modalBackdrop" role="presentation">
      <section className="modalPanel" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modalHeader">
          <h2>{title}</h2>
          <button className="iconButton" onClick={onCancel} title="Close dialog">
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
