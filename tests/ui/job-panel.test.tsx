import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import TransferActivityPanel from "../../src/components/TransferActivityPanel";
const activity = vi.hoisted(() => ({
  transferJobs: [] as any[],
  activeJobs: [] as any[],
  error: null,
  updateJob: vi.fn(),
}));
vi.mock("../../src/hooks/useJobActivity", () => ({
  useJobActivity: () => activity,
}));
describe("activity trigger", () => {
  it("hides completed activity while keeping active progress and open history reachable", async () => {
    const job = {
      id: "copy",
      type: "file.copy",
      status: "completed",
      progress: 100,
      name: "Copy files",
      createdAt: new Date().toISOString(),
    };
    activity.transferJobs = [job];
    activity.activeJobs = [];
    const { rerender } = render(<TransferActivityPanel />);
    expect(
      screen.queryByRole("button", { name: "Open Transfers and Backups" }),
    ).toBeNull();
    const active = { ...job, status: "running", progress: 30 };
    activity.transferJobs = [active];
    activity.activeJobs = [active];
    rerender(<TransferActivityPanel />);
    fireEvent.click(
      screen.getByRole("button", { name: "Open Transfers and Backups" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Transfers & Backups" }),
    ).toBeDefined();
    activity.transferJobs = [job];
    activity.activeJobs = [];
    rerender(<TransferActivityPanel />);
    expect(
      await screen.findByRole("heading", { name: "Transfers & Backups" }),
    ).toBeDefined();
  });
  it("keeps failures accessible after execution stops", () => {
    activity.transferJobs = [
      {
        id: "failed",
        type: "file.copy",
        status: "failed",
        progress: 40,
        name: "Copy files",
        createdAt: new Date().toISOString(),
      },
    ];
    activity.activeJobs = [];
    render(<TransferActivityPanel />);
    expect(
      screen.getByRole("button", { name: "Open Transfers and Backups" }),
    ).toBeDefined();
  });
});
