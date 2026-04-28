# CAPE HTTP API 规格说明

本文档对 [`README.md`](./README.md) 中列出的所有 `/apiv2/` 端点逐一展开，
覆盖：

- **用途**：该接口要解决什么问题
- **请求**：方法、路径、参数（路径 / Query / Body / Header）含义与类型
- **响应**：成功与错误的返回结构
- **示例**：可直接复制运行的 `curl` 命令

> **基础信息**：所有路径都以 `/apiv2/` 为前缀；除取得 token 自身的端点外，
> 都需要 `Authorization: Token <token>` 头部（启用了 token 鉴权时）。
> 所有 JSON 响应统一信封 `{"error": false|true, "data": ..., "error_value": "..."}`，
> 文件下载类端点直接返回二进制流 + `Content-Disposition`。
> 占位符约定：`<HOST>` 表示部署域名，`<TOKEN>` 表示鉴权 token，
> `<TASK_ID>` 表示任务 ID。

---

## 目录

- [鉴权](#鉴权)
  - [1. 获取 Token](#1-获取-token)
- [样本提交](#样本提交)
  - [2. 提交本地文件](#2-提交本地文件)
  - [3. 提交 URL](#3-提交-url)
  - [4. 提交远程下载并执行](#4-提交远程下载并执行)
  - [5. 仅静态分析](#5-仅静态分析)
  - [6. 从威胁情报源拉样本](#6-从威胁情报源拉样本)
- [任务状态、机器、系统](#任务状态机器系统)
  - [7. 查询任务状态](#7-查询任务状态)
  - [8. 提前结束运行中的任务](#8-提前结束运行中的任务)
  - [9. 查看任务详情](#9-查看任务详情)
  - [10. 沙箱整体状态](#10-沙箱整体状态)
  - [11. 列出所有机器](#11-列出所有机器)
  - [12. 查看单台机器](#12-查看单台机器)
  - [13. 列出出口节点](#13-列出出口节点)
- [列表与搜索](#列表与搜索)
  - [14. 列出任务](#14-列出任务)
  - [15. 最近 N 小时任务](#15-最近-n-小时任务)
  - [16. 按小时分桶统计](#16-按小时分桶统计)
  - [17. 按天分桶统计](#17-按天分桶统计)
  - [18. 按 hash 搜索任务](#18-按-hash-搜索任务)
  - [19. 扩展搜索](#19-扩展搜索)
  - [20. 查看样本元数据](#20-查看样本元数据)
- [报告与制品](#报告与制品)
  - [21. 拉取分析报告](#21-拉取分析报告)
  - [22. 拉取 IOC](#22-拉取-ioc)
  - [23. 拉取 CAPE 配置](#23-拉取-cape-配置)
  - [24. 拉取截图](#24-拉取截图)
  - [25. 拉取原始 PCAP](#25-拉取原始-pcap)
  - [26. 拉取 TLS 解密 PCAP](#26-拉取-tls-解密-pcap)
  - [27. 拉取 EVTX 日志](#27-拉取-evtx-日志)
  - [28. 拉取 mitmproxy 抓包](#28-拉取-mitmproxy-抓包)
  - [29. 拉取释放文件](#29-拉取释放文件)
  - [30. 拉取自解压产物](#30-拉取自解压产物)
  - [31. 拉取 Suricata 抽取文件](#31-拉取-suricata-抽取文件)
  - [32. 拉取 CAPE Payload](#32-拉取-cape-payload)
  - [33. 拉取进程 dump 文件](#33-拉取进程-dump-文件)
  - [34. 拉取进程内存](#34-拉取进程内存)
  - [35. 拉取整机内存](#35-拉取整机内存)
  - [36. 在线流式取文件](#36-在线流式取文件)
  - [37. 下载原始样本](#37-下载原始样本)
- [任务管理](#任务管理)
  - [38. 重新排队](#38-重新排队)
  - [39. 重跑后处理](#39-重跑后处理)
  - [40. 删除任务](#40-删除任务)
  - [41. 批量删除任务](#41-批量删除任务)
- [Suricata 滚动](#suricata-滚动)
  - [42. 滚动 Suricata 告警](#42-滚动-suricata-告警)
- [分布式](#分布式)
  - [43. 已 reported 任务列表](#43-已-reported-任务列表)
  - [44. 任务通知回调](#44-任务通知回调)
- [自查](#自查)
  - [45. 端点总览页](#45-端点总览页)
- [附录 A：样本提交共享参数](#附录-a样本提交共享参数)
- [附录 B：扩展搜索字段一览](#附录-b扩展搜索字段一览)

---

## 鉴权

### 1. 获取 Token

**用途**：以用户名/密码换取 DRF Token。

**请求**

- 方法：`POST`
- 路径：`/apiv2/api-token-auth/`
- 门控：`[api] token_auth_enabled`（默认 `no`）

| 位置 | 参数       | 类型   | 必填 | 说明           |
| ---- | ---------- | ------ | ---- | -------------- |
| Body | `username` | string | 是   | 用户名         |
| Body | `password` | string | 是   | 密码（明文）   |

**响应**

```json
{ "token": "0123abcd..." }
```

**示例**

```bash
curl -X POST "https://<HOST>/apiv2/api-token-auth/" \
     -d "username=alice&password=secret"
```

> 之后所有请求都需要带 `-H "Authorization: Token 0123abcd..."`。

---

## 样本提交

> 样本提交类共用 18 个参数，详见 [附录 A](#附录-a样本提交共享参数)。

### 2. 提交本地文件

**用途**：上传一个本地文件到沙箱排队分析（默认动态分析）。

**请求**

- 方法：`POST`
- 路径：`/apiv2/tasks/create/file/`
- Content-Type：`multipart/form-data`
- 门控：`[filecreate]`（默认 `yes`）

| 位置 | 参数        | 类型 | 必填 | 默认 | 说明                                           |
| ---- | ----------- | ---- | ---- | ---- | ---------------------------------------------- |
| Body | `file`      | file | 是   | —    | 待分析文件，可重复（如启用 `multifile=yes`）   |
| Body | `pcap`      | int  | 否   | 0    | `1` 表示当作 PCAP 任务（`saz` 自动转 pcap）    |
| Body | `static`    | int  | 否   | 0    | `1` 表示仅做静态分析，不分配 VM                |
| Body | 共享 18 项  | —    | —    | —    | 见 [附录 A](#附录-a样本提交共享参数)           |

**响应（成功）**

```json
{
  "error": false,
  "data": {
    "task_ids": [123],
    "message": "Task ID 123 has been submitted"
  },
  "errors": []
}
```

**响应（失败）**

```json
{ "error": true, "error_value": "No file was submitted" }
```

**示例**

```bash
curl -F "file=@./sample.exe" \
     -F "package=exe" -F "timeout=120" -F "priority=2" \
     -F "options=procdump=1,human=1" -F "route=internet" \
     -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/create/file/"
```

---

### 3. 提交 URL

**用途**：把一个 URL 投到沙箱内执行（VM 浏览器打开等）。

**请求**

- 方法：`POST`
- 路径：`/apiv2/tasks/create/url/`
- 门控：`[urlcreate]`（默认 `yes`）

| 位置 | 参数       | 类型   | 必填 | 说明                                 |
| ---- | ---------- | ------ | ---- | ------------------------------------ |
| Body | `url`      | string | 是   | 要分析的 URL                         |
| Body | 共享 18 项 | —      | —    | 见 [附录 A](#附录-a样本提交共享参数) |

**响应**：同 [#2](#2-提交本地文件)。

**示例**

```bash
curl -d "url=http://example.com/payload" \
     -d "package=ie" -d "timeout=60" -d "route=internet" \
     -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/create/url/"
```

---

### 4. 提交远程下载并执行

**用途**：让 host 主动下载某个 URL 指向的文件，然后当作 file 任务执行
（`download + execute`）。

**请求**

- 方法：`POST`
- 路径：`/apiv2/tasks/create/dlnexec/`
- 门控：`[dlnexeccreate]`（默认 `no`）

| 位置 | 参数       | 类型   | 必填 | 说明                                 |
| ---- | ---------- | ------ | ---- | ------------------------------------ |
| Body | `dlnexec`  | string | 是   | host 端要 GET 的 URL                  |
| Body | 共享 18 项 | —      | —    | 见 [附录 A](#附录-a样本提交共享参数) |

**响应**：同 [#2](#2-提交本地文件)。

**示例**

```bash
curl -d "dlnexec=https://server/sample.exe" \
     -d "package=exe" -d "timeout=120" \
     -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/create/dlnexec/"
```

---

### 5. 仅静态分析

**用途**：上传文件，只跑静态提取链路（PE 结构、yara、CAPE config 等），
不分配 VM。返回 task_id 后，仍走相同的状态轮询和报告拉取流程。

**请求**

- 方法：`POST`
- 路径：`/apiv2/tasks/create/static/`
- 门控：`[staticextraction]`（默认 `yes`）

| 位置 | 参数       | 类型 | 必填 | 说明                                  |
| ---- | ---------- | ---- | ---- | ------------------------------------- |
| Body | `file`     | file | 是   | 待分析文件                            |
| Body | 共享 18 项 | —    | —    | 见 [附录 A](#附录-a样本提交共享参数)；`priority` 等同样可用 |

**响应**：同 [#2](#2-提交本地文件)。

**示例**

```bash
curl -F "file=@./sample.exe" -F "priority=3" \
     -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/create/static/"
```

---

### 6. 从威胁情报源拉样本

**用途**：用 hash 让 host 从 VirusTotal / MalwareBazaar 等服务拉取样本，
然后排队分析。

**请求**

- 方法：`POST`
- 路径：`/apiv2/tasks/create/download_services/`
- 门控：`[downloading_services]`（默认 `no`）

| 位置 | 参数       | 类型   | 必填 | 说明                                                       |
| ---- | ---------- | ------ | ---- | ---------------------------------------------------------- |
| Body | `hashes`   | string | 是   | md5 / sha1 / sha256，可一次多个，空白分隔                  |
| Body | `options`  | string | 否   | 例：`apikey=<vt_api_key>`；其他逗号分隔的 CAPE 选项         |
| Body | `custom`   | string | 否   | 透传到任务的 `custom` 字段                                 |
| Body | `machine`  | string | 否   | 指定 VM label，`all` 提交到所有机器                         |

**响应**：同 [#2](#2-提交本地文件)。

**示例**

```bash
curl -d "hashes=44d88612fea8a8f36de82e1278abb02f" \
     -d "options=apikey=<VT_API_KEY>" \
     -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/create/download_services/"
```

---

## 任务状态、机器、系统

### 7. 查询任务状态

**用途**：轮询任务的当前生命周期状态，是 HTTP-only 工作流里使用频率最高的接口。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/status/<task_id>/`
- 门控：`[taskstatus]`（默认 `yes`）

| 位置 | 参数      | 类型 | 必填 | 说明     |
| ---- | --------- | ---- | ---- | -------- |
| Path | `task_id` | int  | 是   | 任务 ID  |

**响应**

```json
{ "error": false, "data": "reported" }
```

可能的状态值：`pending`、`running`、`completed`、`reported`、
`failed_analysis`、`failed_processing`、`failed_reporting`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/status/<TASK_ID>/"
```

---

### 8. 提前结束运行中的任务

**用途**：通知正在跑的 guest 提前完成（host 会在 VM 内创建一个标志目录，
analyzer.py 检测到后会主动收尾）。

**请求**

- 方法：`POST`
- 路径：`/apiv2/tasks/status/<task_id>/`
- 门控：`[user_stop]`（默认 `no`）

| 位置 | 参数      | 类型   | 必填 | 说明              |
| ---- | --------- | ------ | ---- | ----------------- |
| Path | `task_id` | int    | 是   | 任务 ID           |
| Body | `status`  | string | 是   | 必须为 `finish`   |

**响应**

```json
{ "error": false, "data": "OK" }
```

**示例**

```bash
curl -X POST -d "status=finish" \
     -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/status/<TASK_ID>/"
```

---

### 9. 查看任务详情

**用途**：拉取任务的完整元数据（含 sample、machine、errors）。常用于失败诊断。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/view/<task_id>/`
- 门控：`[taskview]`（默认 `yes`）

| 位置 | 参数      | 类型 | 必填 | 说明     |
| ---- | --------- | ---- | ---- | -------- |
| Path | `task_id` | int  | 是   | 任务 ID  |

**响应（节选）**

```json
{
  "error": false,
  "data": {
    "id": 123,
    "status": "reported",
    "category": "file",
    "package": "exe",
    "timeout": 120,
    "machine": "win10",
    "added_on": "2026-04-28T10:00:00",
    "started_on": "2026-04-28T10:00:05",
    "completed_on": "2026-04-28T10:02:11",
    "sample": { "md5": "...", "sha256": "...", "file_size": 12345 },
    "guest": { "name": "win10", "label": "win10", "ip": "10.0.0.5" },
    "errors": []
  }
}
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/view/<TASK_ID>/"
```

---

### 10. 沙箱整体状态

**用途**：拿到沙箱节点本身的运行状况（任务队列、CPU/磁盘、版本）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/cuckoo/status/`
- 门控：`[cuckoostatus]`（默认 `no`）

**响应（节选）**

```json
{
  "error": false,
  "data": {
    "version": "2.x",
    "tasks": { "total": 1234, "pending": 2, "running": 1, "completed": 100, "reported": 1131 },
    "diskspace": { "analyses": { "free": 123456789, "total": 987654321, "used": 864197532 } },
    "cpuload": [0.5, 0.3, 0.2]
  }
}
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/cuckoo/status/"
```

---

### 11. 列出所有机器

**用途**：列出 CAPE 当前注册的全部 VM（含 label、平台、状态、tags）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/machines/list/`
- 门控：`[machinelist]`（默认 `no`）

**响应**

```json
{
  "error": false,
  "data": [
    { "name": "win10", "label": "win10", "platform": "windows", "ip": "10.0.0.5", "tags": "x64,win10" },
    { "name": "ubuntu22", "label": "ubuntu22", "platform": "linux", "ip": "10.0.0.6", "tags": "x64,linux" }
  ]
}
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/machines/list/"
```

---

### 12. 查看单台机器

**用途**：按 label 查询某台 VM 的详情。

**请求**

- 方法：`GET`
- 路径：`/apiv2/machines/view/<name>/`
- 门控：`[machineview]`（默认 `no`）

| 位置 | 参数   | 类型   | 必填 | 说明        |
| ---- | ------ | ------ | ---- | ----------- |
| Path | `name` | string | 是   | VM 的 label |

**响应**

```json
{
  "error": false,
  "data": { "name": "win10", "label": "win10", "platform": "windows", "ip": "10.0.0.5",
            "status": "running", "locked": true, "tags": "x64,win10" }
}
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/machines/view/win10/"
```

---

### 13. 列出出口节点

**用途**：列出可用作提交参数 `route` 值的 VPN / SOCKS5 节点名。

**请求**

- 方法：`GET`
- 路径：`/apiv2/exitnodes/`
- 门控：`[list_exitnodes]`（默认 `no`）

**响应**

```json
{ "error": false, "data": ["us-east-vpn", "tor", "inetsim", "socks5-jp"] }
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/exitnodes/"
```

---

## 列表与搜索

### 14. 列出任务

**用途**：按时间倒序列出任务。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/list/[<limit>/[<offset>/[<window>/]]]`
- 门控：`[tasklist]`（默认 `yes`）

| 位置  | 参数              | 类型   | 必填 | 默认                          | 说明                                         |
| ----- | ----------------- | ------ | ---- | ----------------------------- | -------------------------------------------- |
| Path  | `limit`           | int    | 否   | `[tasklist] defaultlimit`     | 单次返回条数，超过 `maxlimit` 会被截断        |
| Path  | `offset`          | int    | 否   | 0                             | 跳过的条数（分页）                            |
| Path  | `window`          | int    | 否   | —                             | 时间窗（**分钟**），仅返回该窗口内 completed 任务 |
| Query | `completed_after` | int    | 否   | —                             | UNIX 时间戳，仅返回该时间之后 completed       |
| Query | `status`          | string | 否   | —                             | 按状态过滤                                    |
| Query | `option`          | string | 否   | —                             | 按 `options` 字段子串过滤                     |
| Query | `category`        | string | 否   | —                             | 按 `category` 过滤（file/url/...）            |
| Query | `ids`             | int    | 否   | —                             | 仅返回 `[{"id": ...}]`（dist 控制器使用）      |

**响应（节选）**

```json
{
  "error": false,
  "data": [
    { "id": 123, "status": "reported", "target": "sample.exe",
      "category": "file", "added_on": "...", "completed_on": "...",
      "sample": { "sha256": "..." }, "guest": { "name": "win10" }, "errors": [] }
  ],
  "config": "Limit: 50, Offset: 0",
  "buf": 1
}
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/list/100/0/?status=reported&category=file"
```

---

### 15. 最近 N 小时任务

**用途**：列出最近 N 小时新增的任务（精简版）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/latests/<hours>/`
- 门控：`[tasks_latest]`（默认 `no`）

| 位置 | 参数    | 类型 | 必填 | 说明     |
| ---- | ------- | ---- | ---- | -------- |
| Path | `hours` | int  | 是   | 小时数   |

**响应**

```json
{ "error": false, "data": [ { "id": 124, "added_on": "...", "category": "file" } ] }
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/latests/1/"
```

---

### 16. 按小时分桶统计

**用途**：返回按小时聚合的任务量趋势。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/stats/`
- 门控：`[task_x_hours]`（默认 `no`）

**响应**

```json
{ "error": false, "data": [ {"hour": "2026-04-28T10:00", "count": 12}, {"hour": "...", "count": 8} ] }
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/stats/"
```

---

### 17. 按天分桶统计

**用途**：按天聚合的任务量统计。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/statistics/<days>/`
- 门控：`[statistics]`（默认 `no`）

| 位置 | 参数   | 类型 | 必填 | 说明     |
| ---- | ------ | ---- | ---- | -------- |
| Path | `days` | int  | 是   | 天数窗口 |

**响应**

```json
{ "Error": false, "data": { "2026-04-27": 234, "2026-04-28": 312 } }
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/statistics/7/"
```

---

### 18. 按 hash 搜索任务

**用途**：用样本 hash 反查它产出过的所有任务。

**请求**

- 方法：`GET`
- 路径之一：
  - `/apiv2/tasks/search/md5/<md5>/`
  - `/apiv2/tasks/search/sha1/<sha1>/`
  - `/apiv2/tasks/search/sha256/<sha256>/`
- 门控：`[tasksearch]`（默认 `yes`，并按 hash 类型分别有 `md5/sha1/sha256` 子开关）

| 位置 | 参数            | 类型   | 必填 | 说明                            |
| ---- | --------------- | ------ | ---- | ------------------------------- |
| Path | `md5`/`sha1`/`sha256` | hex string | 是 | 32/40/64 位 hex                  |

**响应**

```json
{
  "error": false,
  "data": [
    { "id": 123, "status": "reported", "target": "sample.exe", "added_on": "..." }
  ]
}
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/search/sha256/<SHA256>/"
```

---

### 19. 扩展搜索

**用途**：基于 MongoDB 索引按字段搜索（family、IP、domain、yara 名等几十种）。

**请求**

- 方法：`POST`
- 路径：`/apiv2/tasks/extendedsearch/`
- 门控：`[extendedtasksearch]`（默认 `yes`）

| 位置 | 参数           | 类型    | 必填 | 默认 | 说明                                                              |
| ---- | -------------- | ------- | ---- | ---- | ----------------------------------------------------------------- |
| Body | `option`       | string  | 是   | —    | 搜索字段名，见 [附录 B](#附录-b扩展搜索字段一览)                   |
| Body | `argument`     | string  | 是   | —    | 字段值；当 `option=ids` 时支持 `1,2,3` 列表                        |
| Body | `search_limit` | int     | 否   | 50   | 限制返回条数                                                      |
| Body | `lean`         | bool    | 否   | false | 仅返回 lean projection（更小） |

**响应（节选）**

```json
{
  "error": false,
  "data": [
    { "info": { "id": 123 }, "detections": { "family": "Emotet" }, "malscore": 7.5 }
  ]
}
```

**示例**

```bash
curl -d "option=detections&argument=Emotet&search_limit=20" \
     -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/extendedsearch/"
```

---

### 20. 查看样本元数据

**用途**：按 hash 或 sample id 拉取样本（不是任务）的元数据。

**请求**

- 方法：`GET`
- 路径之一：
  - `/apiv2/files/view/md5/<md5>/`
  - `/apiv2/files/view/sha1/<sha1>/`
  - `/apiv2/files/view/sha256/<sha256>/`
  - `/apiv2/files/view/id/<sample_id>/`
- 门控：`[fileview]`（默认 `yes`，并按子键分别开关）

**响应**

```json
{
  "error": false,
  "data": {
    "id": 88, "md5": "...", "sha1": "...", "sha256": "...",
    "file_size": 12345, "file_type": "PE32 executable"
  }
}
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/files/view/sha256/<SHA256>/"
```

---

## 报告与制品

### 21. 拉取分析报告

**用途**：拿到一份完整的分析报告（JSON 默认）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/report/<task_id>/[<format>/[<make_zip>/]]`
- 门控：`[taskreport]`（默认 `yes`）

| 位置 | 参数         | 类型   | 必填 | 默认  | 说明                                                                                |
| ---- | ------------ | ------ | ---- | ----- | ----------------------------------------------------------------------------------- |
| Path | `task_id`    | int    | 是   | —     | 任务 ID                                                                             |
| Path | `format`     | string | 否   | json  | `json`、`html`、`all`、`dropped`、`dist`、`lite` 等                                  |
| Path | `make_zip`   | string | 否   | —     | 任意 3 字符（如 `zip`）就会把多文件打包成 zip                                        |

**响应**

- `json` / `lite` / `dist`：`application/json`，直接是报告对象
- `html`：HTML 文本
- `all` / `dropped` 或 `make_zip` 模式：`application/zip` 流

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/report/<TASK_ID>/json/" -o report.json
```

---

### 22. 拉取 IOC

**用途**：从报告里提炼出网络/文件/注册表 IOC 列表。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/iocs/<task_id>/[detailed/]`
- 门控：`[taskiocs]`（默认 `yes`）

| 位置 | 参数        | 类型   | 必填 | 说明                                  |
| ---- | ----------- | ------ | ---- | ------------------------------------- |
| Path | `task_id`   | int    | 是   | 任务 ID                               |
| Path | `detail`    | string | 否   | 字面值 `detailed`，返回完整版本        |

**响应（精简）**

```json
{
  "error": false,
  "data": {
    "info": { "id": 123 },
    "signatures": [{ "name": "creates_exe", "severity": 2 }],
    "network": { "domains": ["bad.example"], "hosts": ["1.2.3.4"] },
    "malscore": 7.5
  }
}
```

**示例**

```bash
# 简版
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/iocs/<TASK_ID>/"

# 详细版
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/iocs/<TASK_ID>/detailed/"
```

---

### 23. 拉取 CAPE 配置

**用途**：拿到 CAPE 自动提取出的恶意家族 config（C2、密钥、版本号等）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/config/<task_id>/[<cape_name>/]`
- 门控：`[capeconfig]`（默认 `yes`）

| 位置 | 参数        | 类型   | 必填 | 说明                                  |
| ---- | ----------- | ------ | ---- | ------------------------------------- |
| Path | `task_id`   | int    | 是   | 任务 ID                               |
| Path | `cape_name` | string | 否   | 家族名（如 `Emotet`），筛选返回        |

**响应**

```json
{
  "error": false,
  "configs": {
    "Emotet": [
      { "C2": ["http://1.2.3.4/"], "RSAKey": "..." }
    ]
  }
}
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/config/<TASK_ID>/"
```

---

### 24. 拉取截图

**用途**：拿桌面截图（VM 内 auxiliary 抓的）。可一次取全部或单张。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/screenshot/<task_id>/[<n>/]`
- 门控：`[taskscreenshot]`（默认 `yes`）

| 位置 | 参数         | 类型   | 必填 | 默认 | 说明                          |
| ---- | ------------ | ------ | ---- | ---- | ----------------------------- |
| Path | `task_id`    | int    | 是   | —    | 任务 ID                       |
| Path | `screenshot` | string | 否   | all  | `all` 返回 zip；数字 1-9999 返回单张 PNG/JPG |

**响应**

- `all`：`application/zip`，文件名 `<task_id>_screenshots.zip`
- 数字：`image/png` 或 `image/jpeg`

**示例**

```bash
# 全部
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/screenshot/<TASK_ID>/" -o shots.zip

# 第 5 张
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/screenshot/<TASK_ID>/5/" -o shot5.png
```

---

### 25. 拉取原始 PCAP

**用途**：拉 auxiliary `sniffer` 抓的 `dump.pcap`。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/pcap/<task_id>/`
- 门控：`[taskpcap]`（默认 `yes`）

**响应**：`application/vnd.tcpdump.pcap` 流，文件名 `<task_id>_dump.pcap`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/pcap/<TASK_ID>/" -o dump.pcap
```

---

### 26. 拉取 TLS 解密 PCAP

**用途**：拉用 SSLKEYLOGFILE 解密过的 pcap（需要部署侧启用对应 processing）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/tlspcap/<task_id>/`
- 门控：`[tasktlspcap]`（默认 `yes`）

**响应**：`application/vnd.tcpdump.pcap` 流。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/tlspcap/<TASK_ID>/" -o tls_dump.pcap
```

---

### 27. 拉取 EVTX 日志

**用途**：拉 Windows 任务采集的 EVTX 事件日志包。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/evtx/<task_id>/`
- 门控：`[taskevtx]`（默认 `yes`）

**响应**：`application/zip` 流（多份 evtx 打包）。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/evtx/<TASK_ID>/" -o evtx.zip
```

---

### 28. 拉取 mitmproxy 抓包

**用途**：拉 mitmdump 抓的 HTTP/HTTPS 会话（需要在 routing 中启用 mitm）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/mitmdump/<task_id>/`
- 门控：`[mitmdump]`（默认 `no`，注意门控名与路径不同）

**响应**：`application/octet-stream` 流。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/mitmdump/<TASK_ID>/" -o mitm.dump
```

---

### 29. 拉取释放文件

**用途**：拉样本在 VM 内释放/落盘的所有文件。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/dropped/<task_id>/`
- 门控：`[taskdropped]`（默认 `yes`）

| 位置  | 参数       | 类型 | 必填 | 说明                                     |
| ----- | ---------- | ---- | ---- | ---------------------------------------- |
| Query | `max_size` | int  | 否   | 单文件最大字节数，超过的会被跳过          |

**响应**：`application/zip`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/dropped/<TASK_ID>/?max_size=10485760" \
     -o dropped.zip
```

---

### 30. 拉取自解压产物

**用途**：拉自解压（packer/installer）抽取出的内层文件，可按工具来源筛选。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/selfextracted/<task_id>/[<tool>/]`
- 门控：`[taskselfextracted]`（默认 `no`）

| 位置 | 参数     | 类型   | 必填 | 说明                            |
| ---- | -------- | ------ | ---- | ------------------------------- |
| Path | `tool`   | string | 否   | 默认 `all`；可填工具名做过滤    |

**响应**：`application/zip`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/selfextracted/<TASK_ID>/" -o selfx.zip
```

---

### 31. 拉取 Suricata 抽取文件

**用途**：拉 Suricata file extraction 抽出来的文件。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/surifile/<task_id>/`
- 门控：`[taskdropped]`（默认 `yes`，与 dropped 共用门控）

**响应**：`application/zip`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/surifile/<TASK_ID>/" -o surifiles.zip
```

---

### 32. 拉取 CAPE Payload

**用途**：拉 CAPE 自动 unpack 出来的 payload 文件（核心产物之一）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/payloadfiles/<task_id>/`
- 门控：`[payloadfiles]`（默认 `yes`）

**响应**：`application/zip`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/payloadfiles/<TASK_ID>/" -o payloads.zip
```

---

### 33. 拉取进程 dump 文件

**用途**：拉每个进程的 dump 文件（按 PID 切分）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/procdumpfiles/<task_id>/`
- 门控：`[procdumpfiles]`（默认 `no`）

**响应**：`application/zip`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/procdumpfiles/<TASK_ID>/" -o procdumps.zip
```

---

### 34. 拉取进程内存

**用途**：拉进程内存 dump，可按 PID 取单个或全部。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/procmemory/<task_id>/[<pid>/]`
- 门控：`[taskprocmemory]`（默认 `yes`）

| 位置 | 参数   | 类型 | 必填 | 默认 | 说明                                |
| ---- | ------ | ---- | ---- | ---- | ----------------------------------- |
| Path | `pid`  | int  | 否   | all  | 单个 PID；不传或 `all` 返回 zip      |

**响应**：单 PID 时返回 `application/octet-stream`；否则 `application/zip`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/procmemory/<TASK_ID>/4321/" -o pid4321.dmp
```

---

### 35. 拉取整机内存

**用途**：拉整机内存快照（如有）。文件极大，请预估磁盘。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/get/fullmemory/<task_id>/`
- 门控：`[taskfullmemory]`（默认 `no`）

**响应**：`application/octet-stream`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/fullmemory/<TASK_ID>/" -o full.raw
```

---

### 36. 在线流式取文件

**用途**：在 guest 仍在运行时（status = `running`），从 VM 内或 host 存储里
流式读取一份文件（边写边读）。

**请求**

- 方法：`POST`
- 路径：`/apiv2/tasks/get/stream/<task_id>/`
- 门控：`[taskstatus]`（默认 `yes`）

| 位置 | 参数        | 类型   | 必填 | 说明                                                                                                   |
| ---- | ----------- | ------ | ---- | ------------------------------------------------------------------------------------------------------ |
| Path | `task_id`   | int    | 是   | 任务 ID（机器必须处于 `running`）                                                                        |
| Body | `filepath`  | string | 是   | 文件路径。`is_local=1` 时为相对 `storage/analyses/<id>/` 的相对路径；否则为 VM 内绝对路径               |
| Body | `is_local`  | string | 否   | 非空表示从 host 端 storage 取（避免穿越攻击：禁止以 `/` 开头）                                          |

**响应**：`application/octet-stream` 流。

**示例**

```bash
# 从 VM 内拉一个还在写的日志
curl -X POST \
     -d "filepath=C:\\Users\\user\\AppData\\Local\\Temp\\log.txt" \
     -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/get/stream/<TASK_ID>/" -o vm_log.txt
```

---

### 37. 下载原始样本

**用途**：按 hash 或 task id 下载原始样本（host 上 `storage/binaries/`）。

**请求**

- 方法：`GET`
- 路径之一：
  - `/apiv2/files/get/md5/<md5>/`
  - `/apiv2/files/get/sha1/<sha1>/`
  - `/apiv2/files/get/sha256/<sha256>/`
  - `/apiv2/files/get/task/<task_id>/`
- 门控：`[sampledl]`（默认 `no`）

| 位置  | 参数        | 类型   | 必填 | 说明                                  |
| ----- | ----------- | ------ | ---- | ------------------------------------- |
| Query | `encrypted` | int    | 否   | 任意非空值表示返回带密码的加密 zip      |

**响应**：`application/octet-stream` 或加密 `application/zip`。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/files/get/sha256/<SHA256>/?encrypted=1" \
     -o sample.zip
```

---

## 任务管理

### 38. 重新排队

**用途**：把已完成或失败的任务再排进队列（不复制样本）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/reschedule/<task_id>/`
- 门控：`[taskresched]`（默认 `no`）

**响应**

```json
{ "error": false, "data": "Task ID 123 has been rescheduled to ID 456" }
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/reschedule/<TASK_ID>/"
```

---

### 39. 重跑后处理

**用途**：基于已存在的原始结果，仅重跑 processing / signatures / reporting
链路（不再开 VM）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/reprocess/<task_id>/`
- 门控：`[taskreprocess]`（默认 `no`）

**响应**

```json
{ "error": false, "data": "Task ID 123 has been reprocessed" }
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/reprocess/<TASK_ID>/"
```

---

### 40. 删除任务

**用途**：删除一个或一组任务（含 storage 与可选的 mongo 文档）。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/delete/<task_id>/[<status>/]`
- 门控：`[taskdelete]`（默认 `no`，**或** 当前用户是 staff）

| 位置 | 参数      | 类型   | 必填 | 说明                                                          |
| ---- | --------- | ------ | ---- | ------------------------------------------------------------- |
| Path | `task_id` | string | 是   | 单个 ID `123`，逗号 `1,2,3`，或区间 `1-5`                      |
| Path | `status`  | string | 否   | 仅删指定状态的任务（`pending`/`reported`/...）                 |

**响应**

```json
{ "error": false, "data": "Task(s) deleted" }
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/delete/100-110/reported/"
```

---

### 41. 批量删除任务

**用途**：通过 POST body 提交一批 task id 做删除。

**请求**

- 方法：`POST`
- 路径：`/apiv2/tasks/delete_many/`
- 门控：`[taskdelete]`（默认 `no`）

| 位置 | 参数            | 类型   | 必填 | 默认 | 说明                                |
| ---- | --------------- | ------ | ---- | ---- | ----------------------------------- |
| Body | `ids`           | string | 是   | —    | 逗号分隔的 task id 列表             |
| Body | `delete_mongo`  | bool   | 否   | true | 是否同时删除 MongoDB 中的报告文档    |

**响应**

```json
{ "error": false, "data": "Deleted: [100, 101, 102]" }
```

**示例**

```bash
curl -X POST -d "ids=100,101,102" -d "delete_mongo=true" \
     -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/delete_many/"
```

---

## Suricata 滚动

### 42. 滚动 Suricata 告警

**用途**：把最近一段时间内若干任务的 Suricata 告警合并展示。

**请求**

- 方法：`GET`
- 路径：`/apiv2/tasks/rollingsuri/[<window>/]`
- 门控：`[rollingsuri]`（默认 `no`）

| 位置 | 参数     | 类型 | 必填 | 默认 | 说明                              |
| ---- | -------- | ---- | ---- | ---- | --------------------------------- |
| Path | `window` | int  | 否   | 60   | 时间窗（**分钟**），上限 `maxwindow` |

**响应**

```json
{
  "error": false,
  "data": [
    { "task_id": 123, "sid": 2024010, "signature": "ET MALWARE Emotet" }
  ]
}
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/tasks/rollingsuri/30/"
```

---

## 分布式

> 这两个端点供 `utils/dist.py` 分布式 controller 使用，标准单机部署的
> `web/apiv2/urls.py` 中**未注册**。仅当你启用了 dist 才能访问。

### 43. 已 reported 任务列表

**用途**：分布式 master 用来拉取本节点已经走完整链路的任务清单。

**请求**

- 方法：`GET`
- 路径：`/apiv2/dist/tasks_reported`
- 门控：需 `DIST_ENABLED=True`

**响应**

```json
{ "error": false, "data": [123, 124, 125] }
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/dist/tasks_reported"
```

---

### 44. 任务通知回调

**用途**：分布式 master 把"某个任务已合并完成"的消息回写到 worker 节点。

**请求**

- 方法：`GET`
- 路径：`/apiv2/dist/tasks_notification/<task_id>`

| 位置 | 参数      | 类型 | 必填 | 说明     |
| ---- | --------- | ---- | ---- | -------- |
| Path | `task_id` | int  | 是   | 任务 ID  |

**响应**

```json
{ "error": false, "data": "OK" }
```

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" \
     "https://<HOST>/apiv2/dist/tasks_notification/<TASK_ID>"
```

---

## 自查

### 45. 端点总览页

**用途**：人类可读的 HTML 页面，列出当前部署上每个端点的 enabled / RPS / RPM。
适合排查 "为什么这个接口被 disable 了"。

**请求**

- 方法：`GET`
- 路径：`/apiv2/`
- 门控：无（永远启用）

**响应**：HTML（`web/templates/apiv2/index.html`）。

**示例**

```bash
curl -H "Authorization: Token <TOKEN>" "https://<HOST>/apiv2/" -o apiv2.html
open apiv2.html
```

---

## 附录 A：样本提交共享参数

由 `lib/cuckoo/common/web_utils.py:parse_request_arguments()` 统一解析，
所有 `/apiv2/tasks/create/*` 端点都支持。

| 参数              | 类型     | 默认       | 说明                                                                                  |
| ----------------- | -------- | ---------- | ------------------------------------------------------------------------------------- |
| `package`         | string   | `""`       | 分析包名（`exe`、`dll`、`doc`、`pdf`、`js`、`ie`、`zip`、`html` ...，详见 `analyzer/<os>/modules/packages/`） |
| `timeout`         | int      | 配置默认值 | 分析超时（秒）                                                                        |
| `priority`        | int      | 1          | 任务优先级，数字越大越先调度                                                          |
| `options`         | string   | `""`       | 逗号分隔的 CAPE 运行参数（如 `procdump=1,human=1,unpacker=2,bp0=ep`）                  |
| `machine`         | string   | `""`       | 指定 VM label；`all` 表示提交到所有机器（受 `[filecreate] allmachines` 控制）          |
| `platform`        | string   | `""`       | `windows` / `linux` 等                                                                |
| `tags`            | string   | `""`       | 样本标签，逗号分隔（用于匹配 VM tags 选机器）                                          |
| `tags_tasks`      | string   | `""`       | 任务级标签（不参与机器匹配，只用于检索）                                              |
| `custom`          | string   | `""`       | 任意自定义字符串，原样存入任务记录                                                    |
| `memory`          | bool     | `false`    | 是否在分析结束时做整机内存 dump                                                       |
| `clock`           | string   | 当前时间   | 设置 VM 内时钟（`MM-DD-YYYY HH:MM:SS`）                                                |
| `enforce_timeout` | bool     | `false`    | 强制等到 timeout 才结束（即使样本提前退出）                                            |
| `unique`          | bool     | `false`    | 唯一性检查：相同样本已有任务时拒绝再提交                                              |
| `referrer`        | URL      | `""`       | URL 任务的 Referer，会被合并进 `options`                                              |
| `tlp`             | string   | `""`       | TLP 标记（`white`/`green`/`amber`/`red`），影响下载权限                                |
| `route`           | string   | 配置默认值 | 网络路由：`none`、`internet`、`inetsim`、`tor`、`vpn:<name>`、`socks5:<name>`         |
| `cape`            | string   | `""`       | 仅做 CAPE 配置提取的开关                                                              |
| `static`          | bool/int | `0`        | 仅静态分析（与端点 #5 同义）                                                          |

---

## 附录 B：扩展搜索字段一览

`POST /apiv2/tasks/extendedsearch/` 的 `option` 字段可取以下值（节选自
`lib/cuckoo/common/web_utils.py:search_term_map`）：

| option              | 对应文档字段                                  | 用途           |
| ------------------- | --------------------------------------------- | -------------- |
| `id` / `ids`        | `info.id`                                     | 任务 ID        |
| `tags_tasks`        | `info.id`（间接）                              | 任务级 tags    |
| `package`           | `info.package`                                | 分析包         |
| `name`              | `target.file.name`                            | 文件名         |
| `type`              | `target.file.type`                            | 文件类型       |
| `md5` / `sha1` / `sha256` / `sha3` / `sha512` | 各级哈希字段             | 哈希精确匹配   |
| `target_sha256`     | `target.file.<ref>`                           | 原始样本 sha256 |
| `ssdeep` / `imphash` / `crc32` / `die` / `trid` | 同名字段                       | 模糊指纹       |
| `clamav`            | `clamav`                                      | ClamAV 检测     |
| `yaraname` / `capeyara` / `capetype`          | yara 规则名                    | YARA 命中       |
| `procmemyara` / `procdumpyara`                | yara on memory                | 内存 yara       |
| `command`           | `behavior.summary.executed_commands`          | 命令行         |
| `mutex` / `key` / `file` / `resolvedapi`      | `behavior.summary.*`           | 行为摘要       |
| `domain` / `ip` / `asn` / `asn_name`          | `network.*`                    | 网络 IOC        |
| `dport` / `sport` / `port`                    | `network.tcp/udp/smtp_ex`     | 端口            |
| `signature` / `signame`                       | `signatures.*`                 | 签名命中        |
| `detections`        | `detections.family`                            | 家族检测        |
| `url`               | `target.url`                                  | URL 任务        |
| `iconhash` / `iconfuzzy` / `dhash`            | `static.pe.*`                  | 图标指纹        |
| `suri*`（多种）      | `suricata.*`                                  | Suricata 字段    |
| `ja3_hash` / `ja3_string`                     | `suricata.tls.ja3.*`           | JA3 指纹         |
| `virustotal`        | `virustotal.results.sig`                       | VT 命中          |
| `machinename` / `machinelabel`                | `info.machine.*`               | 机器名/标签      |
| `comment` / `custom`                          | `info.*`                       | 评论 / custom    |
| `tlp`               | `info.tlp`                                    | TLP             |
| `configs`           | `CAPE.configs`                                | CAPE 提取配置    |
| `extracted_tool`    | 多个 selfextract 字段                          | 抽取工具来源     |
| `malscore`          | `malscore`                                    | 综合评分（数值） |
| `ttp`               | `ttps.ttp`                                    | MITRE TTP        |

> 完整列表以源码 `lib/cuckoo/common/web_utils.py` 中
> `search_term_map` / `search_term_map_repetetive_blocks` 为准。
