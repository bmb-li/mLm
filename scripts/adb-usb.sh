#!/usr/bin/env bash
# Attach the phone's USB debugging interface into WSL2 via usbipd-win.
#
# WSL2 is a VM: the phone only shows up for `adb` after the Windows-side
# usbipd-win forwards it in. `usbipd bind` is persistent, `attach` is not, so
# this has to run after every reboot / cable replug.
#
# Usage:  ./scripts/adb-usb.sh [BUSID]
#         BUSID defaults to the first Android device (VID 18d1) reported by usbipd.
set -uo pipefail

USBIPD="/mnt/c/Program Files/usbipd-win/usbipd.exe"

if [[ ! -x "$USBIPD" ]]; then
  echo "usbipd-win not found at: $USBIPD" >&2
  echo "Install it on Windows: winget install --id dorssel.usbipd-win" >&2
  exit 1
fi

busid="${1:-}"
if [[ -z "$busid" ]]; then
  busid=$("$USBIPD" list 2>/dev/null | tr -d '\r' | awk '$2 ~ /^18d1:/ {print $1; exit}')
fi
if [[ -z "$busid" ]]; then
  echo "No Android device found. Check the cable and that USB debugging is on." >&2
  "$USBIPD" list | tr -d '\r' >&2
  exit 1
fi
echo "==> Using BUSID $busid"

state=$("$USBIPD" list 2>/dev/null | tr -d '\r' | awk -v b="$busid" '$1 == b {print $NF}')
if [[ "$state" != "Shared" && "$state" != "Attached" ]]; then
  echo "==> bind $busid"
  "$USBIPD" bind --busid "$busid" || true
fi

if [[ "$state" != "Attached" ]]; then
  echo "==> attach $busid to WSL"
  "$USBIPD" attach --wsl --busid "$busid" || true
fi

echo "==> load vhci modules"
sudo modprobe vhci-hcd usbip-core usbip-host 2>/dev/null || true

# The devices created by vhci_hcd are owned by root and udev rules do not apply
# to them, so adb cannot open them without an explicit chmod.
sleep 2
sudo chmod 666 /dev/bus/usb/*/* 2>/dev/null || true

echo "==> restart adb"
adb kill-server >/dev/null 2>&1 || true
adb start-server >/dev/null 2>&1 || true

for _ in $(seq 1 15); do
  if adb devices | tr -d '\r' | awk '$2 == "device" {found = 1} END {exit !found}'; then
    echo "==> ready:"
    adb devices | tr -d '\r'
    exit 0
  fi
  sleep 1
done

echo "==> device did not come up; current state:" >&2
adb devices | tr -d '\r' >&2
echo "If it shows 'no permissions', run: sudo chmod 666 /dev/bus/usb/*/*" >&2
echo "If the phone screen asks to allow USB debugging, accept it." >&2
exit 1
