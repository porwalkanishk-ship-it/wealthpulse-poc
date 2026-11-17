import { useAppState } from "@/lib/app-state";
import { AssetModal } from "./AssetModal";
import { CasModal } from "./CasModal";
import { EquityModal } from "./EquityModal";
import { EquityImportModal } from "./EquityImportModal";
import { LoanModal } from "./LoanModal";
import { PolicyModal } from "./PolicyModal";
import { PrepayModal } from "./PrepayModal";
import { RsuModal } from "./RsuModal";
import { SipModal } from "./SipModal";

export function Modals({ onSynced }: { onSynced: () => void }) {
  const { modal, close } = useAppState();
  if (!modal) return null;
  switch (modal.type) {
    case "cas":
      return <CasModal onClose={close} onImported={onSynced} />;
    case "equity":
      return <EquityModal key={modal.positionId ?? "new"} positionId={modal.positionId} onClose={close} onSaved={onSynced} />;
    case "rsu":
      return <RsuModal key={modal.grantId ?? "new"} grantId={modal.grantId} vestId={modal.vestId} onClose={close} onSaved={onSynced} />;
    case "equity-import":
      return <EquityImportModal onClose={close} onSaved={onSynced} />;
    case "asset":
      return <AssetModal key={modal.holdingId ?? modal.category ?? "new"} holdingId={modal.holdingId} category={modal.category} onClose={close} onSaved={onSynced} />;
    case "sip":
      return <SipModal key={modal.holdingId} holdingId={modal.holdingId} onClose={close} onSaved={onSynced} />;
    case "loan":
      return <LoanModal key={modal.loanId ?? modal.kind ?? "new"} loanId={modal.loanId} kind={modal.kind} onClose={close} />;
    case "prepay":
      return <PrepayModal key={modal.loanId} loanId={modal.loanId} onClose={close} />;
    case "policy":
      return <PolicyModal key={modal.policyId ?? "new"} policyId={modal.policyId} kind={modal.kind} onClose={close} />;
    default:
      return null;
  }
}
