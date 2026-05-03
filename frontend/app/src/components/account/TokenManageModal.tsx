import { TokenSection } from "@/components/users/TokenSection";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TokenManageModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width={560}>
        <DialogHeader>
          <DialogTitle>API token</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="dim" style={{ margin: 0, marginBottom: 4, fontSize: 11.5 }}>
            Use this key with <code className="mono">Authorization: Token &lt;key&gt;</code> header
            for programmatic access to <code className="mono">/apiv2/*</code> endpoints. See{" "}
            <a href="/docs">/docs</a>.
          </p>
          <TokenSection />
        </DialogBody>
        <DialogFooter>
          <button type="button" className="btn" onClick={() => onOpenChange(false)}>
            Close
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
