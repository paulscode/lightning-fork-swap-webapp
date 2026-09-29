import { type Accessor, Show } from "solid-js";

import {
    type SomeSwap,
    getRelevantAssetForSwap,
    getSwapAddress,
} from "../utils/swapCreator";
import BlockExplorer, { BlockExplorerTargetKind } from "./BlockExplorer";

const BlockExplorerLinkInner = (props: {
    swap: Accessor<SomeSwap>;
    swapStatus: Accessor<string>;
}) => (
    // Refund transactions are handled in SwapRefunded
    <Show
        when={
            props.swapStatus() !== null &&
            props.swapStatus() !== "invoice.set" &&
            props.swapStatus() !== "swap.created"
        }>
        <BlockExplorer
            asset={getRelevantAssetForSwap(props.swap())}
            kind={
                props.swap().claimTx !== undefined
                    ? BlockExplorerTargetKind.Tx
                    : BlockExplorerTargetKind.Address
            }
            id={
                props.swap().claimTx !== undefined
                    ? props.swap().claimTx!
                    : getSwapAddress(props.swap())
            }
        />
    </Show>
);

const BlockExplorerLink = (props: {
    swap: Accessor<SomeSwap | null>;
    swapStatus: Accessor<string>;
}) => {
    return (
        <Show when={props.swap()}>
            {(swap) => (
                <BlockExplorerLinkInner
                    swap={swap}
                    swapStatus={props.swapStatus}
                />
            )}
        </Show>
    );
};

export default BlockExplorerLink;
