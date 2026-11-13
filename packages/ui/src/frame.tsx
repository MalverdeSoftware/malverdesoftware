import type { ReactNode } from "react";

export const ORGANIZATION_NAME = "MalverdeSoftware";
export const ORGANIZATION_URL = "https://github.com/MalverdeSoftware";

// The top bar and footer of every app. Plain HTML on Ring's colors and type, because Ring's components can't load on a
// server. A plain link home on purpose: a full page load drops any open session from memory.
export function Frame({ appName, children }: { appName: string; children: ReactNode }) {
  return (
    <>
      <header className="site-header">
        <a className="site-header__brand" href="/">
          {appName}
        </a>
        <a className="ring-link" href={ORGANIZATION_URL} target="_blank" rel="noreferrer">
          {ORGANIZATION_NAME}
        </a>
      </header>
      {children}
      <footer className="site-footer">
        <span>{ORGANIZATION_NAME} · Indigenous-led software development</span>
        <span>Early release · Open source under Apache-2.0</span>
      </footer>
    </>
  );
}
