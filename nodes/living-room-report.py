# -*- coding: utf-8 -*-
"""One passive sample from the legacy InterfaceKits. Runs on the Pi via stdin."""
from __future__ import print_function
import binascii
import errno
import glob
import json
import os
import select
import struct
import sys
import time

ALLOWED = {"east": ("345764", "346077"), "west": ("348403",)}


def value(device, name):
    with open(os.path.join(device, name)) as handle:
        return handle.read().strip()


def devices(side):
    found = {}
    for path in glob.glob("/sys/bus/usb/devices/*"):
        try:
            if (value(path, "idVendor"), value(path, "idProduct"), value(path, "bcdDevice")) != ("06c2", "0044", "0605"):
                continue
            serial = value(path, "serial")
            if serial in ALLOWED[side]:
                bus, address = int(value(path, "busnum")), int(value(path, "devnum"))
                found["Ii:%d:%03d:1" % (bus, address)] = (serial, bus)
        except (IOError, OSError, ValueError):
            continue
    return found


def snapshot(side):
    addresses = devices(side)
    fds = []
    reports = {}
    try:
        for bus in set(bus for serial, bus in addresses.values()):
            fds.append(os.open("/sys/kernel/debug/usb/usbmon/%du" % bus, os.O_RDONLY | os.O_NONBLOCK))
        end = time.time() + 1.5
        while fds and time.time() < end and len(reports) < len(addresses):
            ready = select.select(fds, [], [], max(0, end - time.time()))[0]
            for fd in ready:
                try:
                    fields = os.read(fd, 4096).decode("ascii").split()
                except OSError as error:
                    if error.errno != errno.EAGAIN:
                        raise
                    time.sleep(0.005)
                    continue
                if (len(fields) == 8 and fields[2] == "C" and fields[3] in addresses
                        and fields[4:7] == ["0:8", "4", "="] and len(fields[7]) == 8):
                    inputs, outputs = struct.unpack("<HH", binascii.unhexlify(fields[7]))
                    reports[fields[3]] = {"inputs": inputs, "outputs": outputs}
    finally:
        for fd in fds:
            os.close(fd)
    current = devices(side)
    return dict((addresses[key][0], report) for key, report in reports.items()
                if current.get(key) == addresses[key])


print(json.dumps(snapshot(sys.argv[1])))
