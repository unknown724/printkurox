#!/bin/bash
# PrintKurox Universal USB Printer Hotplug Provisioner
# Auto-discovers any newly connected USB/IPP-over-USB printer (Epson, HP, Canon, Brother)
# and registers + enables a CUPS queue if one doesn't already exist for that URI.

LOCK_FILE="/tmp/printkurox-printer-hotplug.lock"
exec 9>"$LOCK_FILE"
flock -n 9 || exit 0

sleep 3

EXISTING_URIS=$(lpstat -v 2>/dev/null | awk '{print $NF}')
CANDIDATES=$(lpinfo -v 2>/dev/null | awk '/^(direct|network) (usb:\/\/|ipp:\/\/localhost|ipps:\/\/localhost)/ {print $2}')

for URI in $CANDIDATES; do
  if echo "$EXISTING_URIS" | grep -Fq "$URI"; then
    # Queue already exists: make sure it isn't paused/disabled after replug
    QNAME=$(lpstat -v 2>/dev/null | awk -v u="$URI" '$NF == u {gsub(":", "", $3); print $3; exit}')
    if [ -n "$QNAME" ]; then
      cupsaccept "$QNAME" >/dev/null 2>&1 || true
      cupsenable "$QNAME" >/dev/null 2>&1 || true
    fi
    continue
  fi

  # Extract clean printer queue name from USB URI (e.g. usb://EPSON/L3210%20Series?...)
  RAW_MODEL=$(python3 -c '
import sys, urllib.parse, re
u = urllib.parse.urlparse(sys.argv[1])
raw = urllib.parse.unquote((u.netloc + u.path).strip("/"))
print(re.sub(r"[^A-Za-z0-9]+", "_", raw).strip("_")[:48] or "PrintKurox_USB_Printer")
' "$URI" 2>/dev/null)

  QNAME="${RAW_MODEL:-PrintKurox_USB_Printer}"

  # Try driverless IPP Everywhere first, then fallback to matching PPD (ESC/P-R, HPLIP, Gutenprint, brlaser)
  if lpadmin -p "$QNAME" -E -v "$URI" -m everywhere >/dev/null 2>&1; then
    logger -t printkurox-hotplug "Registered driverless printer queue $QNAME ($URI)"
  else
    MAKE_HINT=$(echo "$QNAME" | cut -d'_' -f1 | tr '[:upper:]' '[:lower:]')
    PPD=$(lpinfo -m 2>/dev/null | awk -v m="$MAKE_HINT" 'tolower($0) ~ m {print $1; exit}')
    [ -z "$PPD" ] && PPD=$(lpinfo -m 2>/dev/null | awk '/escpr|gutenprint|hplip|brlaser/ {print $1; exit}')
    if [ -n "$PPD" ] && lpadmin -p "$QNAME" -E -v "$URI" -m "$PPD" >/dev/null 2>&1; then
      logger -t printkurox-hotplug "Registered PPD ($PPD) printer queue $QNAME ($URI)"
    fi
  fi

  cupsaccept "$QNAME" >/dev/null 2>&1 || true
  cupsenable "$QNAME" >/dev/null 2>&1 || true
  lpadmin -p "$QNAME" -o PageSize=A4 >/dev/null 2>&1 || true
  lpadmin -p "$QNAME" -o Ink=MONO >/dev/null 2>&1 || true
  if echo "$URI" | grep -qi "epson"; then
    lpadmin -p "$QNAME" -o usb-unidir-default=true -o usb-no-reattach-default=true >/dev/null 2>&1 || true
  fi
done

# Wake print daemon so it clears cached printer state & picks up any waiting jobs
curl -s -X POST http://127.0.0.1:7250/poll-now >/dev/null 2>&1 || true
