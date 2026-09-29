import log from "loglevel";

// Version of the swap storage layout. Bump it and add a migration step here
// when the stored swap shape changes.
export const latestStorageVersion = 1;

const storageVersionKey = "version";

export const migrateStorage = async (
    paramsForage: LocalForage,
): Promise<void> => {
    const version = await paramsForage.getItem<number>(storageVersionKey);
    if (version === latestStorageVersion) {
        return;
    }

    log.info(`Setting storage version to ${latestStorageVersion}`);
    await paramsForage.setItem(storageVersionKey, latestStorageVersion);
};
