import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { openTaskEventStream } from "@/lib/sse/tasks";
import { queryKeys } from "@/lib/query-keys";
import type { SSEEvent } from "@/types/api";

interface UseTaskEventsResult {
  /** True once the EventSource connection has reported at least one event
   *  or moved to the OPEN ready state. Useful for showing a "live" pill. */
  connected: boolean;
  /** Whatever was emitted last; mainly for diagnostics. */
  lastEvent: SSEEvent | null;
}

/**
 * Subscribes to /api/v3/events/tasks for the lifetime of the calling
 * component and invalidates the relevant TanStack Query caches.
 *
 * Mount once at the route level (e.g. <PendingRoute>, <RecentRoute>).
 * Multiple mounts are safe — each opens an independent EventSource —
 * but it's wasteful, so prefer one per page.
 */
export function useTaskEvents(): UseTaskEventsResult {
  const queryClient = useQueryClient();
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const stream = openTaskEventStream((event) => {
      setLastEvent(event);
      setConnected(true);

      switch (event.type) {
        case "task.status":
        case "task.added": {
          const id = "task_id" in event ? event.task_id : null;
          if (id !== null) {
            queryClient.invalidateQueries({ queryKey: queryKeys.tasks.detail(id) });
          }
          queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
          break;
        }
        case "task.deleted":
          queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
          break;
        case "machine.status":
          queryClient.invalidateQueries({ queryKey: queryKeys.machines.all });
          break;
        case "heartbeat":
        default:
          break;
      }
    });

    return () => stream.close();
  }, [queryClient]);

  return { connected, lastEvent };
}
