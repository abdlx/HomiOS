import React from "react";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MobileLauncher from "../../src/components/MobileLauncher";
import ServerDataProvider, {
  getQueryClient,
} from "../../src/providers/ServerDataProvider";
import { ShellNavigationContext } from "../../src/hooks/useShellNavigation";
import { buildLauncherApps } from "../../src/lib/launcher-apps";
import { useLauncherLayout } from "../../src/hooks/useLauncherLayout";

beforeEach(() => getQueryClient().clear());
describe("shared launcher", () => {
  it("uses saved mobile dock order, real installed apps, and capability restrictions without simulated device chrome", async () => {
    localStorage.setItem(
      "homios_dock_apps",
      JSON.stringify(["notes", "files"]),
    );
    localStorage.setItem("homios_grid_apps", JSON.stringify(["settings"]));
    const navigate = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url.includes("/integrations/status")
                ? {
                    capabilities: Object.fromEntries(
                      ["coolify", "immich", "codex", "codeServer"].map((id) => [
                        id,
                        { state: "disabled" },
                      ]),
                    ),
                  }
                : {
                    apps: [
                      {
                        id: "installed-atlas",
                        catalogId: "atlas",
                        name: "Atlas",
                        status: "running",
                        primaryUrl: "https://atlas.test",
                        managedByHomiOS: true,
                      },
                    ],
                  },
            ),
            { status: 200 },
          ),
      ),
    );
    render(
      <ServerDataProvider>
        <ShellNavigationContext.Provider
          value={{
            route: {
              view: "desktop",
              filePath: "/",
              storeCategory: "Discover",
              storeQuery: "",
              storeApp: null,
            },
            navigate,
            restored: false,
          }}
        >
          <MobileLauncher username="Abdullah" />
        </ShellNavigationContext.Provider>
      </ServerDataProvider>,
    );
    expect(screen.getByRole("heading", { name: "Abdullah" })).toBeDefined();
    await screen.findByRole("button", { name: "Open Atlas" });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Open Code Server" }),
      ).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "Open Coolify" })).toBeNull();
    expect(
      document.querySelector(".lucide-signal, .lucide-battery, .lucide-wifi"),
    ).toBeNull();
    expect(
      within(screen.getByRole("navigation", { name: "Dock apps" }))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Open Notes", "Open Files"]);
    fireEvent.click(screen.getByRole("button", { name: "Open App Store" }));
    expect(navigate).toHaveBeenCalledWith({ view: "app-store" });
    fireEvent.click(screen.getByRole("button", { name: "Open Atlas" }));
    expect(open).toHaveBeenCalledWith(
      "https://atlas.test/",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("survives corrupt saved layouts and retains temporarily unavailable app preferences", () => {
    localStorage.setItem("homios_grid_apps", "invalid json");
    localStorage.setItem(
      "homios_dock_apps",
      JSON.stringify(["files", "coolify"]),
    );
    const apps = buildLauncherApps([], () => false);
    const { result } = renderHook(() => useLauncherLayout(apps));
    expect(result.current.gridAppIds).toContain("settings");
    expect(result.current.dockAppIds).toEqual(["files"]);
    act(() => result.current.updateDock(["notes", "files"]));
    expect(JSON.parse(localStorage.getItem("homios_dock_apps")!)).toEqual([
      "notes",
      "files",
      "coolify",
    ]);
    expect(result.current.dockAppIds).toEqual(["notes", "files"]);
  });

  it("keeps manually removed desktop apps hidden across refreshes and reloads", () => {
    const apps = buildLauncherApps([{
      id: "custom-1", catalogId: "custom", name: "Custom", status: "running",
      primaryUrl: "https://custom.test", managedByHomiOS: false,
    }], () => false);
    const { result, rerender, unmount } = renderHook(() => useLauncherLayout(apps));
    expect(result.current.gridAppIds).toContain("coolify:custom-1");
    act(() => result.current.updateGrid(result.current.gridAppIds.filter((id) => id !== "coolify:custom-1")));
    rerender();
    expect(result.current.gridAppIds).not.toContain("coolify:custom-1");
    unmount();
    const restored = renderHook(() => useLauncherLayout(apps));
    expect(restored.result.current.gridAppIds).not.toContain("coolify:custom-1");
    act(() => restored.result.current.updateGrid([...restored.result.current.gridAppIds, "coolify:custom-1"]));
    expect(restored.result.current.gridAppIds).toContain("coolify:custom-1");
  });
});
