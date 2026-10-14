import { expect, test, type Page } from "@playwright/test";

const catalog = ["Atlas", "Beacon", "Canvas", "Dock", "Echo", "Forge"].map(
  (name, index) => ({
    id: name.toLowerCase(),
    name,
    category: index % 2 ? "Tools" : "Media",
    description: `${name} helps you organize your home server with a clear and approachable interface.`,
    verified: index < 3,
    source: "homios",
    icon: "",
    storage: [],
  }),
);
async function mocks(page: Page) {
  await page.route("**/api/integrations/status", (route) =>
    route.fulfill({
      json: {
        capabilities: Object.fromEntries(
          ["coolify", "immich", "codex", "codeServer"].map((id) => [
            id,
            { state: "disabled" },
          ]),
        ),
      },
    }),
  );
  await page.route("**/api/drives/available", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/apps/catalog*", (route) =>
    route.fulfill({ json: { apps: catalog, catalogAvailable: true } }),
  );
  await page.route("**/api/integrations/coolify/status*", (route) =>
    route.fulfill({
      json: {
        appStoreState: "available",
        connected: true,
        authenticated: true,
        reachable: true,
        mode: "managed",
        storageAware: true,
      },
    }),
  );
  await page.route("**/api/apps/storage-mounts", (route) =>
    route.fulfill({ json: { mounts: [] } }),
  );
  await page.route("**/api/apps/installed*", (route) =>
    route.fulfill({
      json: {
        apps: [
          {
            id: "installed-atlas",
            catalogId: "atlas",
            name: "Atlas",
            status: "running",
            primaryUrl: "http://atlas.test",
            managedByHomiOS: true,
          },
        ],
      },
    }),
  );
  await page.route("**/api/apps/*/icon", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="#3b82f6"/><circle cx="32" cy="32" r="16" fill="#b8dcff"/></svg>',
    }),
  );
}
async function capture(page: Page, path: string) {
  const active = page.locator(".homios-window:not([inert])");
  if (await active.count()) await expect(active).toHaveCSS("opacity", "1");
  await page.screenshot({ path, animations: "disabled" });
}

test.beforeEach(async ({ page }) => {
  await mocks(page);
});
async function openFolder(page: Page, name: string, touch: boolean) {
  const node = page.getByRole("option", { name, exact: true });
  if (touch) await node.tap();
  else await node.dblclick();
}

test("folder loading never shows previous-path data and errors have retry", async ({
  page,
}, info) => {
  await page.goto(`/files?path=/${info.project.name}/Source`);
  await expect(
    page.getByRole("option", { name: "alpha.txt", exact: true }),
  ).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/files?*", async (route) => {
    if (
      new URL(route.request().url()).searchParams
        .get("path")
        ?.endsWith("/Source/Nested")
    ) {
      await gate;
      await route.fulfill({
        json: [
          {
            name: "inside.txt",
            path: `${info.project.name}/Source/Nested/inside.txt`,
            size: 1,
          },
        ],
      });
    } else await route.continue();
  });
  await openFolder(page, "Nested", info.project.name !== "desktop");
  await expect(
    page.getByRole("status", { name: "Loading folder" }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "alpha.txt", exact: true }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByRole("option", { name: "inside.txt", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("option", { name: "alpha.txt", exact: true }),
  ).toBeVisible();
  await page.goto("/files?path=/does-not-exist");
  await expect(
    page.getByRole("alert").filter({ hasText: "no longer exists" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("This folder is empty")).toHaveCount(0);
});

test("bulk copy uses a destination sheet and supports filename conflicts", async ({
  page,
}, info) => {
  await page.goto(`/files?path=/${info.project.name}/Source`);
  if (info.project.name !== "desktop")
    await page
      .getByRole("button", { name: "Select files", exact: true })
      .click();
  await page
    .getByRole("checkbox", { name: "Select alpha.txt", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select bravo.txt", exact: true })
    .check();
  await page.getByRole("button", { name: "Copy to…", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Parent destination folder" })
    .click();
  await dialog.getByRole("button", { name: "Target", exact: true }).click();
  await dialog.getByRole("button", { name: "Copy here", exact: true }).click();
  await expect(page.getByLabel("File operation batches")).toContainText(
    "2 completed",
    { timeout: 30000 },
  );
  await page.getByRole("button", { name: "Copy to…", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Parent destination folder" })
    .click();
  await dialog.getByRole("button", { name: "Target", exact: true }).click();
  await dialog.getByRole("button", { name: "Copy here", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "An item with this name already exists" }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "Apply to remaining conflicts" })
    .check();
  await page.getByRole("button", { name: "Keep both", exact: true }).click();
  await expect(
    page.getByLabel("File operation batches").locator("summary").last(),
  ).toContainText("2 completed", { timeout: 30000 });
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          `/api/files?path=/${info.project.name}/Target&includeCounts=false`,
        );
        return (await response.json()).map(
          (file: { name: string }) => file.name,
        );
      },
      { timeout: 30000 },
    )
    .toEqual(expect.arrayContaining(["alpha (2).txt", "bravo (2).txt"]));
  await page.goto(`/files?path=/${info.project.name}/Target`);
  await expect(
    page.getByRole("option", { name: "alpha (2).txt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "bravo (2).txt", exact: true }),
  ).toBeVisible();
});

test("app details, logs, history, and independent action states", async ({
  page,
}) => {
  await page.route("**/api/apps/installed-atlas/logs", (route) =>
    route.fulfill({
      json: {
        logs: [
          { message: "Server is ready" },
          { message: "Request completed" },
        ],
      },
    }),
  );
  await page.goto("/dashboard?view=app-store");
  await page.getByLabel("Search apps").fill("Atlas");
  await page
    .getByRole("button")
    .filter({ has: page.getByRole("heading", { name: "Atlas", exact: true }) })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: "About this app" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Logs", exact: true }).click();
  await expect(page.getByLabel("Application log output")).toContainText(
    "Server is ready",
  );
  await page.getByLabel("Search logs").fill("Request");
  await expect(page.getByLabel("Application log output")).not.toContainText(
    "Server is ready",
  );
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goBack();
  await expect(page.getByLabel("Search apps")).toHaveValue("Atlas");
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "About this app" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "About this app" }),
  ).toBeVisible();
});

test("responsive light and dark layouts, reduced motion, and bounded listings", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/files?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("path") === "/large")
      await route.fulfill({
        json: Array.from({ length: 10000 }, (_, index) => ({
          name: `Long descriptive filename number ${index}.txt`,
          path: `large/file-${index}.txt`,
          size: index,
        })),
      });
    else await route.continue();
  });
  await page.goto("/files?path=/large");
  await expect(
    page.getByRole("listbox", { name: "Files" }).getByRole("option").first(),
  ).toBeVisible();
  expect(
    await page
      .getByRole("listbox", { name: "Files" })
      .getByRole("option")
      .count(),
  ).toBeLessThan(120);
  for (const theme of ["light", "dark"])
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((value) => {
        document.documentElement.classList.toggle("dark", value === "dark");
      }, theme);
      await capture(
        page,
        `.cache/screenshots/${info.project.name}-${theme}-${width}-files.png`,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  await page.goto("/dashboard?view=app-store");
  await expect(page.getByLabel("Search apps")).toBeVisible();
  await capture(page, `.cache/screenshots/${info.project.name}-store.png`);
});

test("settings overview, customization, and direct navigation", async ({
  page,
}, info) => {
  await page.goto("/settings");
  await expect(page.getByLabel("Search settings")).toBeVisible();
  await page.getByLabel("Search settings").fill("appearance");
  await page.getByRole("button", { name: /Appearance.*Wallpaper/ }).click();
  await expect(
    page.getByRole("heading", { name: "Make HomiOS feel like you" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to Settings", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".settings-sidebar")).toHaveCount(0);
  expect(
    await page
      .getByRole("heading", { name: "Appearance", level: 1 })
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
  ).toBeGreaterThanOrEqual(info.project.name === "mobile" ? 20 : 24);
  await page.getByRole("button", { name: "violet accent" }).click();
  await page.getByLabel("Interface spacing").selectOption("compact");
  await page.getByLabel("Desktop icon size").selectOption("large");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.reload();
  await expect(page.getByLabel("Interface spacing")).toHaveValue("compact");
  await expect(page.getByLabel("Desktop icon size")).toHaveValue("large");
  for (const theme of ["light", "dark"]) {
    await page.evaluate(
      (value) =>
        (() => {
          document.documentElement.classList.toggle("dark", value === "dark");
          document.documentElement.style.colorScheme = value;
        })(),
      theme,
    );
    await capture(
      page,
      `.cache/screenshots/${info.project.name}-${theme}-appearance.png`,
    );
  }
  await page.goto("/settings");
  await expect(page.getByLabel("Search settings")).toBeVisible();
  await expect(page.getByText("Reading system information…")).toHaveCount(0);
  await capture(page, `.cache/screenshots/${info.project.name}-settings.png`);
  await page.goto("/dashboard");
  if (info.project.name === "desktop")
    await expect(
      page.getByRole("button", { name: "View CPU activity in Task Manager" }),
    ).not.toContainText("\u2014");
  await capture(page, `.cache/screenshots/${info.project.name}-desktop.png`);
});

test("bulk move completes on touch and survives reload", async ({
  page,
}, info) => {
  await page.goto(`/files?path=/${info.project.name}/MoveSource`);
  if (info.project.name !== "desktop")
    await page
      .getByRole("button", { name: "Select files", exact: true })
      .click();
  for (const name of ["alpha.txt", "bravo.txt"])
    await page
      .getByRole("checkbox", { name: `Select ${name}`, exact: true })
      .check();
  await page
    .getByRole("button", { name: "Move to\u2026", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Parent destination folder" })
    .click();
  await dialog.getByRole("button", { name: "Empty", exact: true }).click();
  await dialog.getByRole("button", { name: "Move here", exact: true }).click();
  await expect(
    page.getByLabel("File operation batches").locator("summary").last(),
  ).toContainText("2 completed", { timeout: 30000 });
  await expect(
    page.getByRole("option", { name: "alpha.txt", exact: true }),
  ).toHaveCount(0);
  await page.goto(`/files?path=/${info.project.name}/Empty`);
  await expect(
    page.getByRole("option", { name: "alpha.txt", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "bravo.txt", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("option", { name: "alpha.txt", exact: true }),
  ).toBeVisible();
});

test("accepted app installation remains queued across navigation and reload", async ({
  page,
}) => {
  let submissions = 0;
  let queued = false;
  const job = {
    id: "queued-beacon",
    type: "app.install",
    status: "queued",
    name: "Install Beacon",
    payload: { appId: "beacon" },
    progress: 0,
    createdAt: new Date().toISOString(),
  };
  await page.route("**/api/jobs?*", (route) =>
    route.fulfill({ json: queued ? [job] : [] }),
  );
  await page.route("**/api/apps/install", async (route) => {
    submissions++;
    queued = true;
    await route.fulfill({
      status: 202,
      json: { jobId: job.id, appId: "beacon" },
    });
  });
  await page.goto("/dashboard?view=app-store&app=beacon");
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Installing\u2026", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Back to Discover", exact: true })
    .click();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Installing\u2026", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Installing\u2026", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("article")).toContainText("Queued");
  expect(submissions).toBe(1);
});

test("home launcher reflects installed apps and opens App Store without simulated mobile chrome", async ({
  page,
}, info) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("button", { name: "Open Atlas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open Coolify", exact: true }),
  ).toHaveCount(0);
  if (info.project.name === "mobile") {
    await expect(page.getByLabel("Home launcher")).toBeVisible();
    await expect(page.locator(".lucide-signal, .lucide-battery")).toHaveCount(
      0,
    );
  }
  await page
    .getByRole("button", { name: "Open App Store", exact: true })
    .click();
  await expect(page.getByLabel("Search apps")).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Open App Store", exact: true }),
  ).toBeVisible();
});
