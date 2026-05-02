# 报告页 Spike 规范（W8 起点）

> **目的**：化解 PRD §9 R1（"报告页复杂度高估难"）。本文档把现有
> `web/templates/analysis/report.html` 及其引用的 80+ 个子模板逐一摸清，
> 列出每个 tab 的触发条件、数据来源、现有交互、复杂度评级，作为 W8
> 进入报告页实现前的"事实基线"。
>
> **范围**：仅当前 SSR 报告页的功能矩阵；不涉及 SPA 实现细节，仅对应
> PRD §6.2.3 的 v3 端点切分提案。
>
> **使用方式**：W8 启动时以本文档为输入，新工程按"功能等价"映射，缺
> 项不漏，多项可砍。

---

## 0. TL;DR（关键发现）

1. **可见 tab 共 14 个**，但**默认只渲染 Overview tab 的内容**；其它 13
   个 tab 通过 jQuery 的 `data-bs-toggle="tabajax"` 在用户点击时**惰性
   加载** `GET /analysis/load_files/<task_id>/<category>/` 返回的 HTML
   片段。
2. **Overview tab 是个超级 tab**，本身是 10+ 个互相独立的 section，每
   个 section 都有自己的可见性条件（`{% if analysis.<key> %}`）。**它
   不分页加载**——一次性渲染全部，单页 DOM 节点数大、首屏延迟主要由
   它决定。
3. **Behavior tab 内部还有第二级分页**——每个进程一个子 tab，进程内的
   API call 列表通过 `GET /analysis/chunk/<task_id>/<pid>/<pagenum>/`
   分页拉，每页 100 条；调用列表常达数千上万条。这是整套报告里**唯一
   有真正分页设计**的子模块，也是性能瓶颈所在。
4. **Network tab 内部又有 13 个子 tab**（Hosts / DNS / TCP / UDP / HTTP
   / SMTP / IRC / ICMP / CIF / Suricata Alerts / Suricata TLS /
   Suricata HTTP / Suricata Files），但全部一次性渲染——意味着 Network
   tab 一旦加载就要把所有协议数据都准备好。
5. **每个 tab 的可见性 + 内容都是数据驱动的**：是否显示 = MongoDB 文档
   里某字段是否存在。SPA 化后这等价于"按需获取每个 tab 的 summary 字
   段，根据非空决定 tab 是否显示"。
6. **现状用 Bootstrap 5 nav-pills + AJAX `.load()` 注入 HTML 片段**，
   完全不适合 SPA 复用——所有 tab 都要重写。HTML 片段里嵌的 JS（如
   `behavior/_processes.html` 里的 `load_chunk`、`go_to_api_call`）是
   关键交互逻辑，必须在 SPA 里等价复刻。
7. **平台差异**：Linux 客户机的"Behavioral Analysis"对应 strace 模板
   树（不是 Windows 的 behavior），并多出一个"Detailed Behaviour
   (Tracee)" tab；PCAP / Static 类任务跳过 behavior 整套。
8. **TLP 横幅**在最顶部根据 `analysis.info.tlp ∈ {Red, Amber, Green}`
   渲染（红/黄/黄三色）。SPA 必须保留这个语义层。
9. **Compare 入口在报告页**——只有 file 类任务且有 target 的报告会显示
   "Compare this analysis to..."链接。

---

## 1. 顶层 Shell（`report.html` 302 行）

| 元素 | 说明 |
|---|---|
| TLP 横幅 | `analysis.info.tlp` 为 Red/Amber/Green 时显示彩色 alert |
| 报告页标题区 | 当前模板里**没有显式标题/分数/家族横幅**——分数和元数据散落在 Overview tab 的 `_info.html` 里。设计稿（`cape-pages-report.jsx`）则把它做成顶部独立的 VerdictBanner，是新增能力 |
| 14 个一级 tab | nav-pills，懒加载（除 Overview 外） |
| Overview 默认激活 | `<div id="overview" class="tab-pane fade show active">` 直接 `{% include %}` 子模板 |
| `localStorage.lastAnalysisTab` 记忆 | 同页刷新时恢复用户上次停留的 tab |

### 顶层 Tab 矩阵

| # | Tab key | 标题 | 显示条件 | 加载方式 | 数据源 | 复杂度 |
|---|---|---|---|---|---|---|
| 1 | `overview` | Quick Overview | 永远显示 | **直接渲染**（不 AJAX） | `analysis.*` 全字段 | **极高**（10+ section） |
| 2 | `strace` | Behavioral Analysis (Linux) | `analysis.info.machine.platform == "linux"` | AJAX → `load_files/<id>/strace/` | `analysis.behavior.*`（同字段，Linux 模板） | 高 |
| 3 | `tracee` | Detailed Behaviour (Tracee) | `analysis.info.machine.platform == "linux"` | AJAX → `load_files/<id>/tracee/` | `analysis.tracee` + `data/linux/linux-syscalls.json` | 高 |
| 4 | `behavior` | Behavioral Analysis | `category` 不是 pcap/static，且 Linux 分支不命中 | AJAX → `load_files/<id>/behavior/` | `analysis.behavior.{processes,processtree}`、`detections2pid` | **极高**（含进程级 chunk 分页） |
| 5 | `network` | Network Analysis | `category != "static"` | AJAX → `load_files/<id>/network/` | `analysis.network.*` + `analysis.suricata.*` + `cif` | **高**（13 子 tab） |
| 6 | `dropped` | Dropped Files (N) | `analysis.dropped > 0` 且非 pcap/static | AJAX → `load_files/<id>/dropped/` | `analysis.dropped`（dict 列表） | 中 |
| 7 | `procmemory` | Process Memory (N) | `analysis.procmemory > 0` 且非 pcap/static | AJAX → `load_files/<id>/procmemory/` | `analysis.procmemory` | 中 |
| 8 | `memory` | Memory Analysis | `analysis.memory` truthy 且非 pcap/static | AJAX → `load_files/<id>/memory/` | `analysis.memory.*`（含 18 个 Volatility 子模块） | **高** |
| 9 | `procdump` | Process Dumps (N) | `analysis.procdump > 0` 且非 pcap/static | AJAX → `load_files/<id>/procdump/` | `analysis.procdump` | 中 |
| 10 | `CAPE` | Payloads (N) | `analysis.CAPE` truthy 且非 pcap/static | AJAX → `load_files/<id>/CAPE/` | `analysis.CAPE`、`analysis.malware_conf` | 中 |
| 11 | `debugger` | Debugger | `analysis.debugger_logs` truthy 且非 pcap/static | AJAX → `load_files/<id>/debugger/` | `analysis.behavior` + 调试器子集 | 中 |
| 12 | `eventlogs` | Event Logs | `analysis.sigma`、`analysis.sysmon`、`analysis.has_evtx` 任一 truthy | AJAX → `load_files/<id>/eventlogs/` | `analysis.sigma`、EVTX zip 文件 | **高**（多 channel + 搜索 + 噪声过滤） |
| 13 | `comments` | Comments (N) | `settings.COMMENTS == True` | 直接渲染 | `analysis.info.comments` | 低 |
| 14 | `misp` | MISP | `analysis.misp` truthy | 直接渲染 | `analysis.misp` | 低 |
| 15 | `backscatter` | Backscatter | `analysis.backscatter` truthy | 直接渲染 | `analysis.backscatter` | 低 |
| 16 | `classification` | Classification | `analysis.classification` truthy | 直接渲染 | `analysis.classification` | 低 |
| 17 | `compare-link` | Compare this analysis to... | `category == "file"` 且 `analysis.target` truthy | 链接（不是 tab） | 跳到 `compare_left` | — |
| 18 | `admin` | Admin | `settings.ADMIN OR user.is_staff` | 直接渲染 | 管理员命令面板 | 中 |

> **注**：tab 序号 17（compare-link）严格说不是 tab，是 nav-pills 里
> 的一个外链。

---

## 2. Overview tab 拆解（最复杂，**直接渲染**）

`overview/index.html`（194 行）调用 11 个子模板，每个由独立 `{% if %}`
守卫。**这是 v3 设计中最重要的"摘要端点"**，对应
`/api/v3/reports/<id>/summary/` 必须分块返回，不能全量塞一个端点。

| Section ID | 文件 | 触发条件 | 行数 | 数据 | v3 端点提案 |
|---|---|---|---|---|---|
| `info` | `overview/_info.html` | 永远 | 235 | `analysis.info.*`、target、machine、score、family、tlp | `/api/v3/reports/<id>/summary/`（`info` 子键） |
| `malware-config` | inline in `overview/index.html` | `analysis.malware_conf` truthy | ~95 | `analysis.malware_conf`（list of {family: config}） | `/api/v3/reports/<id>/config/`（已规划） |
| `file-details` | `generic/_file_info.html` | `category in "file,static"` 且 `target` truthy | 438 | `analysis.target`、PE/Office/PDF/MSI/LNK/dotnet 解析器输出 | `/api/v3/reports/<id>/static/`（已规划） |
| `url-details` | `overview/_url.html` | `category == "url"` | 13 | `analysis.target` | 同上（按 category 分支） |
| `capa-summary` | `overview/_capa_summary.html` | `analysis.capa_summary` truthy | 27 | `analysis.capa_summary` | `/api/v3/reports/<id>/static/`（capa 段） |
| `curtain` | `overview/_curtain.html` | `analysis.curtain` truthy | 112 | `analysis.curtain`（PowerShell deobf） | `/api/v3/reports/<id>/static/`（curtain 段） |
| `mitre` | `overview/_mitre.html` | `analysis.mitre_attck` truthy | 48 | `analysis.mitre_attck` | **`/api/v3/reports/<id>/attack/`**（已规划，复用 `mapTTPs.py` 输出） |
| `statistics` | `overview/_statistics.html` | `analysis.statistics` truthy | 83 | `analysis.statistics`（processing 模块耗时） | `/api/v3/reports/<id>/summary/`（`stats` 子键） |
| `signatures` | `overview/_signatures.html` | `analysis.signatures` truthy | 116 | `analysis.signatures`（数组） | **`/api/v3/reports/<id>/signatures/`**（已规划） |
| `screenshots` | `overview/_screenshots.html` | `analysis.shots` truthy | 27 | `analysis.shots` 列表 | **`/api/v3/reports/<id>/screenshots/`**（已规划） |
| `playback` | `overview/_playback.html` | `config.guacamole` 且 `analysis.info.options.interactive` | 57 | guac WS URL | 不在 v3，跳现有 `/guac/` |
| `network-overview` | inline + `network/_hosts_not_ajax.html` + `network/_dns_not_ajax.html` | `analysis.network.hosts` 或 `analysis.network.dns` | ~25 | `analysis.network.{hosts,dns}` | `/api/v3/reports/<id>/network/`（已规划，summary 子集） |
| `behavior-summary` | `overview/_summary.html` | `analysis.behavior.summary` truthy | 212 | `analysis.behavior.summary.{files,registry_keys,mutexes,executed_commands,resolved_apis}` | `/api/v3/reports/<id>/behavior/`（已规划，summary 子集） |

**v3 设计要点**：
- 设计稿（`cape-pages-report.jsx`）把 Overview 重构为 **VerdictBanner +
  Findings 侧栏 + 中心 Summary**。当前 SSR 的扁平多 section 结构在 v3
  里被压缩成"一个有焦点的视图"，需要前端组件级重组。
- `summary` 端点应该返回轻量级元数据（用于头部 + tab 计数），重型字段
  （signatures 数组、network 详情、capa rules）走各自端点。
- 上面"v3 端点提案"列直接对应 PRD §6.2.3 的 11 个端点，**新增需求**：
  `summary` 内部要包含一个 `available_sections` 字段，告知前端哪些
  section 有数据（决定 tab 显隐）。

---

## 3. Behavior tab 拆解（**最复杂的非 Overview tab**）

### 3.1 模板树

```
behavior/index.html (15 行)
├─ behavior/_tree.html           ← 进程树（process tree 视图）
└─ behavior/_processes.html (259 行)  ← 进程级 tab + 分页 call 列表
   └─ AJAX → /analysis/chunk/<id>/<pid>/<pagenum>/
      └─ behavior/_chunk.html
         └─ behavior/_api_call.html  ← 单条 API call 渲染
   └─ AJAX → behavior/_search_results.html  ← 调用搜索结果
   └─ behavior/_search.html  ← 搜索 UI
```

### 3.2 关键交互（必须等价复刻）

| 交互 | 现状实现 | v3/SPA 实现建议 |
|---|---|---|
| 进程树 | `_tree.html` 渲染 `analysis.behavior.processtree`（递归嵌套 dict） | **React Flow + dagre 自动布局**（PRD D-27/D-28） |
| 进程级 tab | 每个 PID 一个 tab，`#process_<pid>` | shadcn `<Tabs>` 或自定义 segmented control |
| Call 列表分页 | `load_chunk(pid, pagenum)` 通过 `.load()` 注入 HTML | TanStack Query `useInfiniteQuery` + `/api/v3/reports/<id>/behavior/calls/?pid=...&cursor=...` |
| Call 列表搜索 | `load_filtered_chunk(pid, category, caller, tid)` 走 `filtered_chunk` URL | 表单 + 同端点的 query params；TanStack Query 的 `queryKey` 含搜索参数 |
| 跳转到指定 call_id | `go_to_api_call(pid, call_id)` 计算页号、加载、滚到锚点 | URL hash `#/tasks/<id>/behavior/p<pid>/c<call_id>`，前端路由解析后高亮+滚动 |
| 默认筛选 | "category badge" 数组（filesystem / registry / network / synchronization / 等） | 同上，前端 chip 选择器 |

### 3.3 性能注意

- 单任务的 API call 数量常在 10k-100k 级别（设计稿 mock 数据 18.4k）。
  **绝对不能一次性下发**——`useInfiniteQuery` + 服务端 cursor 分页是
  唯一可行方案。每页 100 条沿用现有约定（`CHUNK_CALL_SIZE` from
  `modules/reporting/report_doc.py`）。
- 进程数通常 5-50；进程切换不会触发新 query（每进程独立 query key）。
- 进程树即便 100 节点也不大，可一次返回。

### 3.4 Linux 分支（strace + tracee）

`strace/` 目录结构跟 `behavior/` 几乎对称（同样的 `_tree`/`_processes`/
`_chunk`/`_search` 文件），数据来自不同字段。`tracee/` 是另一套，专
门展示 Aqua Tracee 的输出，前端组件可与 strace 复用 80%。

**v3 设计**：暂不区分 Windows 与 Linux 端点路径——`/api/v3/reports/<id>/behavior/`
统一返回，内部根据 `platform` 字段切换数据形态；前端 `BehaviorTab`
按 `report.platform` 决定渲染哪个变体。

---

## 4. Network tab 拆解

### 4.1 内嵌的 13 个子 tab

`network/index.html` 一次性 `{% include %}` 13 个子模板：

| 子 tab | 数据键 | 触发条件 | 行数 |
|---|---|---|---|
| Hosts | `network.hosts` | 永远（跟 DNS 一起作 active） | 见 `_hosts.html` |
| DNS | `network.domains` | 永远 | `_dns.html` |
| TCP | `network.tcp` | `tcp` 非空 | `_tcp.html` |
| UDP | `network.udp` | `udp` 非空 | `_udp.html` |
| HTTP(S) | `network.http_ex` 或 `https_ex` 或 `http` | 任一非空 | `_http.html` |
| SMTP | `network.smtp_ex` 或 `smtp` | 任一非空 | `_smtp.html` |
| IRC | `network.irc` | 非空 | `_irc.html` |
| ICMP | `network.icmp` | 非空 | `_icmp.html` |
| CIF Results | `cif` | `config.cif` 且 `cif` 非空 | `_cif.html` |
| Suricata Alerts | `suricata.alerts` | `config.suricata` 且非空 | `_suricata_alerts.html`（139 行） |
| Suricata TLS | `suricata.tls` | 同上 | `_suricata_tls.html` |
| Suricata HTTP | `suricata.http` | 同上 | `_suricata_http.html` |
| Suricata Files | `suricata.files` | 同上 | `_suricata_files.html`（139 行） |

### 4.2 PCAP 下载按钮组

顶部一组下载按钮，每个由独立条件控制：

| 按钮 | URL | 条件 |
|---|---|---|
| PCAP | `/file/pcap/<id>/<sha256>/` | `network.pcap_sha256` |
| PCAP-NG | `/file/pcapng/<id>/dump/` | `config.pcap_ng` |
| PCAP zip | `/file/pcapzip/<id>/<sha256>/` | 永远（与 PCAP 同时显示） |
| TLS keys | `/file/tlskeys/<id>/<sha256>/` | `tlskeys_exists` |
| Mitmdump | `/file/mitmdump/<id>/0/` | `mitmdump_exists` |
| Decrypted PCAP | `/file/decrypted_pcap/<id>/dump/` | `decrypted_pcap_exists` |
| Mixed PCAP | `/file/mixed_pcap/<id>/dump/` | `mixed_pcap_exists` |

### 4.3 v3 端点设计（修正 PRD §6.2.3）

PRD 原方案 `/api/v3/reports/<id>/network/` 一个端点返回所有子集——按
spike 结果，**这一项可能数据量过大**（HTTP 流可达数千条 + Suricata
告警可达上万）。建议：

- `/api/v3/reports/<id>/network/` 返回 summary（每个子 tab 的计数 +
  hosts/dns 列表，因为它们出现在 Overview 中也要用）
- `/api/v3/reports/<id>/network/<protocol>/` 返回单一协议的详细数据
  （`protocol ∈ {tcp,udp,http,smtp,irc,icmp,cif,suricata-alerts,
  suricata-tls,suricata-http,suricata-files}`）
- 前端 NetworkTab 内的子 tab 按需用 TanStack Query 拉对应 protocol

**Decision Log 增补建议**：D-29 = 网络数据按协议子端点切分，避免单端点
返回过大。

---

## 5. Memory tab（Volatility 视图）

`memory/index.html` 包含 18 个子模板：apihooks / callbacks / devicetree
/ dlllist / gdt / getsids / handles / idt / malfind / messagehooks /
modscan / mutantscan / netscan / privs / pslist / psscan / rootkit /
sockscan / ssdt / svcscan / timers / yarascan。

每个由 `{% if memory.<name> %}` 守卫。这些是 Volatility plugins 的输出
表格。**MVP 内可不做**：

**建议**：MVP 内 Memory tab 维持简单——一个 select 下拉切换插件，每个
插件一张大表（TanStack Table）。不做 18 个子组件的精细 UI 区分。
P1 阶段再优化。

---

## 6. EventLogs tab（最特殊）

`eventlogs/index.html` 510 行（看名次第二，仅次于 `index.html`）。它
做了：

1. EVTX 文件 channel 列表（多个 channel：Security / System / Application
   / Sysmon / 等）
2. 每 channel 内的 event 列表（**两级 AJAX 分页**：先选 channel，再
   分页查 events）
3. 关键字搜索（`search_query` 参数）
4. 噪声过滤（`_load_evtx_noise_filters()` 加载预定义的不感兴趣 event
   ID 集合，前端可切换 "show noisy"）

**v3 端点**：
- `/api/v3/reports/<id>/eventlogs/channels/` 列出 channel
- `/api/v3/reports/<id>/eventlogs/<channel>/?cursor=...&q=...&include_noise=...`
  返回 events

PRD §6.2.3 没有单独列 eventlogs，**建议增补**为 **D-30**。

---

## 7. 其他 tab 简述

| Tab | 复杂度 | 说明 |
|---|---|---|
| Dropped | 中 | 文件列表 + 每文件 `_subfile_info.html`（420 行，含 PE 解析、yara、capa） |
| Procmemory | 中 | 进程内存条目列表，每条带 yara/PE 子视图 |
| Procdump | 中 | 进程 dump 列表，类似 procmemory |
| CAPE Payloads | 中 | unpacked payloads，复用 `_subfile_info.html`；与 `malware_conf` 关联 |
| Debugger | 中 | 调试器日志 + 反汇编 |
| Comments | 低 | 文本时间线 |
| MISP | 低 | 一段 JSON 渲染 |
| Backscatter | 低 | 简单表 |
| Classification | 低 | 简单分类徽标 |
| Admin | 中 | staff-only 操作面板（删除 / 重处理 / 标记 / 等） |

---

## 8. 跨 tab 全局机制

### 8.1 Tab 状态记忆

`localStorage.lastAnalysisTab` 在同页刷新时恢复。SPA 里等价于 URL
路径状态：`/tasks/<id>/behavior` 直接带 tab 信息。**优于现状**——可
分享、可回退。

### 8.2 TLP 强制

报告页顶部有 TLP 横幅。所有"二进制下载"端点（PCAP / dropped / payload
/ ...）在视图层都检查 `tlp == "red"` 并 403。SPA 必须保留同样语义；
PRD §10.3 兼容性验收已包含。

### 8.3 file 下载端点

报告页里嵌入大量 `<a href="{% url "file" "<category>" id "<sha256>" %}">`
的下载链接（PCAP / dropped 单文件 / payload / 截图 / EVTX zip / 等）。
v2 已经存在这些端点（`/file/<category>/<task_id>/<dlfile>/`）。**SPA
直接 `<a href>`** 利用浏览器 cookie 鉴权——已在 PRD §6.2.3 注脚明确。

### 8.4 调试器跳转

`go_to_api_call(pid, call_id)` 是跨 tab 的"硬连接"——signature 命中里
的"jump to call"按钮调用它，把焦点切到 Behavior tab、找到正确分页、
滚动到锚点。SPA 用 URL hash 表达：`/tasks/<id>/behavior/p<pid>/c<call_id>`。

### 8.5 Signature → TTPs 关联

`overview/_signatures.html`（116 行）渲染时，每条 signature 的 `ttp`
字段（`["T1055", ...]`）作为 chip 显示，点击跳转 ATT&CK tab。SPA 等
价：chip 是 `<Link to="../attack#T1055">`。

---

## 9. v3 端点矩阵（基于 spike 修正）

将 PRD §6.2.3 与本 spike 对齐后的最终端点清单：

| 端点 | 状态 | 说明 |
|---|---|---|
| `/api/v3/reports/<id>/summary/` | PRD 已规划 | **新增字段** `available_sections: string[]` 决定 tab 显隐 |
| `/api/v3/reports/<id>/static/` | PRD 已规划 | 含 PE/Office/PDF/MSI/LNK/dotnet/capa/curtain/floss 子键 |
| `/api/v3/reports/<id>/behavior/` | PRD 已规划 | 进程树 + 摘要 + summary（不含 calls） |
| `/api/v3/reports/<id>/behavior/calls/?pid=...&cursor=...` | PRD 已规划 | API call 分页（含 filter 参数） |
| `/api/v3/reports/<id>/network/` | **修正** | summary（hosts、dns、各协议计数） |
| `/api/v3/reports/<id>/network/<protocol>/` | **新增**（D-29 提案） | 单协议详情 |
| `/api/v3/reports/<id>/dropped/` | PRD 已规划 | dropped 文件元数据 |
| `/api/v3/reports/<id>/screenshots/` | PRD 已规划 | 截图 URL 列表 |
| `/api/v3/reports/<id>/payloads/` | PRD 已规划 | CAPE payloads 元数据 |
| `/api/v3/reports/<id>/procdump/` | **新增** | 进程 dump 列表 |
| `/api/v3/reports/<id>/procmemory/` | **新增** | 进程内存列表 |
| `/api/v3/reports/<id>/memory/` | **新增** | Volatility 插件输出汇总 |
| `/api/v3/reports/<id>/memory/<plugin>/` | **新增** | 单插件详情（pslist/malfind/...） |
| `/api/v3/reports/<id>/eventlogs/channels/` | **新增**（D-30 提案） | EVTX channel 列表 |
| `/api/v3/reports/<id>/eventlogs/<channel>/?cursor=...&q=...` | **新增**（D-30 提案） | EVTX 分页 + 搜索 |
| `/api/v3/reports/<id>/debugger/` | **新增** | debugger 日志 |
| `/api/v3/reports/<id>/comments/` | P1（PRD §6.4） | 评论 |
| `/api/v3/reports/<id>/attack/` | PRD 已规划 | ATT&CK 矩阵 |
| `/api/v3/reports/<id>/config/` | PRD 已规划 | malware config |
| `/api/v3/reports/<id>/signatures/` | PRD 已规划 | signature 数组 |

**总计**：19 个 v3 报告类端点（PRD 原 11 + 新增 6 + 调整 2 + P1 1）。

---

## 10. 设计稿一致性检查

设计稿 `frontend/web-design/cape-pages-report.jsx` 定义了 9 个一级 tab：

```
Summary / Static / Behavior / Network / Dropped / Screenshots / Payloads / ATT&CK / Config
```

跟现状 14 tab 对照差异：

| 当前 SSR | 设计稿 | 决议 |
|---|---|---|
| Quick Overview（信息密集） | Summary | 简化合并；`Findings 侧栏` 替代 `_signatures.html` |
| Behavioral / strace / tracee | Behavior | 按平台合并到一个 tab，内部分支 |
| Network（13 子 tab） | Network | 简化为 React Flow 拓扑 + Recharts 时序，子 tab 减为 5-6 个 |
| Dropped | Dropped | 1:1 |
| Screenshots | Screenshots | 1:1 |
| Procmemory / Procdump / Memory | （无） | **设计稿未画**——MVP 暂不做，P1 补 |
| CAPE Payloads | Payloads | 1:1 |
| Debugger | （无） | **设计稿未画**——MVP 暂不做 |
| Event Logs | （无） | **设计稿未画**——MVP 暂不做 |
| Comments / MISP / Backscatter / Classification | （无） | MVP 暂不做 |
| MITRE（在 Overview 里） | ATT&CK（独立 tab） | **设计稿提升为一级 tab** |
| Malware Config（在 Overview 里） | Config（独立 tab） | **设计稿提升为一级 tab** |
| Admin | （无） | 用 `/admin/` Django admin 处理 |
| Compare 入口（链接） | Compare 顶级页面 | 设计稿把它做成独立页面 |

**结论**：设计稿是**精简后的子集**——MVP 落地按设计稿 9 tab，砍掉
Memory / Procdump / Procmemory / Debugger / EventLogs / Comments / MISP
/ Backscatter / Classification 这 9 个低频 tab。这些 tab 在 P1 或更
后补回（端点已在表 §9 中规划，可独立交付）。

**对应行动**：
1. 把"砍掉的 tab"作为 PRD 显式 P1 列表更新到 §3.2（建议改为
   `P1-4: 报告页扩展 tab（Memory / EventLogs / Procdump / Debugger / Comments / MISP / Backscatter / Classification）`）
2. 设计稿没画的 ATT&CK / Config 已经在 D-22/D-23 处理过，符合设计

---

## 11. 风险更新

| ID | 风险 | 等级（更新） | 说明 |
|---|---|---|---|
| R1 | 报告页复杂度高估难 | **中**（降级） | 设计稿砍 9 tab 后，MVP 范围明显收缩；spike 后边界清晰 |
| R1.1 | API call 列表分页性能 | **中** | 单进程 10k+ 调用，必须 cursor 分页 + 虚拟滚动；TanStack Query InfiniteQuery + react-virtuoso |
| R1.2 | Network tab 单端点过载 | 中 | 已在 D-29 提案中切分 |
| R1.3 | EventLogs 实现成本高 | 低（推到 P1） | 510 行模板 + 双级 AJAX，不进 MVP |
| R1.4 | 进程树自动布局 | 低 | dagre 已在依赖里；100 节点级别无性能问题 |
| R1.5 | Volatility 18 子模块 | 低（推到 P1） | 模板每个 100-300 行，MVP 不做 |

---

## 12. W8 启动清单

按本 spike 结论，W8 第一周第一天的具体任务：

1. **后端端点扩展**（在 W3 `web/services/` 骨架基础上）：
   - 新增 6 个端点：`network/<protocol>/`、`procdump/`、`procmemory/`、
     `memory/`、`memory/<plugin>/`、`eventlogs/channels/`、
     `eventlogs/<channel>/`、`debugger/`
   - 在 `summary` 端点添加 `available_sections` 字段
2. **前端组件骨架**（`frontend/app/src/components/report/`）：
   - `VerdictBanner`（设计稿头部，新组件）
   - `FindingsRail`（左侧 signatures 列表，对应 `overview/_signatures.html`）
   - `<Tabs>` 容器（9 tab）
   - 9 个 `<Tab>` 组件 stub（依次实现）
3. **路由更新**：`/tasks/:id/:tab?` 让 URL 含 tab 状态
4. **数据钩子**：`useReportSummary(id)`、`useReportTab(id, tab)`，按 tab
   懒加载

---

## 13. 仍未决（W8 启动前需澄清）

| OQ | 问题 |
|---|---|
| OQ-A | API call 列表是否需要虚拟滚动（react-virtuoso）？预期单进程峰值多少条？ |
| OQ-B | 进程树超过 200 节点时是否需要折叠？Linux strace 数据典型规模？ |
| OQ-C | "go_to_api_call" 跨 tab 跳转的 URL hash 格式（`#c<call_id>` vs query param）？ |
| OQ-D | Network 协议子端点的 cursor 字段名是否与 `tasks/list/` 对齐？ |
| OQ-E | `available_sections` 是否包含数量信息（用于 tab 标题计数 `Behavior (18.4k)`），还是只布尔？ |

这些 OQ 不阻塞 W8 启动，可在前 2 天内 spike 解决。

---

**文档结束。**
