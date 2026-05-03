import { useState } from "react";

import { Dialog, DialogClose, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { useToast } from "@/components/shared/Toast";

interface Props {
  username: string;
  tokenKey: string;
  /** Called when the user dismisses the dialog. Parent must drop the key. */
  onClose: () => void;
}

export function TokenRevealDialog({ username, tokenKey, onClose }: Props) {
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent width={520}>
        <DialogHeader>
          <strong>Token generated for {username}</strong>
        </DialogHeader>
        <div style={{ padding: 14, display: "grid", gap: 10, fontSize: 12 }}>
          <div className="dim">
            This is the only time the full key will be shown. Copy it now — it will be masked next
            time the page loads.
          </div>
          <code
            className="mono"
            style={{
              padding: "8px 10px",
              background: "var(--color-bg-2)",
              border: "1px solid var(--color-border)",
              borderRadius: 3,
              fontSize: 11,
              wordBreak: "break-all",
            }}
          >
            {tokenKey}
          </code>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(tokenKey);
                setCopied(true);
                showToast("Token copied to clipboard.", "success");
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <DialogClose asChild>
              <button type="button" className="btn primary">
                Close
              </button>
            </DialogClose>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
