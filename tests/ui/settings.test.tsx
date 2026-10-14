import React, { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsApp from "../../src/components/SettingsApp";
import ServerDataProvider, {
  getQueryClient,
} from "../../src/providers/ServerDataProvider";
import {
  ShellNavigationContext,
  type ShellRoute,
} from "../../src/hooks/useShellNavigation";

const stats = {
  cpu: { model: "Test CPU", cores: 8, usagePercent: 32 },
  memory: { used: 1024, total: 2048 },
  disk: { free: 4096, total: 8192, used: 4096 },
  os: {
    hostname: "home-server",
    platform: "linux",
    arch: "x64",
    version: "Test Linux",
    uptime: 7200,
  },
  network: {
    eth0: [
      {
        address: "192.168.1.24",
        family: "IPv4",
        internal: false,
        netmask: "255.255.255.0",
        mac: "00:00:00:00:00:00",
      },
    ],
  },
};
function Harness({ tab = "overview" }: { tab?: string }) {
  const [route, setRoute] = useState<ShellRoute>({
    view: "settings",
    filePath: "/",
    storeCategory: "Discover",
    storeQuery: "",
    storeApp: null,
    settingsTab: tab,
  });
  return (
    <ServerDataProvider>
      <ShellNavigationContext.Provider
        value={{
          route,
          navigate: (patch) =>
            setRoute((previous) => ({ ...previous, ...patch })),
          restored: false,
        }}
      >
        <SettingsApp username="Abdullah" onClose={() => {}} />
      </ShellNavigationContext.Provider>
    </ServerDataProvider>
  );
}
beforeEach(() => {
  getQueryClient().clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.includes("system/stats")
              ? stats
              : url.includes("/auth/2fa")
                ? { enabled: false }
                : url.includes("drives/available")
                  ? []
                  : {},
          ),
          { status: 200 },
        ),
    ),
  );
});
describe("unified settings", () => {
  it("drills into Appearance in the same frame and applies real customization controls", async () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: /Appearance.*Wallpaper/ }),
    );
    expect(
      screen.getByRole("heading", { name: "Appearance", level: 1 }),
    ).toBeDefined();
    expect(
      screen.getByRole("heading", { name: "Make HomiOS feel like you" }),
    ).toBeDefined();
    expect(document.querySelector(".settings-sidebar")).toBeNull();
    fireEvent.change(screen.getByLabelText("Resource profile"), {
      target: { value: "server_saver" },
    });
    expect(
      screen
        .getByRole("switch", { name: "Glass surfaces" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      screen
        .getByRole("switch", { name: "Reduce motion" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Back to Settings" }));
    fireEvent.change(screen.getByLabelText("Search settings"), {
      target: { value: "Network" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Network.*Host addresses/ }),
    );
    await screen.findByText("192.168.1.24");
    expect(
      screen.getByRole("heading", { name: "Network", level: 1 }),
    ).toBeDefined();
    expect(document.querySelector(".settings-sidebar")).toBeNull();
  });

  it("shows actionable security settings without invented update and host-security status", async () => {
    render(<Harness tab="security" />);
    expect(screen.queryByText("System is up to date")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Check for Updates" }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Manage tokens" }));
    expect(
      screen.getByRole("heading", { name: "API tokens", level: 1 }),
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Back to Settings" }),
    ).toBeDefined();
  });

  it("reads real system identity instead of a hardcoded operating-system build", async () => {
    render(<Harness tab="about" />);
    await screen.findByText("Test Linux");
    expect(screen.getByText("Test CPU")).toBeDefined();
    expect(screen.queryByText(/Build 24E214/)).toBeNull();
  });
});
