import type { SSEEvent, TaskStatus } from "@/types/api";

interface TaskStatusEvent {
  type: "task.status";
  task_id: number;
  status: TaskStatus;
  ts: string;
}

interface TaskAddedEvent {
  type: "task.added";
  task_id: number;
  status: TaskStatus;
  ts: string;
}

export type TaskEventHandler = (event: SSEEvent) => void;

export interface TaskEventStream {
  close: () => void;
  /** Last error fired by the underlying EventSource, if any. */
  readonly lastError: Event | null;
}

/**
 * Opens an EventSource against /api/v3/events/tasks.
 *
 * The browser's native EventSource cannot send custom headers; we rely
 * on the session cookie (D-12.1). The server emits NDJSON-style SSE
 * frames per PRD §5.5; this helper marshals them through the supplied
 * handler.
 */
export function openTaskEventStream(handler: TaskEventHandler): TaskEventStream {
  const es = new EventSource("/api/v3/events/tasks", { withCredentials: true });
  let lastError: Event | null = null;

  const wrap = <T extends SSEEvent>(name: T["type"]) => (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data) as Omit<T, "type">;
      handler({ ...(data as object), type: name } as SSEEvent);
    } catch {
      // ignore malformed frames
    }
  };

  es.addEventListener("task.status", wrap<TaskStatusEvent>("task.status"));
  es.addEventListener("task.added", wrap<TaskAddedEvent>("task.added"));
  es.addEventListener("heartbeat", () => {
    /* no-op — keeps the connection considered "active" by the browser */
  });
  es.onerror = (event) => {
    lastError = event;
  };

  return {
    close: () => es.close(),
    get lastError() {
      return lastError;
    },
  };
}
