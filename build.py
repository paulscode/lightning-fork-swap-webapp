#!/usr/bin/env python3

"""Pre-build checks for the web app configuration in src/config.ts."""

import os
import sys


def handle_coop_disabled():
    print("Cooperative signatures are disabled in config")
    sys.exit(1)


with open("./src/config.ts", "r") as f:
    config = f.read()
    for line in config.splitlines():
        if "cooperativeDisabled" in line:
            if "false" not in line:
                handle_coop_disabled()


# --- The donation address -------------------------------------------------
# The donation window shows VITE_DONATION_ADDRESS as a QR code; a typo there
# would send donations nowhere. A mainnet build refuses an address that is
# not a valid bech32 or bech32m address of the chain.

CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
BECH32, BECH32M = 1, 0x2BC830A3


def polymod(values):
    gen = [0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3]
    chk = 1
    for v in values:
        top = chk >> 25
        chk = (chk & 0x1FFFFFF) << 5 ^ v
        for i in range(5):
            chk ^= gen[i] if (top >> i) & 1 else 0
    return chk


def segwit_address_error(address, hrp):
    """Why address is not a segwit address with this hrp, or None."""
    if address.lower() != address and address.upper() != address:
        return "mixed case"
    address = address.lower()
    if not address.startswith(hrp + "1"):
        return f"not a {hrp}1 address"
    data = address[len(hrp) + 1:]
    if len(data) < 6 or any(c not in CHARSET for c in data):
        return "not bech32"
    values = [CHARSET.find(c) for c in data]
    expanded = [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]
    check = polymod(expanded + values)
    version = values[0]
    if check != (BECH32 if version == 0 else BECH32M):
        return "bad checksum"
    # The witness program, from 5-bit groups to bytes
    acc, bits, program = 0, 0, []
    for v in values[1:-6]:
        acc = (acc << 5) | v
        bits += 5
        while bits >= 8:
            bits -= 8
            program.append((acc >> bits) & 0xFF)
    if bits >= 5 or (acc << (8 - bits)) & 0xFF:
        return "bad padding"
    if version > 16 or not 2 <= len(program) <= 40:
        return "bad witness program"
    if version == 0 and len(program) not in (20, 32):
        return "bad witness program"
    return None


def env_value(key):
    """key from the environment, else from the .env files Vite reads."""
    if os.environ.get(key):
        return os.environ[key]
    for name in (".env.production.local", ".env.local", ".env.production",
                 ".env"):
        try:
            with open(name) as f:
                for line in f:
                    k, _, v = line.strip().partition("=")
                    if k == key and v:
                        return v.strip().strip("\"'")
        except FileNotFoundError:
            pass
    return ""


if __name__ == "__main__" and 'network: "mainnet"' in config:
    donation = env_value("VITE_DONATION_ADDRESS")
    if donation:
        error = segwit_address_error(donation, "bc")
        if error:
            print(f"VITE_DONATION_ADDRESS {donation}: {error}")
            sys.exit(1)
