import RescueFileUpload from "../../components/RescueFileUpload";
import { useGlobalContext } from "../../context/Global";
import type { ExternalRescueSearch } from "./useExternalRescueSearch";

type MethodSelectionProps = {
    actions: ExternalRescueSearch["actions"];
    selection: ExternalRescueSearch["selection"];
};

export const MethodSelection = (props: MethodSelectionProps) => {
    const { t } = useGlobalContext();

    return (
        <>
            <p class="frame-text rescue-external-subtitle">
                {t("rescue_external_subtitle")}
            </p>

            <hr />
            <RescueFileUpload
                onFileValidated={props.actions.handleFileValidated}
                onError={props.actions.handleFileError}
                onReset={props.actions.handleReset}
                autoSubmitMnemonic
                mnemonicBackLabel="upload_rescue_key"
                fileName={props.selection.rescueFileDisplayName()}
                errorKey={props.selection.fileErrorKey()}
            />
            <hr />

            <div class="btns rescue-external-actions">
                <button
                    class="btn"
                    type="button"
                    disabled={!props.selection.canSearch()}
                    onClick={() => void props.actions.startSearch()}>
                    {props.selection.searchText()}
                </button>
            </div>
        </>
    );
};
