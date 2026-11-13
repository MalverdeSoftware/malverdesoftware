// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmButton, ConfirmDialog, ErrorMessage, FileButton } from "../src/controls.tsx";

afterEach(cleanup);

const dialog = (props = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog show title="Remove it?" confirmLabel="Remove" cancelLabel="Keep" onConfirm={onConfirm} onCancel={onCancel} {...props}>
      <p>This can't be undone.</p>
    </ConfirmDialog>,
  );
  return { onConfirm, onCancel };
};
const button = (name: string) => screen.getByRole("button", { name });

describe("ConfirmDialog", () => {
  it("starts focus on the cancel button, so Enter alone can't confirm", () => {
    dialog();
    expect(document.activeElement).toBe(button("Keep"));
  });

  it("runs the right handler for each button", () => {
    const { onConfirm, onCancel } = dialog();
    fireEvent.click(button("Keep"));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(button("Remove"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("makes a destructive action red instead of the accent", () => {
    dialog({ danger: true });
    expect(button("Remove").className).toMatch(/danger/);
    expect(button("Remove").className).not.toMatch(/primary/);
  });

  it("uses the accent for an ordinary action", () => {
    dialog();
    expect(button("Remove").className).toMatch(/primary/);
  });

  it("gives touch screens 44px buttons", () => {
    dialog({ touch: true });
    expect(button("Remove").className).toContain("touch-button");
    expect(button("Keep").className).toContain("touch-button");
  });

  it("can hold the action back", () => {
    dialog({ confirmDisabled: true });
    expect((button("Remove") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("ConfirmButton", () => {
  it("asks first, and acts only on confirmation", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmButton label="Delete" title="Delete it?" confirmLabel="Delete it" onConfirm={onConfirm}>
        <p>Sure?</p>
      </ConfirmButton>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(button("Delete"));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(button("Delete it"));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("ErrorMessage", () => {
  it("announces an error, and shows nothing without one", () => {
    const { rerender } = render(<ErrorMessage error="" />);
    expect(screen.queryByRole("alert")).toBeNull();
    rerender(<ErrorMessage error="Couldn't save." />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't save.");
  });
});

describe("FileButton", () => {
  it("hands over the picked file", () => {
    const onPick = vi.fn();
    const { container } = render(<FileButton accept=".csv" onPick={onPick}>Import</FileButton>);
    const file = new File(["a"], "cards.csv");
    fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [file] } });
    expect(onPick).toHaveBeenCalledWith(file);
  });
});
