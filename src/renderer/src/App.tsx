import { Cable, Database, Play, RadioTower, Save } from "lucide-react";
import { useEffect, useState } from "react";

type ConnectionConfig = {
  host: string;
  port: number;
  unitId: number;
  timeoutMs: number;
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
      connections: {
        save(input: unknown): Promise<{ id: number }>;
        list(): Promise<unknown[]>;
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
  const [connectionName, setConnectionName] = useState("Local mock");
  const [config, setConfig] = useState<ConnectionConfig>(defaultConfig);
  const [startAddress, setStartAddress] = useState(0);
  const [quantity, setQuantity] = useState(2);
  const [result, setResult] = useState<ReadResult | undefined>();
  const [logs, setLogs] = useState<ProtocolLog[]>([]);
  const [status, setStatus] = useState("Mock server를 시작하거나 실제 Modbus TCP 서버 정보를 입력하세요.");

  const apiAvailable = Boolean(window.aioIcpt);

  useEffect(() => {
    if (!apiAvailable) {
      setStatus("Electron preload API가 없어서 UI 미리보기 모드로 실행 중입니다.");
    }
  }, [apiAvailable]);

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
    if (!window.aioIcpt) return;
    try {
      const saved = await window.aioIcpt.connections.save({
        name: connectionName,
        protocol: "modbus-tcp",
        config,
      });
      setStatus(`Connection profile #${saved.id} saved.`);
    } catch (error) {
      console.error(error);
      setStatus(`Connection save failed: ${getErrorMessage(error)}`);
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
      setStatus(`TestRun #${readResult.testRunId} 저장 완료. 응답 시간 ${readResult.responseTimeMs}ms.`);
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
          <h1>Modbus TCP Protocol Workspace</h1>
        </div>
        <div className="statusLine">{status}</div>
      </header>

      <section className="workspace">
        <aside className="panel">
          <PanelTitle icon={<Cable size={18} />} title="Connection" />
          <label>
            Name
            <input value={connectionName} onChange={(event) => setConnectionName(event.target.value)} />
          </label>
          <label>
            Host
            <input value={config.host} onChange={(event) => setConfig({ ...config, host: event.target.value })} />
          </label>
          <div className="fieldGrid">
            <label>
              Port
              <input
                type="number"
                value={config.port}
                onChange={(event) => setConfig({ ...config, port: Number(event.target.value) })}
              />
            </label>
            <label>
              Unit ID
              <input
                type="number"
                value={config.unitId}
                onChange={(event) => setConfig({ ...config, unitId: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            Timeout ms
            <input
              type="number"
              value={config.timeoutMs}
              onChange={(event) => setConfig({ ...config, timeoutMs: Number(event.target.value) })}
            />
          </label>
          <div className="buttonRow">
            <button onClick={startMockServer} disabled={!apiAvailable} title="Start mock server">
              <RadioTower size={16} />
              Mock
            </button>
            <button onClick={saveConnection} disabled={!apiAvailable} title="Save connection profile">
              <Save size={16} />
              Save
            </button>
          </div>
        </aside>

        <section className="panel runPanel">
          <PanelTitle icon={<Play size={18} />} title="Read Holding Registers" />
          <div className="fieldGrid">
            <label>
              Start Address
              <input
                type="number"
                value={startAddress}
                onChange={(event) => setStartAddress(Number(event.target.value))}
              />
            </label>
            <label>
              Quantity
              <input type="number" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
            </label>
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
        </section>

        <aside className="panel logPanel">
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
        </aside>
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
