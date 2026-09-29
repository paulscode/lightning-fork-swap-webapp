import type { Accessor } from "solid-js";

import { getAssetDisplaySymbol } from "../consts/Assets";
import type { Side } from "../consts/Enums";
import "../style/asset.scss";

// Only BTC and Lightning exist, so the asset is fixed by the swap direction
// and there is nothing to select
const Asset = (props: { side: Side; signal: Accessor<string> }) => (
    <div class="asset-wrap no-select">
        <div
            data-testid={`asset-${props.side}`}
            class={`asset asset-${getAssetDisplaySymbol(props.signal())}`}>
            <div class="asset-selection">
                <span class="icon" />
                <span class="asset-text" />
            </div>
        </div>
    </div>
);

export default Asset;
