import { BiRegularCopy } from "solid-icons/bi";
import { IoCheckmark } from "solid-icons/io";
import { For, Show, createSignal } from "solid-js";

import { copyIconTimeout } from "../consts/CopyContent";
import { useGlobalContext } from "../context/Global";
import { connectableAddresses } from "../network/data";
import { nodeUri } from "../utils/donate";
import { clipboard } from "../utils/helper";

// A copy button that is an icon only, and a real button (keyboard, label)
export const CopyIcon = (props: { data: string; label: string }) => {
    const { t } = useGlobalContext();
    const [copied, setCopied] = createSignal(false);
    return (
        <button
            type="button"
            class="sky-copy"
            classList={{ copied: copied() }}
            aria-label={copied() ? t("network_copied") : props.label}
            title={props.label}
            onClick={() => {
                clipboard(props.data);
                setCopied(true);
                setTimeout(() => setCopied(false), copyIconTimeout);
            }}>
            <Show when={copied()} fallback={<BiRegularCopy size={16} />}>
                <IoCheckmark size={16} />
            </Show>
        </button>
    );
};

// A node's connection strings (key@host:port), one per announced address,
// each with a copy button: what a node's UI asks for to open a channel
const NodeUris = (props: { pubkey: string; addresses: unknown }) => {
    const { t } = useGlobalContext();
    const uris = () =>
        connectableAddresses(props.addresses).map((a) =>
            nodeUri(props.pubkey, a),
        );
    return (
        <div class="sky-uris" data-testid="sky-uris">
            <h3>{t("network_addresses")}</h3>
            <Show
                when={uris().length > 0}
                fallback={
                    <p class="sky-uris-none">{t("network_no_address")}</p>
                }>
                <ul>
                    <For each={uris()}>
                        {(uri) => (
                            <li>
                                <code>{uri}</code>
                                <CopyIcon
                                    data={uri}
                                    label={t("network_copy_uri")}
                                />
                            </li>
                        )}
                    </For>
                </ul>
            </Show>
        </div>
    );
};

export default NodeUris;
