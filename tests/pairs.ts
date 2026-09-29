import type { Pairs } from "boltz-swaps/client";

export const pairs: Pairs = {
    submarine: {
        BTC: {
            BTC: {
                hash: "e31136f0bc5e7d0da49f352e4b1702865dd9aecb11d85a975c18fabaaf2bb09f",
                rate: 1,
                limits: {
                    maximal: 4294967,
                    minimal: 50000,
                    maximalZeroConf: 0,
                },
                fees: {
                    percentage: 0.1,
                    minerFees: 6800,
                },
            },
        },
    },
    reverse: {
        BTC: {
            BTC: {
                hash: "d56335bf280db60b12c188748f93e274718d1f42b06970eb8f01edb074713a82",
                rate: 1,
                limits: {
                    maximal: 4294967,
                    minimal: 50000,
                },
                fees: {
                    percentage: 0.5,
                    minerFees: {
                        claim: 5520,
                        lockup: 6120,
                    },
                },
            },
        },
    },
};
