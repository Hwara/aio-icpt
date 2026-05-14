import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

import { AioIcptApp } from "../src/core/app/aioIcptApp.ts";

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

    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, "Factory line A - updated");
    assert.equal(projects[0].description, "Updated description");

    app.deleteProject(project.id);

    assert.equal(app.listProjects().length, 0);
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
