import { chooseUrl, config } from "../config";

export const blockExplorerLink = (
    asset: string,
    isTxId: boolean,
    val: string,
): string | undefined => {
    const basePath = chooseUrl(config.assets?.[asset]?.blockExplorerUrl);
    if (basePath === undefined) {
        return undefined;
    }

    return `${basePath}/${isTxId ? "tx" : "address"}/${val}`;
};
