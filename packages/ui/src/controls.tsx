"use client";
import { useRef, useState, type ReactNode } from "react";
import Banner from "@jetbrains/ring-ui-built/components/banner/banner";
import Button from "@jetbrains/ring-ui-built/components/button/button";
import Dialog from "@jetbrains/ring-ui-built/components/dialog/dialog";
import { ControlsHeight } from "@jetbrains/ring-ui-built/components/global/controls-height";
import Icon from "@jetbrains/ring-ui-built/components/icon/icon";
import { Content, Header } from "@jetbrains/ring-ui-built/components/island/island";
import Panel from "@jetbrains/ring-ui-built/components/panel/panel";

// Ring touches `document` while these modules load, so this entry works in the browser only.

/** Ring's `icon` prop renders a borderless button, which reads as a link. As a child, the icon keeps the border. */
export const withIcon = (glyph: string | undefined, label: ReactNode) =>
  glyph ? (
    <>
      <Icon glyph={glyph} /> {label}
    </>
  ) : (
    label
  );

export function ErrorMessage({ error }: { error: string }) {
  return error ? (
    <div role="alert">
      <Banner mode="error" withIcon>
        {error}
      </Banner>
    </div>
  ) : null;
}

/** A Ring button that opens a file picker. */
export function FileButton({ accept, icon, onPick, children }: {
  accept: string;
  icon?: string;
  onPick: (file: File | undefined) => void;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button onClick={() => input.current?.click()}>{withIcon(icon, children)}</Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          // Lets the same file be picked again, after a failed attempt.
          e.target.value = "";
        }}
      />
    </>
  );
}

/**
 * A dialog asking for confirmation. Focus starts on the cancel button, so pressing Enter alone can't confirm: Ring
 * would otherwise focus the first button, which is the one that acts.
 */
export function ConfirmDialog({ show, title, confirmLabel, cancelLabel = "Cancel", danger, touch, confirmDisabled, onConfirm, onCancel, children }: {
  show: boolean;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  /** For screens people tap: 44px buttons. */
  touch?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const size = touch ? { height: ControlsHeight.L, className: "touch-button" } : {};
  return (
    <Dialog
      show={show}
      label={title}
      contentClassName="ui-dialog"
      trapFocus
      autoFocusFirst={false}
      showCloseButton
      closeButtonInside
      onCloseAttempt={onCancel}
    >
      <Header>{title}</Header>
      <Content>{children}</Content>
      <Panel>
        {/* Ring's `primary` overrides `danger`, so a destructive action is red instead of the accent. */}
        <Button {...size} primary={!danger} danger={danger} disabled={confirmDisabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button {...size} autoFocus onClick={onCancel}>
          {cancelLabel}
        </Button>
      </Panel>
    </Dialog>
  );
}

/** A button and the confirmation it opens. */
export function ConfirmButton({ label, icon, inline, danger, disabled, touch, onOpen, onConfirm, ...dialog }: {
  label: ReactNode;
  icon?: string;
  inline?: boolean;
  danger?: boolean;
  disabled?: boolean;
  touch?: boolean;
  onOpen?: () => void;
  onConfirm: () => void;
  title: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);
  const size = touch ? { height: ControlsHeight.L, className: "touch-button" } : {};
  return (
    <>
      <Button
        {...size}
        inline={inline}
        danger={danger}
        disabled={disabled}
        onClick={() => {
          onOpen?.();
          setShow(true);
        }}
      >
        {withIcon(icon, label)}
      </Button>
      <ConfirmDialog
        {...dialog}
        touch={touch}
        show={show}
        danger={danger}
        onCancel={() => setShow(false)}
        onConfirm={() => {
          setShow(false);
          onConfirm();
        }}
      />
    </>
  );
}
