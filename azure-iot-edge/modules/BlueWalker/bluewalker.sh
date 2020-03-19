#!/bin/bash
SOCKETPATH="/tmp/ruuvi.sock"

hciconfig hci0 down
bluewalker -device hci0 -ruuvi -active -json -duration -1 -unix $SOCKETPATH
