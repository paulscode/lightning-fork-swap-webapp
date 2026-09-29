#!/usr/bin/env python3

"""Pre-build checks for the web app configuration in src/config.ts."""

import sys


def handle_coop_disabled():
    print("Cooperative signatures are disabled in config")
    sys.exit(1)


with open("./src/config.ts", "r") as f:
    for line in f:
        if "cooperativeDisabled" in line:
            if "false" not in line:
                handle_coop_disabled()
