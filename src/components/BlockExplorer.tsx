import { Show } from "solid-js";

import { useGlobalContext } from "../context/Global";
import { blockExplorerLink } from "../utils/explorerLink";
import ExternalLink from "./ExternalLink";

export const enum BlockExplorerTargetKind {
    Tx = "tx",
    Address = "address",
}

const BlockExplorer = (props: {
    asset: string;
    kind: BlockExplorerTargetKind;
    id: string;
    typeLabel?: "lockup_address" | "lockup_tx" | "claim_tx" | "refund_tx";
}) => {
    const { t } = useGlobalContext();

    const href = () =>
        blockExplorerLink(
            props.asset,
            props.kind === BlockExplorerTargetKind.Tx,
            props.id,
        );

    const typeLabel = () =>
        props.typeLabel ||
        (props.kind === BlockExplorerTargetKind.Tx
            ? "claim_tx"
            : "lockup_address");

    const label = () =>
        t("blockexplorer", {
            typeLabel: t(`blockexplorer_${typeLabel()}`),
        });

    return (
        <Show when={href()}>
            {(resolved) => (
                <ExternalLink class="btn btn-explorer" href={resolved()}>
                    {label()}
                </ExternalLink>
            )}
        </Show>
    );
};

export default BlockExplorer;
