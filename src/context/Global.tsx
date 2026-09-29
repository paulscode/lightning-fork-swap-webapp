/* @refresh skip */
import {
    type BaseTemplateArgs,
    flatten,
    resolveTemplate,
    translator,
} from "@solid-primitives/i18n";
import { makePersisted } from "@solid-primitives/storage";
import { type Pairs, getPairs } from "boltz-swaps/client";
import localforage from "localforage";
import log from "loglevel";
import {
    type Accessor,
    type JSX,
    type Setter,
    createContext,
    createEffect,
    createMemo,
    createSignal,
    useContext,
} from "solid-js";

import { config } from "../config";
import type { AssetType } from "../consts/Assets";
import { Denomination } from "../consts/Enums";
import { detectLanguage } from "../i18n/detect";
import dict, { type DictKey } from "../i18n/i18n";
import { type ECKeys, ECPair } from "../utils/ecpair";
import { formatError } from "../utils/errors";
import { isMobile } from "../utils/helper";
import { deleteOldLogs, injectLogWriter } from "../utils/logs";
import { migrateStorage } from "../utils/migration";
import { stringSerializer } from "../utils/persistence";
import {
    type RescueFile,
    deriveKey,
    generateRescueFile,
    getXpub,
} from "../utils/rescueFile";
import type { SomeSwap } from "../utils/swapCreator";
import { checkWasmSupported } from "../utils/wasmSupport";
import { detectWebLNProvider } from "../utils/webln";

type NotificationType = "success" | "error";
export type deriveKeyFn = (index: number, asset: AssetType) => ECKeys;
export type newKeyFn = (
    asset: AssetType,
) => Promise<{ index: number; key: ECKeys }>;
export type tFn = (key: DictKey, values?: Record<string, unknown>) => string;
export type notifyFn = (type: NotificationType, message: string) => void;

export type GlobalContextType = {
    online: Accessor<boolean>;
    setOnline: Setter<boolean>;
    pairs: Accessor<Pairs | undefined>;
    setPairs: Setter<Pairs | undefined>;
    wasmSupported: Accessor<boolean>;
    setWasmSupported: Setter<boolean>;
    refundAddress: Accessor<string | null>;
    setRefundAddress: Setter<string | null>;
    transactionToRefund: Accessor<string | null>;
    setTransactionToRefund: Setter<string | null>;
    i18n: Accessor<string | null>;
    setI18n: Setter<string | null>;
    notification: Accessor<string>;
    setNotification: Setter<string>;
    notificationType: Accessor<string>;
    setNotificationType: Setter<string>;
    webln: Accessor<boolean>;
    setWebln: Setter<boolean>;
    i18nConfigured: Accessor<string | null>;
    setI18nConfigured: Setter<string | null>;
    denomination: Accessor<Denomination>;
    setDenomination: Setter<Denomination>;
    hideHero: Accessor<boolean>;
    setHideHero: Setter<boolean>;
    separator: Accessor<string>;
    setSeparator: Setter<string>;
    settingsMenu: Accessor<boolean>;
    setSettingsMenu: Setter<boolean>;
    privacyMode: Accessor<boolean>;
    setPrivacyMode: Setter<boolean>;
    zeroConf: Accessor<boolean>;
    setZeroConf: Setter<boolean>;
    embeddedMode: Accessor<boolean>;
    setEmbeddedMode: Setter<boolean>;
    parentOrigin: Accessor<string | undefined>;
    setParentOrigin: Setter<string | undefined>;
    // functions
    t: tFn;
    notify: notifyFn;
    fetchPairs: () => Promise<void>;

    getLogs: () => Promise<Record<string, string[]>>;
    clearLogs: () => Promise<void>;

    setSwapStorage: (swap: SomeSwap) => Promise<void>;
    getSwap: <T = SomeSwap>(id: string) => Promise<T | null>;
    modifySwapStorage: <T extends SomeSwap = SomeSwap>(
        id: string,
        mutator: (swap: T) => void | Promise<void>,
    ) => Promise<T | null>;
    getSwaps: <T = SomeSwap>() => Promise<T[]>;
    deleteSwap: (id: string) => Promise<void>;
    clearSwaps: () => Promise<void>;
    updateSwapStatus: (id: string, newStatus: string) => Promise<boolean>;

    newKey: newKeyFn;
    deriveKey: deriveKeyFn;
    getXpub: () => string;
    setLastUsedKey: Setter<number>;
    rescueFile: Accessor<RescueFile | null>;
    setRescueFile: Setter<RescueFile | null>;
    rescueFileBackupDone: Accessor<boolean>;
    setRescueFileBackupDone: Setter<boolean>;
};

const GlobalContext = createContext<GlobalContextType>();

const GlobalProvider = (props: {
    children: JSX.Element;
    initialEmbeddedMode?: boolean;
    initialParentOrigin?: string;
}) => {
    const [online, setOnline] = createSignal<boolean>(true);
    const [pairs, setPairs] = createSignal<Pairs | undefined>(undefined);

    const [wasmSupported, setWasmSupported] = createSignal<boolean>(true);
    const [refundAddress, setRefundAddress] = createSignal<string | null>(null);

    const [transactionToRefund, setTransactionToRefund] = createSignal<
        string | null
    >(null);

    const [i18n, setI18n] = createSignal<string | null>(null);

    const [notification, setNotification] = createSignal<string>("");
    const [notificationType, setNotificationType] = createSignal<string>("");

    const [webln, setWebln] = createSignal<boolean>(false);

    const [hideHero, setHideHero] = createSignal<boolean>(false);

    const [i18nConfigured, setI18nConfigured] = makePersisted(
        // eslint-disable-next-line solid/reactivity
        createSignal<string | null>(null),
        {
            name: "i18n",
            ...stringSerializer,
        },
    );
    const [i18nUrl, setI18nUrl] = makePersisted(
        // eslint-disable-next-line solid/reactivity
        createSignal<string | null>(null),
        {
            name: "i18nUrl",
            ...stringSerializer,
        },
    );

    const [denomination, setDenomination] = makePersisted(
        // eslint-disable-next-line solid/reactivity
        createSignal<Denomination>(Denomination.Sat),
        {
            name: "denomination",
            ...stringSerializer,
        },
    );

    const [settingsMenu, setSettingsMenu] = createSignal<boolean>(false);

    const localeSeparator = (0.1).toLocaleString().charAt(1);
    const [separator, setSeparator] = makePersisted(
        // eslint-disable-next-line solid/reactivity
        createSignal(localeSeparator),
        {
            name: "separator",
        },
    );

    const [rescueFile, setRescueFile] = makePersisted(
        // eslint-disable-next-line solid/reactivity
        createSignal<RescueFile | null>(null),
        {
            name: "rescueFile",
        },
    );

    const [lastUsedKey, setLastUsedKey] = makePersisted(
        // eslint-disable-next-line solid/reactivity
        createSignal<number>(0),
        {
            name: "lastUsedKey",
        },
    );

    const [rescueFileBackupDone, setRescueFileBackupDone] = makePersisted(
        // eslint-disable-next-line solid/reactivity
        createSignal<boolean>(false),
        {
            name: "rescueFileBackupDone",
        },
    );

    createEffect(() => {
        if (rescueFile() === null) {
            log.debug("Generating rescue file");
            setRescueFile(generateRescueFile());
        }
    });

    const deriveKeyWrapper = (index: number, asset: AssetType) => {
        const rf = rescueFile();
        if (rf === null) {
            throw new Error("rescue file is not initialised");
        }
        const derived = deriveKey(rf, index, asset);
        if (derived.privateKey === null) {
            throw new Error("derived private key is null");
        }
        return ECPair.fromPrivateKey(new Uint8Array(derived.privateKey));
    };

    const newKey = (asset: AssetType) => {
        const index = lastUsedKey();
        setLastUsedKey(index + 1);
        return Promise.resolve({ index, key: deriveKeyWrapper(index, asset) });
    };

    const getXpubWrapper = () => {
        const rf = rescueFile();
        if (rf === null) {
            throw new Error("rescue file is not initialised");
        }
        return getXpub(rf);
    };

    const notify = (type: NotificationType, message: unknown) => {
        const messageStr = formatError(message);

        setNotificationType(type);
        setNotification(messageStr);
    };

    const fetchPairs = async () => {
        try {
            const data = await getPairs();

            log.debug("getpairs", data);
            setOnline(true);
            setPairs(data);
        } catch (error) {
            log.error("Error fetching pairs", error);
            setOnline(false);
            throw formatError(error);
        }
    };

    // Use IndexedDB if available; fallback to LocalStorage
    localforage.config({
        driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE],
    });

    const logsForage = localforage.createInstance({
        name: "logs",
    });

    injectLogWriter(logsForage);
    log.info(`Version ${__APP_VERSION__}, commit hash ${__GIT_COMMIT__}`);

    createEffect(() => deleteOldLogs(logsForage));

    const getLogs = async () => {
        const logs: Record<string, string[]> = {};

        await logsForage.iterate<string[], unknown>((logArray, date) => {
            logs[date] = logArray;
        });

        return logs;
    };

    const clearLogs = () => logsForage.clear();

    const paramsForage = localforage.createInstance({
        name: "params",
    });
    const swapsForage = localforage.createInstance({
        name: "swaps",
    });

    migrateStorage(paramsForage).catch((e) =>
        log.error("Storage migration failed:", e),
    );

    const setSwapStorage = async (swap: SomeSwap) => {
        await swapsForage.setItem(swap.id, swap);
    };

    const deleteSwap = async (id: string) => await swapsForage.removeItem(id);

    const getSwap = <T = SomeSwap,>(id: string) => swapsForage.getItem<T>(id);

    // Serialized read-modify-write for a stored swap. Re-reads the latest
    // persisted swap inside a per-swap lock and writes it back, so concurrent
    // updates to different fields cannot clobber each other (lost-update race).
    // The mutator receives the freshest swap; return value is the merged swap,
    // or null if it no longer exists.
    const modifySwapStorage = async <T extends SomeSwap = SomeSwap>(
        id: string,
        mutator: (swap: T) => void | Promise<void>,
    ): Promise<T | null> => {
        const apply = async (): Promise<T | null> => {
            const swap = await getSwap<T>(id);
            if (swap === null) {
                return null;
            }
            await mutator(swap);
            await setSwapStorage(swap);
            return swap;
        };

        if (navigator.locks?.request === undefined) {
            return await apply();
        }

        return await navigator.locks.request(`swapStorage:${id}`, apply);
    };

    const getSwaps = async <T = SomeSwap,>(): Promise<T[]> => {
        const swaps: T[] = [];

        await swapsForage.iterate<T, unknown>((swap) => {
            swaps.push(swap);
        });

        return swaps;
    };

    const updateSwapStatus = async (id: string, newStatus: string) => {
        let changed = false;
        const updated = await modifySwapStorage<SomeSwap & { status: string }>(
            id,
            (swap) => {
                if (swap.status !== newStatus) {
                    swap.status = newStatus;
                    changed = true;
                }
            },
        );

        if (updated === null) {
            log.warn(`cannot update swap ${id} status: not found`);
            return false;
        }

        return changed;
    };

    const clearSwaps = async () => {
        await swapsForage.clear();
    };

    setI18n(detectLanguage(i18nConfigured(), i18nUrl(), setI18nUrl));
    void detectWebLNProvider().then((state) => setWebln(state));
    setWasmSupported(checkWasmSupported());

    const [privacyMode, setPrivacyMode] = makePersisted(
        // eslint-disable-next-line solid/reactivity
        createSignal<boolean>(false),
        {
            name: "privacyMode",
        },
    );

    const [zeroConf, setZeroConf] = makePersisted(
        // eslint-disable-next-line solid/reactivity
        createSignal<boolean>(true),
        {
            name: "zeroConf",
        },
    );

    const [embeddedMode, setEmbeddedMode] = createSignal<boolean>(
        props.initialEmbeddedMode ?? false,
    );

    const [parentOrigin, setParentOrigin] = createSignal<string | undefined>(
        props.initialParentOrigin,
    );

    createEffect(() => {
        if (isMobile()) {
            setZeroConf(true);
        }
    });

    // i18n
    createEffect(() => {
        setI18n(detectLanguage(i18nConfigured() || i18nUrl()));
    });
    const dictLocale = createMemo(
        () =>
            flatten(
                dict[(i18n() || config.defaultLanguage) as keyof typeof dict],
            ) as never,
    );

    // eslint-disable-next-line solid/reactivity
    const t = translator(dictLocale, (template: string, values?: BaseTemplateArgs) =>
        resolveTemplate(template, values),
    ) as unknown as tFn;

    return (
        <GlobalContext.Provider
            value={{
                online,
                setOnline,
                pairs,
                setPairs,
                wasmSupported,
                setWasmSupported,
                refundAddress,
                setRefundAddress,
                transactionToRefund,
                setTransactionToRefund,
                i18n,
                setI18n,
                notification,
                setNotification,
                notificationType,
                setNotificationType,
                webln,
                setWebln,
                i18nConfigured,
                setI18nConfigured,
                denomination,
                setDenomination,
                hideHero,
                setHideHero,
                separator,
                setSeparator,
                settingsMenu,
                setSettingsMenu,
                privacyMode,
                setPrivacyMode,
                zeroConf,
                setZeroConf,
                embeddedMode,
                setEmbeddedMode,
                parentOrigin,
                setParentOrigin,
                // functions
                t,
                notify,
                fetchPairs,
                getLogs,
                clearLogs,
                updateSwapStatus,
                setSwapStorage,
                getSwap,
                modifySwapStorage,
                deleteSwap,
                getSwaps,
                clearSwaps,


                newKey,
                rescueFile,
                setRescueFile,
                setLastUsedKey,
                getXpub: getXpubWrapper,
                deriveKey: deriveKeyWrapper,

                rescueFileBackupDone,
                setRescueFileBackupDone,
            }}>
            {props.children}
        </GlobalContext.Provider>
    );
};

const useGlobalContext = () => {
    const context = useContext(GlobalContext);
    if (!context) {
        throw new Error("useGlobalContext: cannot find a GlobalContext");
    }
    return context;
};

export { useGlobalContext, GlobalProvider };
