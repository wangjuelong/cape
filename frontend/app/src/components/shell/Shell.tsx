import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar";
import { Statusbar } from "./Statusbar";
import { Topbar } from "./Topbar";

export function Shell() {
  return (
    <div className="grid h-full" style={{ gridTemplateRows: "auto 1fr auto" }}>
      <Topbar />
      <div className="flex min-h-0">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-auto">
          <Outlet />
        </main>
      </div>
      <Statusbar />
    </div>
  );
}
