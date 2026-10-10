const dict = {
    en: {
        language: "English",
        or: "or",
        status: "Status",
        error: "Error",
        error_subline: "Invalid response from the API, something is wrong.",
        history: "History",
        swap: "Swap",
        refund: "Refund",
        support: "Support",
        onion: "Onion",
        terms: "Terms",
        privacy: "Privacy",
        blockexplorer: "Open {{ typeLabel }}",
        blockexplorer_lockup_address: "lockup address",
        blockexplorer_lockup_tx: "Lockup Transaction",
        blockexplorer_claim_tx: "claim transaction",
        blockexplorer_refund_tx: "refund transaction",
        network_fee: "Network Fee",
        swap_fees: "Swap Fees",
        fee: "Service Fee",
        denomination: "Denomination",
        send: "Send",
        continue: "Continue",
        receive: "Receive",
        max: "Max",
        minimum_amount: "Minimum amount is {{ amount }} {{ denomination }}",
        maximum_amount: "Maximum amount is {{ amount }} {{ denomination }}",
        create_swap: "Create Swap",
        new_swap: "New Swap",
        feecheck:
            "Network fee was updated based on network situation, please confirm new amounts and continue with swap.",
        amount_limits_changed:
            "Swap limits changed. Please confirm new amounts and continue with swap.",
        create_and_paste:
            "Paste a Lightning invoice, LNURL or Lightning address",
        invoice_cleared_amount_changed:
            "Invoice cleared because the amount changed.",
        congrats: "Congratulations!",
        successfully_swapped:
            "You successfully received {{ amount }} {{ denomination }}!",
        timeout_eta: "Timeout ETA",
        pay_invoice: "Swap: {{ id }}",
        pay_swap_404: "Swap not found!",
        pay_timeout_blockheight: "Timeout Block Height ({{ network }})",
        send_to: "Send {{ amount }} {{ denomination }} to",
        send_between:
            "Send between {{ min }} and {{ max }} {{ denomination }} to",
        pay_invoice_to:
            "Pay this invoice about {{ amount }} {{ denomination }}",
        lockup_failed: "Lockup Failed!",
        failure_reason: "Failure reason",
        invoice_payment_failure: "Could not pay your lightning invoice",
        onchain_address: "Enter {{ asset }} address to receive funds",
        onchain_address_no_asset: "Enter address",
        invalid_refund_file: "Invalid rescue key",
        invalid_invoice:
            "Please provide a valid Lightning invoice, LNURL or Lightning address",
        invalid_0_amount: "Invoices without amount are not supported",
        copy_invoice: "Lightning invoice",
        copy_address: "Address",
        copy_amount: "Amount",
        copy_invoice_amount: "Copy amount in {{ denomination }}",
        copy_bip21: "BIP21",
        rescue_a_swap_mnemonic:
            "Enter your rescue key to rescue a swap that is not available in this browser’s swap history.",
        refund_past_swaps: "Past swaps",
        refund_past_swaps_subline:
            "Swaps that got saved into your browsers storage",
        history_no_swaps: "Looks like you didn't do any swaps yet.",
        refund_address_header:
            "Enter a {{ asset }} address to receive your refund on:",
        refund_address_header_no_asset:
            "Enter an address to receive your refund on:",
        history_export: "Export",
        refund_clear: "Delete storage",
        delete_storage:
            "Are you sure you want to clear your storage?\nYour swap information and you refund / claim private keys will be lost.",
        delete_storage_single_swap:
            "Are you sure you want to clear Swap {{ id }} from your storage?\nYour swap information and you refund / claim private keys will be lost.",
        delete_logs: "Are you sure you want to clear your logs?",
        tx_in_mempool: "Transaction is in mempool",
        tx_in_mempool_subline: "Waiting for confirmation to complete the swap.",
        invoice_pending: "Transaction received, paying invoice.",
        invoice_expired: "Invoice expired, try again!",
        search: "Search",
        tx_confirmed: "Transaction confirmed",
        tx_ready_to_claim: "Claiming transaction now...",
        refunded: "Swap has been refunded successfully!",
        locktime_not_satisfied: "Locktime requirement not satisfied",
        already_refunded: "Swap already refunded",
        api_offline: "API is offline",
        api_offline_msg:
            "Could not connect to the swap API, please try again later",
        refund_explainer: "You will be able to refund after the swap timeout!",
        created: "Created",
        id: "ID",
        headline: "Lightning Fork Swap",
        subline:
            "Swap between the Bitcoin (BLAKE2b) chain and its Lightning network. Non-custodial: your keys never leave your browser.",
        start_swapping: "Start Swapping",
        warning_return:
            "Return to this page after paying the invoice! The payment might show pending until you return to this page.",
        warning_expiry:
            "Make sure your transaction confirms within ~24 hours after creation of this swap!",
        not_found: "404 - Not Found",
        not_found_subline: "This page seems to have vanished.",
        back_to_home: "Back to Home",
        invalid_address: "Invalid {{ asset }} address",
        scan_qr_code: "Scan QR Code",
        version: "Version",
        open_in_wallet: "Open in Wallet",
        broadcasting_claim: "Broadcasting claim transaction...",
        paste_invalid:
            "Clipboard contains invalid characters or maximum amount is exceeded",
        switch_paste: "Switched swap direction/asset based on pasted content",
        settings: "Settings",
        decimal_separator: "Decimal Separator",
        denomination_tooltip: "Choose your preferred denomination: BTC or sats",
        decimal_tooltip:
            "Choose your preferred decimal separator: dot or comma",
        swap_completed: "Swap {{ id }} completed successfully!",
        claim_fail: "Failed to claim swap: {{ id }}",
        logs: "Logs",
        logs_tooltip: "Logs of the web app, useful for debugging",
        hide_wallet_address: "Privacy Mode",
        hide_wallet_address_tooltip:
            "Hides swap IDs and addresses for privacy in demos and recordings",
        retry: "Retry",
        error_no_quote:
            "A quote could not be obtained. Please check your connection and try again.",
        error_zero_quote: "Increase send amount",
        zero_conf: "Zero-Conf",
        zero_conf_tooltip:
            "Accept transactions that are not yet confirmed in a block",
        on: "on",
        off: "off",
        invalid_pair: "Invalid pair",
        invalid_send_asset: "Invalid send asset",
        error_starting_qr_scanner:
            "Couldn't access camera, please check permissions!",
        block: "block",
        accept: "Accept",
        no_lockup_transaction: "No lockup transaction found",
        routing_fee_limit: "Routing Fee Limit",
        download_boltz_rescue_key: "Rescue Key",
        download_boltz_rescue_key_subline:
            "Back up all your swaps with a single Rescue Key 🙌",
        download_boltz_rescue_key_subline_second:
            "This key works on any device and for all swaps created with it.",
        download_boltz_rescue_key_subline_backup:
            "To continue, please back it up.",
        download_boltz_rescue_key_subline_privacy:
            "**Careful:** Privacy-focused browsers may delete downloaded files when closed.",
        download_boltz_rescue_key_subline_save:
            "Save the Rescue Key in a **SECURE** and **PERMANENT** location!",
        download_boltz_rescue_key_subline_warning:
            "Failing to do so may lead to **LOSS OF FUNDS**.",
        download_new_key: "Download rescue key",
        verify_boltz_rescue_key: "Verify Rescue Key",
        verify_boltz_rescue_key_subline:
            "Please select your previously saved Rescue Key to verify it.",
        verify_key: "Verify key",
        verify_key_failed:
            "Verification of the Rescue Key failed. We recommend downloading a new Rescue Key to continue.",
        rescue_key: "Rescue Key",
        reset_rescue_key_prompt:
            "⚠️ WARNING: This will delete ALL your swap data and generate a new Rescue Key.\n\nDon't proceed unless you have a backup of your existing Rescue Key or you're absolutely sure you won't need it. \n\nType 'confirm' to proceed:",
        reset_rescue_key_invalid_confirmation:
            "Invalid confirmation. Please type 'confirm' to proceed.",
        reset_rescue_key_error:
            "An error occurred while resetting the Rescue Key. Please reload this page and try again.\n\nError: {{ error }}",
        reset_rescue_key_success: "New Rescue Key generated successfully!",
        no_swaps_found: "No swaps found",
        back: "Back",
        next: "Next",
        pagination_info: "Page {{ start }} of {{ end }}",
        show_rescue_key_instead: "Show the 12-word rescue key instead",
        backup_boltz_rescue_key: "Back up your Rescue Key",
        backup_boltz_rescue_key_subline_second:
            "This new key works on any device and works for all swaps created with it.",
        backup_boltz_rescue_key_subline_third:
            "Please write down or copy this key and store it in a secure and permanent location.",
        backup_boltz_rescue_key_reminder: "Keep this safe. Do not share.",
        copy_rescue_key: "Copy rescue key",
        user_saved_key: "I have saved the rescue key",
        verify_mnemonic_word: {
            start: "What is the word at ",
            strong: "position {{ number }}",
            end: " of your rescue key?",
        },
        incorrect_word: "Incorrect word. Please double-check your rescue key.",
        enter_mnemonic: "Enter rescue key",
        hint_paste_mnemonic: "Hint: you can paste all 12 words at once.",
        refresh_for_refund:
            "If you sent BTC into this swap, refresh the page to check for a refund.",
        claim: "Claim",
        claimed: "Swap has been claimed successfully!",
        rescue: "Rescue",
        rescue_swaps: "Rescue swaps",
        failed_get_swap: "Could not get swap {{ id }}",
        failed_get_swap_subline:
            "Please re-insert the rescue key and try again.",
        in_progress: "In progress",
        completed: "Completed",
        get_refundable_error:
            "Failed to load UTXO data. Refresh to try again or check your internet connection if the problem persists.",
        min_amount_destination:
            "Minimum amount for the destination address is {{ amount }} {{ denomination }}",
        max_amount_destination:
            "Maximum amount for the destination address is {{ amount }} {{ denomination }}",
        exact_amount_destination:
            "Invoice amount must be exactly {{ amount }} {{ denomination }}",
        destination: "Destination",
        destination_address: "{{ address }}",
        display: "Display",
        security: "Security",
        failed: "Failed",
        swaps_found: "Scanning swaps ({{ count }} found)",
        rescue_external_select_method: "Select your rescue key first",
        rescue_external_subtitle:
            "Use your rescue key to find and refund or claim swaps that are not in this browser's history.",
        stop_scanning: "Stop scanning",
        upload_rescue_key: "Select Rescue Key",

        suspension_status: "New swaps paused",
        suspension_p1: "New swaps are paused for now.",
        suspension_p2:
            "Pending swaps keep working, and refunds and the rescue page stay available. If a swap of yours failed, you can refund it on the rescue page.",
        open_source: "Open source on GitHub (AGPL-3.0)",
        hero_submarine_title: "Submarine swaps",
        hero_submarine_text:
            "Send on-chain BTC on the Bitcoin (BLAKE2b) chain; the service pays your Lightning invoice.",
        hero_reverse_title: "Reverse swaps",
        hero_reverse_text:
            "Pay a Lightning invoice and receive on-chain BTC at your Bitcoin (BLAKE2b) address.",
        hero_refund_title: "Refunds with your rescue key",
        hero_refund_text:
            "Swaps are locked in HTLCs. If a submarine swap fails, your rescue key lets you refund your BTC after the timelock, even without the service.",
        suspension_rescue_link: "Go to the rescue page",
        invoice_missing_blake2b:
            "This invoice was not made by a Lightning node on the Bitcoin BLAKE2b chain (it lacks feature bit 512). Paying it would fail.",
        copy_preimage: "Copy payment preimage",
        donate: "Donate",
        contact: "Contact",
        close: "Close",
        copy_node: "Node",
        copy_command: "Command",
        donate_title: "Help grow the swap service's liquidity",
        donate_tab_onchain: "Donate on chain",
        donate_tab_channel: "Open a channel",
        donate_intro:
            "Every swap needs coins ready on both sides: on the chain and in Lightning channels. Donations add to those coins, so the service can take bigger swaps and more of them at once.",
        donate_amount: "Amount",
        donate_any_amount: "Any amount",
        donate_custom_placeholder: "Other amount in {{ denomination }}",
        donate_address_hint:
            "Check the start and the end of the address your wallet shows.",
        donate_open_wallet: "Open in wallet",
        donate_view_explorer: "See what this address has received",
        donate_received_so_far:
            "Donations so far: {{ amount }} {{ denomination }} in {{ count }} donations",
        donate_received_so_far_one:
            "Donations so far: {{ amount }} {{ denomination }} in 1 donation",
        donate_thanks: "Received, thank you!",
        donate_thanks_detail:
            "Your donation is in the mempool and confirms with the next blocks.",
        donate_how_title: "How your donation is used",
        donate_how_reverse:
            'Lightning to chain swaps. When you pay a Lightning invoice, the service sends your coins on chain from its own wallet. A fuller wallet means larger swaps and fewer "not enough liquidity" refusals.',
        donate_how_submarine:
            "Chain to Lightning swaps. The service pays your invoice through its Lightning channels. Opening a channel to a well-connected node takes on-chain coins, plus a miner fee.",
        donate_how_balance:
            "Keeping both sides open. When most people swap the same way, one side runs low. Moving coins back across costs on-chain fees. Your donation goes where liquidity is shortest.",
        donate_how_promise:
            "Donations are used only for the service's liquidity and the on-chain fees of managing it.",
        donate_small_print:
            "A donation is a gift: it is not tied to any swap, it is not refunded, and it is not a tax-deductible charitable contribution. Never send swap funds here. Send only from a Bitcoin (BLAKE2b) chain wallet.",
        donate_replay_hint:
            "Send from a wallet that signs for the Bitcoin (BLAKE2b) chain only (with replay protection), or from coins you received after the fork.",
        donate_replay_at_risk:
            "Heads-up: this transaction isn't replay-protected. The coins you spent also exist on the SHA256 chain, and anyone could copy this transaction there, which would send those coins to our address on that chain. We will never do it ourselves. To keep them, move the coins of these addresses on the SHA256 chain to an address of yours now:",
        donate_replay_replayed:
            "This transaction was copied to the SHA256 chain; those coins are now at our address there.",
        donate_replay_contact:
            "If they do end up with us, contact us and we'll work out returning them.",
        channel_intro:
            "Run a Lightning Fork node? A channel from your node to ours gives the service room to receive payments, which Lightning to chain swaps need. It costs you only the channel's miner fee, and your coins stay yours, spendable through our node.",
        channel_min: "Channels from {{ amount }} sats.",
        channel_command: "Or open it with lncli:",
        donate_line: "Swaps run on shared liquidity.",
        donate_line_action: "Help it grow",
        donate_line_dismiss: "Hide this",
        channel_switch: "Use my donation to open a channel to my node",
        channel_switch_hint:
            "Your node gets room to receive payments (inbound capacity). The coins in the channel stay the service's.",
        channel_short_title: "Best effort, not a promise.",
        channel_short_text:
            "We will try to open the channel, but we can't guarantee it. If we can't, your donation still goes to the service's liquidity. Donations are never refunded.",
        channel_terms_link: "Terms",
        channel_node_label: "Your node",
        channel_node_placeholder: "pubkey@host:port, or just the pubkey",
        channel_node_help:
            "The key alone is enough if your node is already connected to ours or announces a public address.",
        channel_node_invalid:
            "That isn't a node key (66 characters, starting with 02 or 03), optionally followed by @host:port.",
        channel_sizes:
            "Send at least {{ min }} {{ unit }}: a channel of at least {{ channel }} {{ unit }} plus its miner fee (about {{ fee }} {{ unit }} now). A channel is at most {{ max }} {{ unit }}; anything above stays with the service as a general donation.",
        channel_paused:
            "Channel donations are paused right now. You can still donate on chain.",
        channel_full_title: "Please read before donating",
        channel_full_gift_title: "This is a donation, not a purchase.",
        channel_full_gift:
            "You are giving coins to Lightning Fork Swap. You are not buying a channel, a service or anything else, and this is not a contract or an agreement of any kind.",
        channel_full_effort_title: "The channel is best effort.",
        channel_full_effort:
            "We will try to use your donation to open a channel from our node to yours, but we can't promise that it will open, when, at what size, or how long it stays open. Your node may be unreachable, may refuse the channel, or something on our side or on the network may prevent it.",
        channel_full_stays_title:
            "If we can't open it, the donation stays with the service",
        channel_full_stays:
            "and goes to its liquidity, like any other donation. Nothing is refunded, in any case, including amounts sent by mistake, too little, too much, late, or to the wrong node details.",
        channel_full_ours_title:
            "The channel and its coins belong to Lightning Fork Swap.",
        channel_full_ours:
            "Your node gets room to receive payments (inbound capacity). You can't withdraw our side of the channel, and we may close it at any time, for example if your node is offline for a long time.",
        channel_full_send_title: "Only send what you are happy to give,",
        channel_full_send:
            "and only from a wallet on the Bitcoin (BLAKE2b) chain, to the address shown for this donation.",
        channel_accept:
            "I understand: this is a gift, the channel is best effort only, and nothing is refunded.",
        channel_create: "Create my donation address",
        channel_working: "Preparing your donation address",
        channel_error_bad_node: "That node key isn't valid.",
        channel_error_not_public:
            "That address isn't reachable from the internet. Give a public address or an onion address, or just the key.",
        channel_error_bad_host: "We couldn't find that host. Check its name.",
        channel_error_our_node: "That's our own node.",
        channel_error_node_limit: "This node already has its donated channels.",
        channel_error_budget:
            "Many donations are waiting right now. Please try again in a while.",
        channel_error_disclaimer:
            "The terms of this donation changed. Reload the page and read them again.",
        channel_error_work: "That took too long. Please try again.",
        channel_error_unavailable:
            "Channel donations are unavailable right now. Please try again later.",
        cd_title: "Your channel donation",
        cd_keep_link:
            "Keep this link: it brings you back here, and it lets you change your node's details if needed.",
        cd_copy_link: "Link",
        cd_send:
            "Send at least {{ min }} {{ unit }} to this address, made for this donation only.",
        cd_max: "Up to {{ max }} {{ unit }} becomes the channel; anything above stays with the service.",
        cd_expires: "We wait for your payment until {{ time }}.",
        cd_received:
            "Received {{ amount }} {{ unit }}; {{ confirmed }} {{ unit }} with {{ n }} confirmations.",
        cd_step_awaiting_payment: "Waiting for your payment",
        cd_step_payment_seen: "Payment seen",
        cd_step_payment_confirmed: "Payment confirmed",
        cd_step_connecting: "Connecting to your node",
        cd_step_opening: "Opening the channel",
        cd_step_funding_broadcast: "Channel transaction sent",
        cd_step_open: "Channel opened",
        cd_state_retrying:
            "We couldn't open the channel yet. Next try around {{ time }}.",
        cd_state_needs_attention: "Please check your node's details.",
        cd_state_fell_back:
            "Your donation went to general liquidity, as described when you donated. Thank you, it helps all the same.",
        cd_state_closed: "The channel was closed.",
        cd_state_expired: "Nothing was received in time.",
        cd_state_rejected:
            "Too many donations were waiting, so this one was not started.",
        cd_error_unreachable:
            "We couldn't reach your node. Check that it is online and reachable from the internet.",
        cd_error_wrong_node:
            "A different node answered at that address. Check the key and the address.",
        cd_error_not_fork_node:
            "That node isn't on the Lightning Fork network.",
        cd_error_no_address:
            "We don't know where to reach your node. Add its address (host:port).",
        cd_error_peer_rejected:
            "Your node refused the channel. Check its rules for incoming channels.",
        cd_error_peer_too_small:
            "Your node's minimum channel size is larger than this channel. Lower it on your node.",
        cd_error_peer_pending:
            "Your node has too many channels opening at once. We will try again.",
        cd_error_disconnected:
            "Your node stopped responding while the channel was opening. We will try again.",
        cd_error_our_node: "That's our own node.",
        cd_error_node_limit: "This node already has its donated channels.",
        cd_error_too_little: "Less than the minimum arrived in time.",
        cd_error_internal:
            "Something went wrong on our side. We will try again.",
        cd_error_gave_up: "We tried for two days without success.",
        cd_error_no_edit: "The node's details were not changed in time.",
        cd_error_fees_high:
            "Network fees are high right now. We will try again when they fall.",
        cd_error_lnd_unavailable: "Our node is busy. We will try again.",
        cd_error_operator: "Ended by the service.",
        cd_error_budget: "Too many donations were waiting.",
        cd_channel: "Channel of {{ amount }} {{ unit }}",
        cd_remainder:
            "{{ amount }} {{ unit }} stayed with the service as a general donation. Thank you.",
        cd_funding_confs:
            "Confirmations: {{ n }} (a channel is ready after 6, usually about an hour)",
        cd_edit_title: "Change your node's details",
        cd_edit_save: "Save",
        cd_edit_saved: "Saved. We'll try again with these details.",
        cd_edit_no_secret:
            "To change the node, open this page from the link you kept when you donated, in the browser you used.",
        cd_about: "About this donation",
        cd_not_found: "We can't find this donation.",
        cd_your_node: "Your node",
        history_donations: "Channel donations",
        history_donations_none: "No channel donations from this browser.",
        network: "Network",
        network_title: "The Lightning Fork network",
        network_description:
            "A map of the Lightning Fork network: each node is a star sized by its capacity, each line a channel. The list below holds the same facts.",
        network_loading: "Loading the network",
        network_unavailable:
            "The network map isn't available right now. Here is our node and its channels.",
        network_stats:
            "{{ nodes }} nodes, {{ channels }} channels, {{ capacity }} {{ unit }} of capacity",
        network_home: "Our node",
        network_search: "Find a node by alias or key",
        network_zoom_in: "Zoom in",
        network_zoom_out: "Zoom out",
        network_close_panel: "Close",
        network_capacity: "Capacity",
        network_channels: "Channels",
        network_share: "Share of the network",
        network_addresses: "Addresses",
        network_no_address:
            "This node announces no address, so a channel to it has to start from a node it already knows.",
        network_copy_uri: "Copy the node's address",
        network_copied: "Copied",
        network_ours: "The swap service's node",
        network_open_channel: "Open a channel to us",
        network_donate: "Donate",
        network_list: "All nodes as a list",
        network_list_alias: "Node",
        network_more: "Explore the network",
        flip_assets: "Swap the direction",
        home_headline:
            "Swap between the BLAKE2b chain and its Lightning network",
        home_subline:
            "Non-custodial: your keys never leave your browser, and every swap either completes or can be refunded.",
        home_stats:
            "{{ nodes }} nodes · {{ channels }} channels · {{ capacity }} {{ unit }} of capacity",
        home_tap_explore: "Tap to explore the network",
        home_how: "How it works",
        home_help_title: "Help the network grow",
        home_help_text:
            "Swaps run on shared liquidity. A donation adds to the coins the service keeps ready; a channel from your node to ours gives it room to receive.",
        home_faq: "Questions",
        faq_fees_q: "What does a swap cost?",
        faq_fees_a:
            "The swap card shows everything before you confirm: the service fee (a percentage of the amount) and the network fees of the swap's transactions.",
        faq_limits_q: "How much can I swap?",
        faq_limits_a:
            "Each kind of swap has a minimum and a maximum, shown on the swap card. Larger amounts can be split into several swaps.",
        faq_timeout_q: "What if something goes wrong?",
        faq_timeout_a:
            "A swap either completes on both sides or not at all. If a chain to Lightning swap fails, you can take your coins back after its timelock with your rescue key; if a Lightning to chain swap is not completed, your Lightning payment returns to you.",
        faq_chain_q: "Which coins and networks?",
        faq_chain_a:
            "BTC on the Bitcoin (BLAKE2b) chain, and the Lightning Fork network built on it. Invoices and addresses from other networks are refused.",
        faq_rescue_q: "What is the rescue key?",
        faq_rescue_a:
            "A file your browser makes for your swaps. Keep it: with it you can refund a failed swap from the Rescue page, even without this service.",
    },
};

type NestedKeyOf<T> = {
    [K in keyof T & string]: T[K] extends object
        ? `${K}.${NestedKeyOf<T[K]>}`
        : K;
}[keyof T & string];

export type DictKey = NestedKeyOf<typeof dict.en>;

export type Language = keyof typeof dict;

export const rawDict = JSON.parse(JSON.stringify(dict));

Object.entries(dict)
    .filter(([lang]) => lang !== "en")
    .map(([, langDict]) => {
        Object.entries(dict.en).map(([key, enVal]) => {
            const dictKey = key as keyof typeof dict.en;
            if (langDict[dictKey] === undefined) {
                (langDict as Record<keyof typeof dict.en, unknown>)[dictKey] =
                    enVal;
            }
        });
    });

export default dict;
