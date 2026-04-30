import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * SOC analyst shell — direct port of frontend/web-design/cape-shell.jsx.
 * The .app grid wires topbar/sidebar/main with a single area, so the design
 * tokens stay in CSS and React just renders the regions.
 */
export function Shell() {
  return (
    <div className="cape-frame">
      <div className="app" data-nav="side">
        <Topbar />
        <Sidebar />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
