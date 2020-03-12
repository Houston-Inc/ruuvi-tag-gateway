#!/bin/bash
SOCKETPATH="/tmp/ruuvi.sock"

sudo hciconfig hci0 down
sudo /home/miik/go/bin/bluewalker -device hci0 -ruuvi -active -json -duration -1 -unix $SOCKETPATH
