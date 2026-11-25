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

ALLOWED = {"east": ("345764", "346077"), "west": ("348403",), "ante": ("311893",)}


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
        while fds and time.time() < end:
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
                    key = fields[3]
                    report = {"inputs": inputs, "outputs": outputs}
                    if side == "ante":
                        previous = reports.get(key)
                        # HomeControl toggles output 15 every 500 ms.
                        report["heartbeat"] = bool(previous and (previous["outputs"] ^ outputs) & (1 << 15))
                    reports[key] = report
            if len(reports) == len(addresses) and (side != "ante" or any(r["heartbeat"] for r in reports.values())):
                break
    finally:
        for fd in fds:
            os.close(fd)
    current = devices(side)
    return dict((addresses[key][0], report) for key, report in reports.items()
                if current.get(key) == addresses[key])


def application(side):
    """Verify the room program owns the command socket and its USB devices."""
    name = "HomeControl.exe" if side == "ante" else "light.exe"
    with open("/proc/net/udp") as handle:
        sockets = set("socket:[%s]" % row[9] for row in
                      (line.split() for line in handle.readlines()[1:])
                      if len(row) > 9 and row[1].endswith(":2710"))  # UDP 10000
    for proc in glob.glob("/proc/[0-9]*"):
        try:
            args = value(proc, "cmdline").split("\0")
            if not args or not os.path.basename(args[0]).startswith("mono") or not any(
                    os.path.basename(arg) == name for arg in args[1:]):
                continue
            handles = set()
            for fd in glob.glob(proc + "/fd/*"):
                try:
                    handles.add(os.readlink(fd))
                except OSError:
                    continue
            if sockets.intersection(handles):
                attached = []
                for address, (serial, bus) in devices(side).items():
                    device = int(address.split(":")[2])
                    if "/dev/bus/usb/%03d/%03d" % (bus, device) in handles:
                        attached.append(serial)
                return {"listening": True, "attached": attached}
        except (IOError, OSError, ValueError):
            continue
    return {"listening": False, "attached": []}


side = sys.argv[1]
# Bestehende Leser greifen direkt per Seriennummer auf die Karten zu.
result = snapshot(side)
result["application"] = application(side)
print(json.dumps(result))
