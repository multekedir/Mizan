#!/usr/bin/env bash
# Remove legacy Athan / MyHomeAtahn / old systemd user kiosk bits; keep current Mizan.
# Run on the kiosk host: sudo ./scripts/cleanup-mizan-old-files.sh

set -euo pipefail

if [ "${EUID:-0}" -ne 0 ]; then
  echo "Run with sudo: sudo $0" >&2
  exit 1
fi

KIOSK_USER="${KIOSK_USER:-anuye}"
KIOSK_HOME="/home/$KIOSK_USER"
PROJECT_DIR="${PROJECT_DIR:-$KIOSK_HOME/Mizan}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${GREEN}[cleanup]${NC} $*"; }
warn() { echo -e "${YELLOW}[cleanup]${NC} $*"; }

run_as_user() {
  sudo -u "$KIOSK_USER" -H bash -lc "$*"
}

info "Stopping old user systemd kiosk service if it exists..."
run_as_user "systemctl --user disable --now mizan-kiosk.service 2>/dev/null || true"
run_as_user "systemctl --user mask mizan-kiosk.service 2>/dev/null || true"
run_as_user "systemctl --user reset-failed 2>/dev/null || true"

info "Removing old user systemd kiosk service files..."
rm -f "$KIOSK_HOME/.config/systemd/user/mizan-kiosk.service"
rm -f "$KIOSK_HOME/.config/systemd/user/default.target.wants/mizan-kiosk.service"
rm -f "$KIOSK_HOME/.config/systemd/user/default.target.wants/mizan-kiosk"

info "Removing old Athan Clock / MyHomeAtahn services..."
systemctl stop athan-clock@"$KIOSK_USER".service 2>/dev/null || true
systemctl disable athan-clock@"$KIOSK_USER".service 2>/dev/null || true
systemctl mask athan-clock@"$KIOSK_USER".service 2>/dev/null || true

while read -r unit; do
  [ -z "$unit" ] && continue
  info "Disabling old service: $unit"
  systemctl stop "$unit" 2>/dev/null || true
  systemctl disable "$unit" 2>/dev/null || true
  systemctl mask "$unit" 2>/dev/null || true
done < <(
  systemctl list-unit-files --type=service --no-legend 2>/dev/null \
    | awk '{print $1}' \
    | grep -Ei 'athan-clock|myhome|atahn' || true
)

rm -f /etc/systemd/system/athan-clock@.service
rm -f /etc/systemd/system/athan-clock.service
rm -f /etc/systemd/system/myhomeatahn.service
rm -f /etc/systemd/system/myhomeathan.service
rm -f /etc/systemd/system/MyHomeAtahn.service

info "Removing old autostart entries..."
rm -f "$KIOSK_HOME/.config/autostart/"*MyHomeAtahn*.desktop 2>/dev/null || true
rm -f "$KIOSK_HOME/.config/autostart/"*myhome*.desktop 2>/dev/null || true
rm -f "$KIOSK_HOME/.config/autostart/"*athan*.desktop 2>/dev/null || true
rm -f "$KIOSK_HOME/.config/autostart/"*atahn*.desktop 2>/dev/null || true

rm -f /etc/xdg/autostart/*MyHomeAtahn*.desktop 2>/dev/null || true
rm -f /etc/xdg/autostart/*myhome*.desktop 2>/dev/null || true
rm -f /etc/xdg/autostart/*athan*.desktop 2>/dev/null || true
rm -f /etc/xdg/autostart/*atahn*.desktop 2>/dev/null || true

info "Removing old deploy pid/log files..."
rm -f "$PROJECT_DIR/.frontend.pid"
rm -f "$PROJECT_DIR/.backend.pid"
rm -f "$PROJECT_DIR/.frontend.log"
rm -f "$PROJECT_DIR/.backend.log"

info "Current Mizan paths (not removed by this script):"
echo "  /etc/systemd/system/mizan-backend.service"
echo "  /etc/systemd/system/mizan-frontend.service"
echo "  $KIOSK_HOME/.local/bin/start-mizan-kiosk.sh"
echo "  $KIOSK_HOME/.config/autostart/mizan-kiosk.desktop"

info "Stopping old running processes..."
pkill -f "/home/$KIOSK_USER/athan-clock/main.js" 2>/dev/null || true
pkill -f 'electron .*athan-clock' 2>/dev/null || true
pkill -f 'MyHomeAtahn' 2>/dev/null || true
pkill -f 'myhomeatahn' 2>/dev/null || true
pkill -f 'myhomeathan' 2>/dev/null || true

info "Reloading systemd..."
systemctl daemon-reload
systemctl reset-failed
run_as_user "systemctl --user daemon-reload 2>/dev/null || true"
run_as_user "systemctl --user reset-failed 2>/dev/null || true"

info "Fixing ownership under $KIOSK_HOME..."
chown -R "$KIOSK_USER:$KIOSK_USER" "$KIOSK_HOME/.local" "$KIOSK_HOME/.config" 2>/dev/null || true

if [ -d "$PROJECT_DIR" ]; then
  chown -R "$KIOSK_USER:$KIOSK_USER" "$PROJECT_DIR"
fi

info "Cleanup complete."
warn "Reboot to confirm only Mizan opens:"
echo "  sudo reboot"
