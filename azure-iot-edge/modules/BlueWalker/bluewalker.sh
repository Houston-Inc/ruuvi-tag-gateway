#!/bin/sh
SOCKETPATH="/tmp/ruuvi.sock"

sudo hciconfig hci0 down
sudo bluewalker -device hci0 -ruuvi -active -json -duration -1 -unix $SOCKETPATH
