import { setBoltzSwapsConfig } from "boltz-swaps/config";

import { config } from "./config";
import { chooseUrl } from "./configs/base";
import { getReferral } from "./utils/helper";

export const configureBoltzSwaps = () => {
    setBoltzSwapsConfig({
        get assets() {
            return config.assets;
        },
        get boltzApiUrl() {
            return chooseUrl(config.apiUrl);
        },
        get referral() {
            return getReferral();
        },
        get network() {
            return config.network;
        },
        cooperativeDisabled: config.cooperativeDisabled === true,
    });
};
