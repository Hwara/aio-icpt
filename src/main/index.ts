import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { AioIcptApp, parseProjectSettingsJson } from "../core/app/aioIcptApp.ts";

let mainWindow: BrowserWindow | undefined;
let aioIcpt: AioIcptApp | undefined;

/**
 * Creates the renderer window and initializes the Core application root.
 *
 * Main owns Electron lifecycle concerns only; domain behavior stays behind
 * AioIcptApp and is reached through IPC handlers.
 */
async function createWindow(): Promise<void> {
  aioIcpt ??= new AioIcptApp(app.getPath("userData"));

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

/**
 * Registers the narrow IPC surface exposed to the preload bridge.
 */
function registerIpcHandlers(): void {
  ipcMain.handle("projects:create", (_event, input) => getApp().createProject(input));
  ipcMain.handle("projects:list", () => getApp().listProjects());
  ipcMain.handle("projects:update", (_event, id: number, input) => getApp().updateProject(id, input));
  ipcMain.handle("projects:delete", (_event, id: number) => getApp().deleteProject(id));
  ipcMain.handle("projects:exportSettings", (_event, projectId: number) => exportProjectSettings(projectId));
  ipcMain.handle("projects:importSettings", () => importProjectSettings());
  ipcMain.handle("connections:save", (_event, input) => getApp().saveConnectionProfile(input));
  ipcMain.handle("connections:update", (_event, id: number, input) => getApp().updateConnectionProfile(id, input));
  ipcMain.handle("connections:delete", (_event, id: number) => getApp().deleteConnectionProfile(id));
  ipcMain.handle("connections:list", (_event, projectId: number) => getApp().listConnectionProfiles(projectId));
  ipcMain.handle("connections:recent", (_event, limit?: number) => getApp().listRecentConnectionProfiles(limit));
  ipcMain.handle("connections:test", (_event, profileId: number) => getApp().testConnectionProfile(profileId));
  ipcMain.handle("mock:start", () => getApp().startMockServer());
  ipcMain.handle("modbus:readHoldingRegisters", (_event, input) => getApp().executeReadHoldingRegisters(input));
  ipcMain.handle("runs:list", () => getApp().listTestRuns());
  ipcMain.handle("logs:list", (_event, testRunId?: number) => getApp().listProtocolLogs(testRunId));
  ipcMain.handle("measurements:list", (_event, testRunId?: number) => getApp().listMeasurementRecords(testRunId));
}

/**
 * Lets the user choose where to write a portable project settings JSON file.
 */
async function exportProjectSettings(projectId: number): Promise<{ canceled: boolean }> {
  const settings = getApp().exportProjectSettings(projectId);
  const options: SaveDialogOptions = {
    title: "Export Project Settings",
    defaultPath: `${toSafeFilename(settings.project.name)}.aio-icpt-project.json`,
    filters: [{ name: "AIO-ICPT Project Settings", extensions: ["json"] }],
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await writeFile(result.filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return { canceled: false };
}

/**
 * Lets the user choose a portable project settings JSON file and imports it as
 * a new project through the Core layer.
 */
async function importProjectSettings(): Promise<
  { canceled: true } | { canceled: false; projectId: number; connectionProfileIds: number[] }
> {
  const options: OpenDialogOptions = {
    title: "Import Project Settings",
    properties: ["openFile"],
    filters: [{ name: "AIO-ICPT Project Settings", extensions: ["json"] }],
  };
  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  const content = await readFile(result.filePaths[0], "utf8");
  const imported = getApp().importProjectSettings(parseProjectSettingsJson(content));
  return { canceled: false, ...imported };
}

function toSafeFilename(value: string): string {
  const safe = value.trim().replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-");
  return safe || "project-settings";
}

/**
 * Returns the initialized Core application root for IPC handlers.
 */
function getApp(): AioIcptApp {
  if (!aioIcpt) {
    throw new Error("AIO-ICPT app has not been initialized");
  }
  return aioIcpt;
}

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await aioIcpt?.close();
});
