import { contextBridge, ipcRenderer } from "electron";

/**
 * Renderer-facing API surface.
 *
 * Each method delegates to a fixed IPC channel and avoids exposing Node,
 * Electron, filesystem, database, or TCP objects to the renderer process.
 */
const api = {
  projects: {
    create: (input: unknown) => ipcRenderer.invoke("projects:create", input),
    list: () => ipcRenderer.invoke("projects:list"),
    update: (id: number, input: unknown) => ipcRenderer.invoke("projects:update", id, input),
    delete: (id: number) => ipcRenderer.invoke("projects:delete", id),
    exportSettings: (projectId: number) => ipcRenderer.invoke("projects:exportSettings", projectId),
    importSettings: () => ipcRenderer.invoke("projects:importSettings"),
  },
  connections: {
    save: (input: unknown) => ipcRenderer.invoke("connections:save", input),
    update: (id: number, input: unknown) => ipcRenderer.invoke("connections:update", id, input),
    delete: (id: number) => ipcRenderer.invoke("connections:delete", id),
    list: (projectId?: number) => ipcRenderer.invoke("connections:list", projectId),
    recent: (limit?: number) => ipcRenderer.invoke("connections:recent", limit),
    test: (profileId: number) => ipcRenderer.invoke("connections:test", profileId),
  },
  mock: {
    start: () => ipcRenderer.invoke("mock:start"),
  },
  modbus: {
    readHoldingRegisters: (input: unknown) => ipcRenderer.invoke("modbus:readHoldingRegisters", input),
  },
  runs: {
    list: () => ipcRenderer.invoke("runs:list"),
  },
  logs: {
    list: (testRunId?: number) => ipcRenderer.invoke("logs:list", testRunId),
  },
  measurements: {
    list: (testRunId?: number) => ipcRenderer.invoke("measurements:list", testRunId),
  },
};

contextBridge.exposeInMainWorld("aioIcpt", api);
