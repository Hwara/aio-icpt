import { contextBridge, ipcRenderer } from "electron";

/**
 * Renderer-facing API surface.
 *
 * Each method delegates to a fixed IPC channel and avoids exposing Node,
 * Electron, filesystem, database, or TCP objects to the renderer process.
 */
const api = {
  connections: {
    save: (input: unknown) => ipcRenderer.invoke("connections:save", input),
    list: () => ipcRenderer.invoke("connections:list"),
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
