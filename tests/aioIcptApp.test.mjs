import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { AioIcptApp, parseProjectSettingsJson } from "../src/core/app/aioIcptApp.ts";

function createTempApp() {
  const directory = mkdtempSync(join(tmpdir(), "aio-icpt-"));
  const app = new AioIcptApp(directory);

  return {
    app,
    directory,
    async close() {
      await app.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("manages projects through the Core facade", async () => {
  const { app, close } = createTempApp();

  try {
    const project = app.createProject({
      name: "Factory line A",
      description: "Commissioning bench",
    });

    app.updateProject(project.id, {
      name: "Factory line A - updated",
      description: "Updated description",
    });

    const projects = app.listProjects();
    const updated = projects.find((item) => item.id === project.id);

    assert.equal(projects.length, 2);
    assert.equal(updated.name, "Factory line A - updated");
    assert.equal(updated.description, "Updated description");

    app.deleteProject(project.id);

    assert.equal(app.listProjects().length, 1);
  } finally {
    await close();
  }
});

test("creates a default project on app startup", async () => {
  const { app, close } = createTempApp();

  try {
    const projects = app.listProjects();

    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, "Default project");
  } finally {
    await close();
  }
});

test("rejects invalid Modbus TCP connection profiles in Core", async () => {
  const { app, close } = createTempApp();

  try {
    const project = app.createProject({ name: "Factory line A", description: "" });

    assert.throws(
      () =>
        app.saveConnectionProfile({
          projectId: project.id,
          name: " ",
          protocol: "modbus-tcp",
          config: { host: "127.0.0.1", port: 1502, unitId: 1, timeoutMs: 1000 },
        }),
      /Connection profile name is required/,
    );

    assert.throws(
      () =>
        app.saveConnectionProfile({
          projectId: project.id,
          name: "Local mock",
          protocol: "modbus-tcp",
          config: { host: " ", port: 1502, unitId: 1, timeoutMs: 1000 },
        }),
      /host is required/,
    );

    assert.throws(
      () =>
        app.saveConnectionProfile({
          projectId: project.id,
          name: "Local mock",
          protocol: "modbus-tcp",
          config: { host: "127.0.0.1", port: 70000, unitId: 1, timeoutMs: 1000 },
        }),
      /port must be an integer from 1 to 65535/,
    );

    assert.throws(
      () =>
        app.saveConnectionProfile({
          projectId: project.id,
          name: "Local mock",
          protocol: "modbus-tcp",
          config: { host: "127.0.0.1", port: 1502, unitId: 248, timeoutMs: 1000 },
        }),
      /unitId must be an integer from 1 to 247/,
    );

    assert.throws(
      () =>
        app.saveConnectionProfile({
          projectId: project.id,
          name: "Local mock",
          protocol: "modbus-tcp",
          config: { host: "127.0.0.1", port: 1502, unitId: 1, timeoutMs: 0 },
        }),
      /timeoutMs must be a positive integer/,
    );
  } finally {
    await close();
  }
});

test("tests a saved Modbus TCP connection profile against the mock server", async () => {
  const { app, close } = createTempApp();

  try {
    const project = app.createProject({ name: "Factory line A", description: "" });
    const mock = await app.startMockServer();
    const profile = app.saveConnectionProfile({
      projectId: project.id,
      name: "Local mock",
      protocol: "modbus-tcp",
      config: {
        host: mock.host,
        port: mock.port,
        unitId: mock.unitId,
        timeoutMs: 1000,
      },
    });

    const result = await app.testConnectionProfile(profile.id);

    assert.equal(result.ok, true);
    assert.equal(result.profileId, profile.id);
    assert.equal(result.protocol, "modbus-tcp");
    assert.equal(typeof result.responseTimeMs, "number");
    assert.match(result.message, /Connection test succeeded/);
    assert.equal(app.listTestRuns().length, 0);
  } finally {
    await close();
  }
});

test("rejects connection tests for missing profiles", async () => {
  const { app, close } = createTempApp();

  try {
    await assert.rejects(() => app.testConnectionProfile(999), /Connection profile not found/);
  } finally {
    await close();
  }
});

test("exports project settings without database identifiers or run history", async () => {
  const { app, close } = createTempApp();

  try {
    const project = app.createProject({ name: "Factory line A", description: "Commissioning bench" });
    app.saveConnectionProfile({
      projectId: project.id,
      name: "PLC 1",
      protocol: "modbus-tcp",
      config: { host: "192.168.0.10", port: 502, unitId: 1, timeoutMs: 1000 },
    });
    app.saveConnectionProfile({
      projectId: project.id,
      name: "PLC 2",
      protocol: "modbus-tcp",
      config: { host: "192.168.0.11", port: 502, unitId: 2, timeoutMs: 1500 },
    });

    const exported = app.exportProjectSettings(project.id);

    assert.equal(exported.schemaVersion, 1);
    assert.equal(exported.project.name, "Factory line A");
    assert.equal(exported.project.description, "Commissioning bench");
    assert.equal(exported.connectionProfiles.length, 2);
    assert.equal(exported.connectionProfiles[0].name, "PLC 2");
    assert.equal(exported.connectionProfiles[0].protocol, "modbus-tcp");
    assert.equal(exported.connectionProfiles[0].config.host, "192.168.0.11");
    assert.equal(typeof exported.exportedAt, "string");
    assert.equal("id" in exported.project, false);
    assert.equal("projectId" in exported.connectionProfiles[0], false);
    assert.equal("testRuns" in exported, false);
  } finally {
    await close();
  }
});

test("rejects project settings export when a stored profile has invalid config", async () => {
  const { app, close } = createTempApp();

  try {
    const project = app.createProject({ name: "Factory line A", description: "" });
    app.saveConnectionProfile({
      projectId: project.id,
      name: "PLC 1",
      protocol: "modbus-tcp",
      config: { host: "192.168.0.10", port: 502, unitId: 1, timeoutMs: 1000 },
    });

    const profile = app.listConnectionProfiles(project.id)[0];
    app.repository.updateConnectionProfile(profile.id, {
      projectId: project.id,
      name: "PLC 1",
      protocol: "modbus-tcp",
      config: { host: "192.168.0.10", port: 70000, unitId: 1, timeoutMs: 1000 },
    });

    assert.throws(() => app.exportProjectSettings(project.id), /port must be an integer from 1 to 65535/);
  } finally {
    await close();
  }
});

test("imports project settings as a new project without overwriting existing data", async () => {
  const { app, close } = createTempApp();

  try {
    const existingProject = app.createProject({ name: "Factory line A", description: "Existing" });
    app.saveConnectionProfile({
      projectId: existingProject.id,
      name: "Existing PLC",
      protocol: "modbus-tcp",
      config: { host: "192.168.0.20", port: 502, unitId: 1, timeoutMs: 1000 },
    });

    const imported = app.importProjectSettings({
      schemaVersion: 1,
      exportedAt: "2026-06-02T00:00:00.000Z",
      project: { name: "Factory line A", description: "Imported" },
      connectionProfiles: [
        {
          name: "Imported PLC",
          protocol: "modbus-tcp",
          config: { host: "192.168.0.30", port: 502, unitId: 3, timeoutMs: 1200 },
        },
      ],
    });

    const projects = app.listProjects();
    const existingProfiles = app.listConnectionProfiles(existingProject.id);
    const importedProfiles = app.listConnectionProfiles(imported.projectId);

    assert.notEqual(imported.projectId, existingProject.id);
    assert.equal(projects.filter((project) => project.name === "Factory line A").length, 2);
    assert.equal(existingProfiles.length, 1);
    assert.equal(existingProfiles[0].name, "Existing PLC");
    assert.equal(importedProfiles.length, 1);
    assert.equal(importedProfiles[0].name, "Imported PLC");
    assert.equal(importedProfiles[0].projectId, imported.projectId);
  } finally {
    await close();
  }
});

test("rejects imported project settings with unsupported schema or invalid profile config", async () => {
  const { app, close } = createTempApp();

  try {
    assert.throws(
      () =>
        app.importProjectSettings({
          schemaVersion: 2,
          exportedAt: "2026-06-02T00:00:00.000Z",
          project: { name: "Factory line A", description: "" },
          connectionProfiles: [],
        }),
      /Unsupported project settings schemaVersion/,
    );

    assert.throws(
      () =>
        app.importProjectSettings({
          schemaVersion: 1,
          exportedAt: "2026-06-02T00:00:00.000Z",
          project: { name: "Factory line A", description: "" },
          connectionProfiles: [
            {
              name: "Bad PLC",
              protocol: "modbus-tcp",
              config: { host: "192.168.0.30", port: 70000, unitId: 3, timeoutMs: 1200 },
            },
          ],
        }),
      /port must be an integer from 1 to 65535/,
    );
  } finally {
    await close();
  }
});

test("requires a project id when listing connection profiles through Core", async () => {
  const { app, close } = createTempApp();

  try {
    assert.throws(() => app.listConnectionProfiles(), /Project is required/);
  } finally {
    await close();
  }
});

test("clamps recent connection profile limits in Core", async () => {
  const { app, close } = createTempApp();

  try {
    const project = app.createProject({ name: "Factory line A", description: "" });
    for (let index = 0; index < 25; index += 1) {
      app.saveConnectionProfile({
        projectId: project.id,
        name: `PLC ${index}`,
        protocol: "modbus-tcp",
        config: { host: `192.168.0.${index + 1}`, port: 502, unitId: 1, timeoutMs: 1000 },
      });
    }

    assert.equal(app.listRecentConnectionProfiles(undefined).length, 5);
    assert.equal(app.listRecentConnectionProfiles(0).length, 1);
    assert.equal(app.listRecentConnectionProfiles(-1).length, 1);
    assert.equal(app.listRecentConnectionProfiles(9999).length, 20);
  } finally {
    await close();
  }
});

test("parses project settings JSON with a clear error for invalid JSON", () => {
  assert.throws(
    () => parseProjectSettingsJson("{not-json"),
    /Selected file is not a valid JSON project settings file/,
  );
});
