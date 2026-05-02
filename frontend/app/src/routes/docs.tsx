import { useState } from "react";

import { PageHead } from "@/components/shared/PageHead";

/**
 * `/docs` route — apiv2 Token API reference for sandbox detection.
 *
 * The CAPE backend exposes two HTTP API surfaces:
 *
 * - **apiv2** (this page) — frozen, token-authenticated REST API meant for
 *   programmatic sandbox automation (submit a sample, poll task status,
 *   pull report / IOCs / artefacts). 62 endpoints covering submission,
 *   task management, search, system info, and binary artifact download.
 *
 * - **apiv3** (`/api/v3/*`, see Swagger UI link at bottom) — backs the SPA
 *   itself; uses session cookies. Useful for deep schema inspection but
 *   NOT recommended for third-party integrations.
 *
 * Use this page as a quick reference. For canonical request/response
 * shapes, source-of-truth lives in `web/apiv2/views.py`.
 */
export default function DocsRoute() {
  return (
    <>
      <PageHead crumbs={["CAPE", "API Docs"]} />
      <div className="scroll" style={{ padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 240px", gap: 14 }}>
          <main style={{ minWidth: 0 }}>
            <Intro />
            <QuickStart />
            <Section id="auth" title="1. 鉴权 — 获取 Token" endpoints={[ENDPOINTS.tokenAuth]} />
            <Section
              id="submit"
              title="2. 提交样本"
              endpoints={[
                ENDPOINTS.createFile,
                ENDPOINTS.createUrl,
                ENDPOINTS.createDlnexec,
                ENDPOINTS.createStatic,
                ENDPOINTS.createDownloadService,
              ]}
            />
            <Section
              id="tasks"
              title="3. 任务查询与管理"
              endpoints={[
                ENDPOINTS.tasksList,
                ENDPOINTS.tasksView,
                ENDPOINTS.tasksStatus,
                ENDPOINTS.tasksReport,
                ENDPOINTS.tasksIocs,
                ENDPOINTS.tasksConfig,
                ENDPOINTS.tasksDelete,
                ENDPOINTS.tasksReprocess,
              ]}
            />
            <Section
              id="search"
              title="4. 检索"
              endpoints={[
                ENDPOINTS.searchSha256,
                ENDPOINTS.searchMd5,
                ENDPOINTS.searchSha1,
                ENDPOINTS.extendedSearch,
                ENDPOINTS.filesView,
              ]}
            />
            <Section
              id="artifacts"
              title="5. 工件下载（二进制）"
              endpoints={[
                ENDPOINTS.screenshot,
                ENDPOINTS.pcap,
                ENDPOINTS.dropped,
                ENDPOINTS.payloads,
                ENDPOINTS.procmemory,
                ENDPOINTS.fullmemory,
                ENDPOINTS.evtx,
                ENDPOINTS.fileGet,
              ]}
            />
            <Section
              id="system"
              title="6. 系统状态"
              endpoints={[
                ENDPOINTS.cuckooStatus,
                ENDPOINTS.machinesList,
                ENDPOINTS.machinesView,
                ENDPOINTS.exitNodes,
                ENDPOINTS.tasksLatest,
                ENDPOINTS.tasksStatsDays,
              ]}
            />
            <Notes />
          </main>
          <aside style={{ position: "sticky", top: 14, alignSelf: "flex-start" }}>
            <TOC />
          </aside>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Layout sub-components
// ---------------------------------------------------------------------------

function Intro() {
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">API Docs · apiv2 Token API</div>
      <div style={{ padding: 14, fontSize: 12, lineHeight: 1.65, color: "var(--color-fg-1)" }}>
        <p style={{ margin: 0, marginBottom: 10 }}>
          本页是 <strong>apiv2 通过 API Token 调用沙箱检测的接口文档</strong>
          。覆盖样本提交、任务查询、IOC / 配置 / 报告 / 工件下载、系统状态 6 大类，共 62
          个端点。前端 SPA 使用的内部 apiv3 不在此页范围内（用于 SPA 自身渲染，不建议第三方集成）。
        </p>
        <p style={{ margin: 0 }}>
          所有端点都需要 <code className="mono">Authorization: Token &lt;key&gt;</code>{" "}
          请求头。Token 通过 <code className="mono">/apiv2/api-token-auth/</code> POST 用户名 +
          密码获取（见 §1）。
        </p>
      </div>
    </div>
  );
}

function QuickStart() {
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">Quick start</div>
      <div style={{ padding: 14 }}>
        <Pre>{`# 1. 获取 token
curl -X POST http://192.168.1.6:8000/apiv2/api-token-auth/ \\
  -d "username=admin" -d "password=cape123!"
# → {"token": "<key>"}

# 2. 提交一个文件
curl -F "file=@/path/to/sample.exe" \\
  -H "Authorization: Token <key>" \\
  http://192.168.1.6:8000/apiv2/tasks/create/file/
# → {"error": false, "data": {"task_ids": [42]}, ...}

# 3. 轮询任务状态
curl -H "Authorization: Token <key>" \\
  http://192.168.1.6:8000/apiv2/tasks/status/42/
# → {"error": false, "data": "reported"}

# 4. 拉取 JSON 报告
curl -H "Authorization: Token <key>" \\
  http://192.168.1.6:8000/apiv2/tasks/get/report/42/json/`}</Pre>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  endpoints,
}: {
  id: string;
  title: string;
  endpoints: EndpointDef[];
}) {
  return (
    <div className="panel" id={id} style={{ marginBottom: 14, scrollMarginTop: 14 }}>
      <div className="panel-h">{title}</div>
      <div style={{ padding: 14, display: "grid", gap: 18 }}>
        {endpoints.map((e) => (
          <Endpoint key={e.path} {...e} />
        ))}
      </div>
    </div>
  );
}

function Endpoint({ method, path, name, desc, params, example }: EndpointDef) {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        background: "var(--color-bg-2)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: "transparent",
          border: 0,
          color: "inherit",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <MethodBadge method={method} />
        <code className="mono" style={{ fontSize: 11.5, color: "var(--color-fg-0)" }}>
          {path}
        </code>
        <span className="dim" style={{ fontSize: 11 }}>
          {name}
        </span>
        <span className="dim mono" style={{ marginLeft: "auto", fontSize: 10 }}>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: "10px 12px 12px 12px",
            borderTop: "1px solid var(--color-border)",
            fontSize: 11.5,
            lineHeight: 1.6,
          }}
        >
          {desc && <p style={{ margin: 0, marginBottom: 10 }}>{desc}</p>}
          {params && params.length > 0 && (
            <table className="data" style={{ marginBottom: 10, fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Param</th>
                  <th style={{ width: 80 }}>Where</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {params.map((p) => (
                  <tr key={p.name}>
                    <td className="mono">{p.name}</td>
                    <td className="dim">{p.where}</td>
                    <td>{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {example && <Pre>{example}</Pre>}
        </div>
      )}
    </div>
  );
}

function MethodBadge({ method }: { method: HTTPMethod }) {
  const colors: Record<HTTPMethod, { bg: string; fg: string }> = {
    GET: { bg: "#1f6feb22", fg: "#79c0ff" },
    POST: { bg: "#23863622", fg: "#7ee787" },
    DELETE: { bg: "#da363322", fg: "#ff7b72" },
  };
  const c = colors[method];
  return (
    <span
      className="mono"
      style={{
        display: "inline-block",
        padding: "1px 6px",
        fontSize: 10,
        fontWeight: 600,
        background: c.bg,
        color: c.fg,
        borderRadius: 3,
        minWidth: 48,
        textAlign: "center",
      }}
    >
      {method}
    </span>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre
      style={{
        background: "var(--color-bg-3, #0d1117)",
        color: "var(--color-fg-0, #c9d1d9)",
        padding: 10,
        borderRadius: 4,
        fontSize: 10.5,
        lineHeight: 1.5,
        overflow: "auto",
        margin: 0,
        whiteSpace: "pre",
        fontFamily: "var(--font-mono)",
      }}
    >
      {children}
    </pre>
  );
}

function TOC() {
  const items = [
    { href: "#auth", label: "1. 鉴权 — 获取 Token" },
    { href: "#submit", label: "2. 提交样本" },
    { href: "#tasks", label: "3. 任务查询与管理" },
    { href: "#search", label: "4. 检索" },
    { href: "#artifacts", label: "5. 工件下载（二进制）" },
    { href: "#system", label: "6. 系统状态" },
  ];
  return (
    <div className="panel">
      <div className="panel-h" style={{ fontSize: 11 }}>
        Sections
      </div>
      <nav style={{ padding: "6px 0" }}>
        {items.map((it) => (
          <a
            key={it.href}
            href={it.href}
            style={{
              display: "block",
              padding: "5px 12px",
              fontSize: 11,
              color: "var(--color-fg-1)",
              textDecoration: "none",
            }}
          >
            {it.label}
          </a>
        ))}
        <a
          href="/api/v3/docs/"
          target="_blank"
          rel="noreferrer"
          style={{
            display: "block",
            padding: "5px 12px",
            marginTop: 6,
            fontSize: 11,
            borderTop: "1px solid var(--color-border)",
            color: "var(--color-fg-2)",
            textDecoration: "none",
          }}
        >
          apiv3 Swagger UI ↗
        </a>
      </nav>
    </div>
  );
}

function Notes() {
  return (
    <div className="panel" style={{ marginBottom: 14 }}>
      <div className="panel-h">备注</div>
      <div style={{ padding: 14, fontSize: 11.5, lineHeight: 1.7, color: "var(--color-fg-1)" }}>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            响应统一形态：成功 <code className="mono">{`{"error": false, "data": ...}`}</code>，
            失败 <code className="mono">{`{"error": true, "error_value": "<message>"}`}</code>。
            部分早期端点直接返回 RFC 7807 风格 4xx/5xx + 文本，调用方应同时处理两类。
          </li>
          <li>
            写入类（任务提交、删除）走 <code className="mono">POST</code> 或{" "}
            <code className="mono">DELETE</code>，需要 <code className="mono">api.conf</code> 对应
            endpoint <code className="mono">enabled = yes</code>。
          </li>
          <li>
            报告 endpoint <code className="mono">/tasks/get/report/&lt;id&gt;/</code> 默认返回
            JSON； 支持 <code className="mono">/json/</code> <code className="mono">/html/</code>{" "}
            <code className="mono">/all/</code> <code className="mono">/lite/</code> 等格式。
          </li>
          <li>
            apiv2 端点在本仓库 <strong>冻结</strong>，所有未来扩展都进 apiv3。apiv2 仅修复 bug
            和兼容性问题。
          </li>
          <li>
            本页内容映射自 <code className="mono">web/apiv2/urls.py</code> +{" "}
            <code className="mono">web/apiv2/views.py</code>。如有不一致以源码为准。
          </li>
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Endpoint catalog
// ---------------------------------------------------------------------------

type HTTPMethod = "GET" | "POST" | "DELETE";

interface Param {
  name: string;
  where: string;
  desc: string;
}

interface EndpointDef {
  method: HTTPMethod;
  path: string;
  name: string;
  desc?: string;
  params?: Param[];
  example?: string;
}

const ENDPOINTS: Record<string, EndpointDef> = {
  // ----- 1. Auth -----
  tokenAuth: {
    method: "POST",
    path: "/apiv2/api-token-auth/",
    name: "用用户名密码换 Token",
    desc: "成功返回的 token 存到调用方密管系统，后续所有请求带 Authorization: Token <key>。",
    params: [
      { name: "username", where: "form", desc: "Django 用户名" },
      { name: "password", where: "form", desc: "用户密码" },
    ],
    example: `curl -X POST http://192.168.1.6:8000/apiv2/api-token-auth/ \\
  -d "username=admin" -d "password=cape123!"
# → {"token": "6ebf291475f4e6002899d97aa992eaeb8a2df6ec"}`,
  },

  // ----- 2. Submit -----
  createFile: {
    method: "POST",
    path: "/apiv2/tasks/create/file/",
    name: "提交本地文件",
    params: [
      { name: "file", where: "form (multipart)", desc: "样本文件，必填" },
      { name: "package", where: "form", desc: "强制使用某个 analyzer package（可选）" },
      { name: "machine", where: "form", desc: "指定 VM label（可选，默认任意可用）" },
      { name: "tags", where: "form", desc: "machine tag 过滤（如 win10,x64）" },
      { name: "timeout", where: "form", desc: "分析超时秒，默认 200" },
      { name: "options", where: "form", desc: "free-form, 例 procmemdump=1,memory=1" },
      { name: "priority", where: "form", desc: "1-3，默认 2" },
      { name: "route", where: "form", desc: "internet/inetsim/tor/<vpn-name>/none" },
      { name: "custom", where: "form", desc: "user-defined 字段（透传到 task）" },
    ],
    example: `curl -F "file=@sample.exe" \\
     -F "machine=cuckoo1" \\
     -F "options=procmemdump=1" \\
     -H "Authorization: Token <key>" \\
     http://192.168.1.6:8000/apiv2/tasks/create/file/
# → {"error": false, "data": {"task_ids": [42], "errors": []}}`,
  },

  createUrl: {
    method: "POST",
    path: "/apiv2/tasks/create/url/",
    name: "提交 URL（VM 内浏览器打开）",
    params: [
      { name: "url", where: "form", desc: "目标 URL，必填" },
      { name: "package", where: "form", desc: "默认 ie / edge / chromium" },
      { name: "machine", where: "form", desc: "指定 VM" },
      { name: "timeout", where: "form", desc: "默认 200 秒" },
    ],
    example: `curl -F "url=https://example.com" \\
     -H "Authorization: Token <key>" \\
     http://192.168.1.6:8000/apiv2/tasks/create/url/`,
  },

  createDlnexec: {
    method: "POST",
    path: "/apiv2/tasks/create/dlnexec/",
    name: "URL 下载 → 执行（VM 内）",
    desc: "宿主先把 URL 下载下来，然后作为样本在 VM 内执行。比 create/url/ 信号强，适合 dropper 链。",
    params: [{ name: "dlnexec", where: "form", desc: "样本下载 URL" }],
    example: `curl -F "dlnexec=https://malware.host/payload.bin" \\
     -H "Authorization: Token <key>" \\
     http://192.168.1.6:8000/apiv2/tasks/create/dlnexec/`,
  },

  createStatic: {
    method: "POST",
    path: "/apiv2/tasks/create/static/",
    name: "纯静态分析（不进 VM）",
    params: [
      { name: "file", where: "form (multipart)", desc: "样本文件" },
      { name: "options", where: "form", desc: "static 选项" },
    ],
  },

  createDownloadService: {
    method: "POST",
    path: "/apiv2/tasks/create/download_services/",
    name: "从第三方源拉取样本",
    desc: "支持 VirusTotal / MalwareBazaar 等。需要 reporting.conf 中配置对应 service 的 API key。",
    params: [
      { name: "service", where: "form", desc: "vt / mb / etc." },
      { name: "hashes", where: "form", desc: "逗号分隔的 sha256 列表" },
    ],
  },

  // ----- 3. Tasks -----
  tasksList: {
    method: "GET",
    path: "/apiv2/tasks/list/[<limit>/[<offset>/[<window>/]]]",
    name: "任务列表",
    desc: "limit 默认 50，offset 默认 0，window 是回溯小时数（用于过滤近 N 小时）。",
    example: `curl -H "Authorization: Token <key>" \\
  http://192.168.1.6:8000/apiv2/tasks/list/100/0/
# → {"data": [{id, target, status, ...}, ...], ...}`,
  },

  tasksView: {
    method: "GET",
    path: "/apiv2/tasks/view/<task_id>/",
    name: "任务详情",
    desc: "返回完整 task row（含所有提交参数）。",
  },

  tasksStatus: {
    method: "GET",
    path: "/apiv2/tasks/status/<task_id>/",
    name: "任务状态（轮询用）",
    desc: "返回 pending / running / completed / reported / failed_processing 等。",
    example: `# 轮询直到 reported
while true; do
  s=$(curl -s -H "Authorization: Token <key>" \\
    http://192.168.1.6:8000/apiv2/tasks/status/42/ | jq -r .data)
  echo $s
  [ "$s" = "reported" ] && break
  sleep 5
done`,
  },

  tasksReport: {
    method: "GET",
    path: "/apiv2/tasks/get/report/<task_id>/[<format>/[<make_zip>/]]",
    name: "拉取报告",
    desc: "format ∈ {json, html, all, lite, dist, dropped, payloads, ...}。make_zip='zip' 时打包返回。",
    example: `curl -H "Authorization: Token <key>" \\
  http://192.168.1.6:8000/apiv2/tasks/get/report/42/json/ -o report.json`,
  },

  tasksIocs: {
    method: "GET",
    path: "/apiv2/tasks/get/iocs/<task_id>/[detailed/]",
    name: "IOC 列表",
    desc: "default 是简化形态；后缀 /detailed/ 返回完整结构（含 process tree / 调用细节）。",
  },

  tasksConfig: {
    method: "GET",
    path: "/apiv2/tasks/get/config/<task_id>/[<cape_name>/]",
    name: "提取的 malware 配置",
    desc: "若 CAPE 解析器抓到 family C2 / encryption key 等，从这里取。",
  },

  tasksDelete: {
    method: "DELETE",
    path: "/apiv2/tasks/delete/<task_id>/[<status>/]",
    name: "删除任务",
    desc: "支持范围语法：1,3,5-10。可选 status 参数仅删除指定状态的任务。",
  },

  tasksReprocess: {
    method: "GET",
    path: "/apiv2/tasks/reprocess/<task_id>/",
    name: "重新走 processing+reporting 链",
    desc: "样本不重新跑 VM，仅重跑后处理（用于修复 signature / 调试 reporting）。需要 api.conf 启用 taskreprocess。",
  },

  // ----- 4. Search -----
  searchSha256: {
    method: "GET",
    path: "/apiv2/tasks/search/sha256/<hash>/",
    name: "通过 SHA-256 找任务",
    desc: "返回所有以该哈希为目标的 task 列表。",
  },

  searchMd5: {
    method: "GET",
    path: "/apiv2/tasks/search/md5/<hash>/",
    name: "通过 MD5 找任务",
  },

  searchSha1: {
    method: "GET",
    path: "/apiv2/tasks/search/sha1/<hash>/",
    name: "通过 SHA-1 找任务",
  },

  extendedSearch: {
    method: "POST",
    path: "/apiv2/tasks/extendedsearch/",
    name: "扩展搜索",
    desc: "Mongo $match 风格的复合查询。详细字段表见 web/apiv2/views.py:ext_tasks_search。",
    params: [
      { name: "option", where: "form", desc: "字段名（filename / signature / domain / ip / ...)" },
      { name: "argument", where: "form", desc: "查询值" },
    ],
  },

  filesView: {
    method: "GET",
    path: "/apiv2/files/view/{md5,sha1,sha256,id}/<value>/",
    name: "样本文件元数据",
    desc: "通过任意一种哈希或 sample_id 取文件 row（不含二进制）。",
  },

  // ----- 5. Artifacts (binary) -----
  screenshot: {
    method: "GET",
    path: "/apiv2/tasks/get/screenshot/<task_id>/[<n>/]",
    name: "截图",
    desc: "无 n 时返回 zip；带索引返回单张 PNG。",
  },

  pcap: {
    method: "GET",
    path: "/apiv2/tasks/get/pcap/<task_id>/",
    name: "网络抓包 PCAP",
  },

  dropped: {
    method: "GET",
    path: "/apiv2/tasks/get/dropped/<task_id>/",
    name: "落地文件（zip 打包）",
  },

  payloads: {
    method: "GET",
    path: "/apiv2/tasks/get/payloadfiles/<task_id>/",
    name: "解密/卸壳后的 payload（zip）",
  },

  procmemory: {
    method: "GET",
    path: "/apiv2/tasks/get/procmemory/<task_id>/[<pid>/]",
    name: "进程内存 dump",
  },

  fullmemory: {
    method: "GET",
    path: "/apiv2/tasks/get/fullmemory/<task_id>/",
    name: "全量内存快照",
    desc: "仅当 memory.conf 启用 memory dump 时可用。文件可能数 GB。",
  },

  evtx: {
    method: "GET",
    path: "/apiv2/tasks/get/evtx/<task_id>/",
    name: "Windows 事件日志（EVTX）",
  },

  fileGet: {
    method: "GET",
    path: "/apiv2/files/get/{md5,sha1,sha256,task}/<value>/",
    name: "下载样本本体",
    desc: "task 类型时 value 是 task_id。",
    example: `curl -H "Authorization: Token <key>" \\
  http://192.168.1.6:8000/apiv2/files/get/sha256/<hash>/ -o sample.bin`,
  },

  // ----- 6. System -----
  cuckooStatus: {
    method: "GET",
    path: "/apiv2/cuckoo/status/",
    name: "守护进程状态",
    desc: "版本、CPU、内存、活跃 / 已完成任务数。健康检查终点。",
    example: `curl -H "Authorization: Token <key>" \\
  http://192.168.1.6:8000/apiv2/cuckoo/status/`,
  },

  machinesList: {
    method: "GET",
    path: "/apiv2/machines/list/",
    name: "VM 列表",
    desc: "label / platform / arch / tags / 是否锁定。",
  },

  machinesView: {
    method: "GET",
    path: "/apiv2/machines/view/<name>/",
    name: "单台 VM 详情",
  },

  exitNodes: {
    method: "GET",
    path: "/apiv2/exitnodes/",
    name: "可用出口节点 / VPN",
    desc: "提交时 route= 可选值的来源。",
  },

  tasksLatest: {
    method: "GET",
    path: "/apiv2/tasks/get/latests/<hours>/",
    name: "最近 N 小时任务",
  },

  tasksStatsDays: {
    method: "GET",
    path: "/apiv2/tasks/statistics/<days>/",
    name: "聚合统计（per-day）",
  },
};
