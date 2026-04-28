# 仅使用 HTTP 完成样本沙箱分析的工作流

本目录说明如何**只通过 `/apiv2/` REST API** 驱动一次完整的 CAPE 沙箱分析——
从样本提交到 JSON 报告与各类二进制制品的获取。本目录是自包含的，不属于
`docs/book/` 下的 Sphinx 主文档树。

文件清单：

- `README.md`：本指南（端点参考 + 最小客户端）。
- `run_analysis.sh`：端到端跑完整流程的独立 bash 脚本。

适用对象是希望在不使用 Web UI 与 `utils/submit.py` CLI 的前提下，以编程方式
集成 CAPE 的内部团队或私有化部署。

## 适用范围

客户端可以**通过 HTTP 完成完整分析生命周期**：

1. 鉴权（一次性，拿到 token）。
2. 提交文件或 URL。
3. 轮询任务状态直到 `reported`。
4. 拉取 JSON 报告和所需制品（PCAP、截图、释放文件、CAPE 配置、payload、
   进程内存等等）。

Host↔Guest 之间的 agent 协议（VM 内 `http://<vm_ip>:8000`）是**内部协议**：
由 CAPE host 主进程（`lib/cuckoo/core/guest.py`）在驱动 VM 时使用，客户端
不应直接调用。

## 前置条件（一次性，无法通过 HTTP 完成）

下列工作必须事先准备就绪，无法通过公共 API 完成：

- CAPE host 已部署，四个 systemd 服务在运行：`cape.service`、
  `cape-processor.service`、`cape-rooter.service`、`cape-web.service`。
- 至少一台分析 VM 已就绪（含快照），并且 VM 内的 `agent.py` 正在运行。
- 你打算调用的端点已在 `conf/api.conf` 中**启用**（参见下文
  [按端点门控](#按端点门控)——许多端点默认 `enabled = no`）。
- 如使用 Token 鉴权，已为对应用户创建 token
  （`manage.py drf_create_token <user>`，或通过
  `POST /apiv2/api-token-auth/` 自动生成）。

## 鉴权

`web/web/settings.py` 中配置了两套鉴权后端：

- `rest_framework.authentication.TokenAuthentication`——推荐用于编程访问。
- `rest_framework.authentication.SessionAuthentication`——浏览器使用。

### Token 获取

```bash
curl -d "username=<USER>&password=<PASSWD>" \
     "https://<HOST>/apiv2/api-token-auth/"
# → {"token": "0123abcd..."}
```

后续所有请求都需要带上：

```
Authorization: Token 0123abcd...
```

Token 鉴权由 `api.conf` 中 `[api] token_auth_enabled` 控制（默认为 `no`，
适合仅本地访问且 session 鉴权够用的部署；任何非平凡集成都应改为 `yes`）。
每个端点的限流（throttle）规则也定义在 `api.conf` 中。

## 按端点门控

`web/apiv2/views.py` 里的每个视图在处理请求前都会检查 `api.conf` 中对应
配置项。如果该项是 `enabled = no`，端点将返回：

```json
{"error": true, "error_value": "<feature> API is Disabled"}
```

`conf/default/api.conf.default` 中的默认值偏保守。**默认禁用**的端点
（部分举例）包括：`taskdelete`、`taskreprocess`、`taskresched`、
`machinelist`、`machineview`、`cuckoostatus`、`sampledl`、
`taskfullmemory`、`taskselfextracted`、`downloading_services`、
`dlnexeccreate`、`mitmdump`、`rollingsuri`、`list_exitnodes`、
`statistics`、`tasks_latest`、`task_x_hours`、`user_stop`。需要使用时
请显式开启。

## 端点参考

下文所有路径都以 `/apiv2/` 为前缀。"门控"列是视图所检查的 `api.conf`
区块名；"默认"列是该 `enabled` 标志在 `conf/default/api.conf.default`
中的默认值。

### 鉴权

| 方法 | 路径                  | 视图                         | 门控（默认）                     | 备注                                                  |
| ---- | --------------------- | ---------------------------- | -------------------------------- | ----------------------------------------------------- |
| POST | `/api-token-auth/`    | `rest_framework.authtoken`   | `[api] token_auth_enabled`（no） | Body：`username`、`password`，返回 `{"token": "..."}` |

### 提交

提交类端点共用 18 个参数，由 `lib/cuckoo/common/web_utils.py` 中的
`parse_request_arguments()` 统一解析：`package`、`timeout`、`priority`、
`options`、`machine`、`platform`、`tags`、`custom`、`memory`、`clock`、
`enforce_timeout`、`unique`、`referrer`、`tlp`、`tags_tasks`、`route`、
`cape`、`static`。

| 方法 | 路径                                  | 视图                       | 门控（默认）                     | Body                                                                                                              |
| ---- | ------------------------------------- | -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| POST | `/tasks/create/file/`                 | `tasks_create_file`        | `[filecreate]`（yes）            | multipart `file=@...` + 共用参数。`pcap=1` 仅 PCAP 模式，`static=1` 仅静态分析。                                  |
| POST | `/tasks/create/url/`                  | `tasks_create_url`         | `[urlcreate]`（yes）             | `url=...` + 共用参数。                                                                                            |
| POST | `/tasks/create/dlnexec/`              | `tasks_create_dlnexec`     | `[dlnexeccreate]`（no）          | `dlnexec=<url>`：host 拉取该 URL 后在 VM 内执行。                                                                 |
| POST | `/tasks/create/static/`               | `tasks_create_static`      | `[staticextraction]`（yes）      | `file=@...`：仅静态分析，不分配 VM。                                                                              |
| POST | `/tasks/create/download_services/`    | `tasks_download_services`  | `[downloading_services]`（no）   | `hashes=...`（md5/sha1/sha256）。可选 `options=apikey=<vt>`，从 VirusTotal / MalwareBazaar 拉样本。               |

均返回统一信封：

```json
{"error": false, "data": {"task_ids": [123], "message": "..."}}
```

### 状态、机器、系统

| 方法 | 路径                              | 视图              | 门控（默认）              | 备注                                                                                                                                                       |
| ---- | --------------------------------- | ----------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET  | `/tasks/status/<task_id>/`        | `tasks_status`    | `[taskstatus]`（yes）     | 返回 `{"data": "<state>"}`，状态值：`pending`、`running`、`completed`、`reported`、`failed_analysis`、`failed_processing`、`failed_reporting`。            |
| POST | `/tasks/status/<task_id>/`        | `tasks_status`    | `[user_stop]`（no）       | Body `status=finish`，让 host 通知正在跑的 guest 提前结束。                                                                                                |
| GET  | `/tasks/view/<task_id>/`          | `tasks_view`      | `[taskview]`（yes）       | 任务完整元数据。                                                                                                                                           |
| GET  | `/cuckoo/status/`                 | `cuckoo_status`   | `[cuckoostatus]`（no）    | 沙箱整体状态（版本、队列、磁盘）。                                                                                                                         |
| GET  | `/machines/list/`                 | `machines_list`   | `[machinelist]`（no）     | 所有已注册机器。                                                                                                                                           |
| GET  | `/machines/view/<name>/`          | `machines_view`   | `[machineview]`（no）     | 单台机器详情。                                                                                                                                             |
| GET  | `/exitnodes/`                     | `exit_nodes_list` | `[list_exitnodes]`（no）  | 可作为 `route` 参数的 VPN / SOCKS5 出口节点。                                                                                                              |

### 列表与搜索

| 方法 | 路径                                                | 视图                  | 门控（默认）                  | 备注                                          |
| ---- | --------------------------------------------------- | --------------------- | ----------------------------- | --------------------------------------------- |
| GET  | `/tasks/list/[<limit>/[<offset>/[<window>/]]]`      | `tasks_list`          | `[tasklist]`（yes）           | `window` 单位为小时。                         |
| GET  | `/tasks/get/latests/<hours>/`                       | `tasks_latest`        | `[tasks_latest]`（no）        | 最近 N 小时新增的任务。                       |
| GET  | `/tasks/stats/`                                     | `task_x_hours`        | `[task_x_hours]`（no）        | 按小时分桶的任务计数。                        |
| GET  | `/tasks/statistics/<days>/`                         | `statistics_data`     | `[statistics]`（no）          | 按天分桶的任务计数。                          |
| GET  | `/tasks/search/{md5,sha1,sha256}/<value>/`          | `tasks_search`        | `[tasksearch]`（yes）         | 按样本 hash 搜索任务。                        |
| POST | `/tasks/extendedsearch/`                            | `ext_tasks_search`    | `[extendedtasksearch]`（yes） | Body `option=<field>&argument=<value>`。     |
| GET  | `/files/view/{md5,sha1,sha256,id}/<value>/`         | `files_view`          | `[fileview]`（yes）           | 样本元数据。                                  |

### 报告与制品

| 方法 | 路径                                                       | 视图                    | 门控（默认）                  | 备注                                                                                              |
| ---- | ---------------------------------------------------------- | ----------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- |
| GET  | `/tasks/get/report/<task_id>/[<format>/[<make_zip>/]]`     | `tasks_report`          | `[taskreport]`（yes）         | `format ∈ {json, html, all, dropped, dist, lite, ...}`，默认 `json`。                              |
| GET  | `/tasks/get/iocs/<task_id>/[detailed/]`                    | `tasks_iocs`            | `[taskiocs]`（yes）           | 简要或详细版 IOC。                                                                                |
| GET  | `/tasks/get/config/<task_id>/[<cape_name>/]`               | `tasks_config`          | `[capeconfig]`（yes）         | 提取出的恶意家族 config，可按家族筛选。                                                           |
| GET  | `/tasks/get/screenshot/<task_id>/[<n>/]`                   | `tasks_screenshot`      | `[taskscreenshot]`（yes）     | 全部截图打包 ZIP，或按索引取单张 PNG。                                                            |
| GET  | `/tasks/get/pcap/<task_id>/`                               | `tasks_pcap`            | `[taskpcap]`（yes）           | auxiliary sniffer 抓的 `dump.pcap`。                                                              |
| GET  | `/tasks/get/tlspcap/<task_id>/`                            | `tasks_tlspcap`         | `[tasktlspcap]`（yes）        | TLS 解密后的 PCAP。                                                                               |
| GET  | `/tasks/get/evtx/<task_id>/`                               | `tasks_evtx`            | `[taskevtx]`（yes）           | Windows EVTX 日志包。                                                                             |
| GET  | `/tasks/get/mitmdump/<task_id>/`                           | `tasks_mitmdump`        | `[mitmdump]`（no）            | mitmproxy 抓包（注意：门控名与路径不一致）。                                                      |
| GET  | `/tasks/get/dropped/<task_id>/`                            | `tasks_dropped`         | `[taskdropped]`（yes）        | 样本在 guest 内释放的文件 ZIP。                                                                   |
| GET  | `/tasks/get/selfextracted/<task_id>/[<tool>/]`             | `tasks_selfextracted`   | `[taskselfextracted]`（no）   | 自解压产物，可按工具筛选。                                                                        |
| GET  | `/tasks/get/surifile/<task_id>/`                           | `tasks_surifile`        | `[taskdropped]`（yes）        | Suricata 抽取出的文件（与 dropped 共用门控）。                                                    |
| GET  | `/tasks/get/payloadfiles/<task_id>/`                       | `tasks_payloadfiles`    | `[payloadfiles]`（yes）       | CAPE 自动 unpack 出来的 payload。                                                                 |
| GET  | `/tasks/get/procdumpfiles/<task_id>/`                      | `tasks_procdumpfiles`   | `[procdumpfiles]`（no）       | 各进程的内存 dump。                                                                               |
| GET  | `/tasks/get/procmemory/<task_id>/[<pid>/]`                 | `tasks_procmemory`      | `[taskprocmemory]`（yes）     | 全部进程内存或单进程。                                                                            |
| GET  | `/tasks/get/fullmemory/<task_id>/`                         | `tasks_fullmemory`      | `[taskfullmemory]`（no）      | 整机内存 dump（体积大）。                                                                         |
| POST | `/tasks/get/stream/<task_id>/`                             | `tasks_file_stream`     | `[taskstatus]`（yes）         | 在 guest 还在跑时流式取文件。                                                                     |
| GET  | `/files/get/{md5,sha1,sha256,task}/<value>/`               | `file`                  | `[sampledl]`（no）            | 下载原始样本。                                                                                    |

### 任务管理

| 方法 | 路径                                          | 视图                  | 门控（默认）              | 备注                                                                  |
| ---- | --------------------------------------------- | --------------------- | ------------------------- | --------------------------------------------------------------------- |
| GET  | `/tasks/reschedule/<task_id>/`                | `tasks_reschedule`    | `[taskresched]`（no）     | 重新入队。                                                            |
| GET  | `/tasks/reprocess/<task_id>/`                 | `tasks_reprocess`     | `[taskreprocess]`（no）   | 仅重跑 processing/signatures/reporting。                              |
| GET  | `/tasks/delete/<task_id>/[<status>/]`         | `tasks_delete`        | `[taskdelete]`（no）      | `task_id` 支持 `1,2,3` 或 `1-5`，可附加状态过滤。                     |
| POST | `/tasks/delete_many/`                         | `tasks_delete_many`   | `[taskdelete]`（no）      | Body `task_ids=1,2,3`。                                               |

### Suricata 滚动

| 方法 | 路径                                  | 视图                  | 门控（默认）             | 备注                                              |
| ---- | ------------------------------------- | --------------------- | ------------------------ | ------------------------------------------------- |
| GET  | `/tasks/rollingsuri/[<window>/]`      | `tasks_rollingsuri`   | `[rollingsuri]`（no）    | 跨最近任务的滚动 Suricata 告警。                  |

### 分布式

下列视图供分布式 controller（`utils/dist.py`，独立 Flask 进程）使用，
**标准单机部署中并未挂入** `web/apiv2/urls.py`：

- `GET /apiv2/dist/tasks_reported` → `dist_tasks_reported`
- `GET /apiv2/dist/tasks_notification/<task_id>` → `dist_tasks_notification`

### 自查页面

- `GET /apiv2/`（`index`）—— 渲染 `web/templates/apiv2/index.html`，
  即一张面向人的端点表格，会从 `api.conf` 实时读取每个端点的 `enabled`、
  RPS、RPM。可用于确认某个部署上到底开放了哪些端点。

## 最小可行客户端

参见本目录下的 [`run_analysis.sh`](./run_analysis.sh)，是一个跑完整流程的
独立 bash 脚本。脚本默认假设 `[filecreate]`、`[taskstatus]`、
`[taskreport]`、`[taskiocs]`、`[capeconfig]`、`[taskpcap]`、
`[payloadfiles]`、`[taskscreenshot]` 这些门控均已开启（这也是默认值），
且使用 Token 鉴权。

用法：

```bash
HOST=https://cape.example.com USER=alice PASS=secret \
    ./run_analysis.sh ./sample.exe
```

URL 提交、`dlnexec`、`download_services` 走的是同一套 **submit → poll →
fetch** 模式，仅 create 端点不同。

## 运维要点

- **轮询节奏**：`[taskstatus]` 是访问频率最高的端点，限流默认值最宽松
  （`rps = 4/s`）。每 5 秒轮询一次比较舒适；亚秒级会触限流。
- **失败状态**：以 `failed_analysis`、`failed_processing`、
  `failed_reporting` 结尾的任务**不会**变成 `reported`。任何 `failed_*`
  状态都视为终态，并通过 `GET /tasks/view/<task_id>/` 拉详情排查。
- **大体量制品**：`fullmemory`、`procmemory`（全 PID）、`payloadfiles`、
  `procdumpfiles` 可达数百 MB。请使用 `curl -o` 流式落盘，并在按二进制
  处理前先确认响应不是 JSON 错误信封。
- **HTTP 做不到的事**：开启端点、为新用户签发 token、配置 VM、配置网络
  路由、改 `processing.conf`/`reporting.conf` —— 这些都是带外操作，需
  纳入部署 runbook。

## 相关资料

- `docs/book/src/usage/api.rst` —— REST API 安装、token 生成与限流。
- `docs/book/src/usage/submit.rst` —— 非 API 提交方式（Web UI、
  `submit.py`）。
- `docs/book/src/usage/internals.rst` —— host/guest 分析生命周期。
- `docs/book/src/usage/results.rst` —— `/tasks/get/report/` 返回的 JSON
  报告结构。
