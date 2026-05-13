import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";

import { AioIcptApp } from "../core/app/aioIcptApp.ts";

let mainWindow: BrowserWindow | undefined;
let aioIcpt: AioIcptApp | undefined;

async function createWindow(): Promise<void> {
  aioIcpt = new AioIcptApp(app.getPath("userData"));

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

function registerIpcHandlers(): void {
  ipcMain.handle("connections:save", (_event, input) => getApp().saveConnectionProfile(input));
  ipcMain.handle("connections:list", () => getApp().listConnectionProfiles());
  ipcMain.handle("mock:start", () => getApp().startMockServer());
  ipcMain.handle("modbus:readHoldingRegisters", (_event, input) => getApp().executeReadHoldingRegisters(input));
  ipcMain.handle("runs:list", () => getApp().listTestRuns());
  ipcMain.handle("logs:list", (_event, testRunId?: number) => getApp().listProtocolLogs(testRunId));
  ipcMain.handle("measurements:list", (_event, testRunId?: number) => getApp().listMeasurementRecords(testRunId));
}

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
