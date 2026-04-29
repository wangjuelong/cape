/**
 * Icon registry. Wraps lucide-react so designer tokens like `Icon.upload`
 * stay consistent with frontend/web-design/cape-shell.jsx.
 */

import {
  Activity,
  Bell,
  CircleUser,
  Cog,
  Download,
  FileText,
  GitCompare,
  Grid2x2,
  List,
  LogOut,
  RefreshCw,
  Search,
  Tag,
  Upload,
} from "lucide-react";

export const Icon = {
  grid: Grid2x2,
  upload: Upload,
  list: List,
  pulse: Activity,
  search: Search,
  tag: Tag,
  diff: GitCompare,
  bell: Bell,
  cog: Cog,
  user: CircleUser,
  doc: FileText,
  exit: LogOut,
  download: Download,
  refresh: RefreshCw,
} as const;

export type IconName = keyof typeof Icon;
