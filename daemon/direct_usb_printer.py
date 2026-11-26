#!/usr/bin/env python3
"""
Direct Zero-CUPS USB Printer Transport (ctypes libusb-1.0)
==========================================================
Streams pre-rendered ESC/P-R or ESC/P2 print bytes straight from Python RAM
to a USB printer's Class 7 Bulk OUT endpoint without passing through lp / cupsd /
/var/spool/cups / CUPS's usb backend.

Features:
- Exact byte-count verification (handles partial writes on LIBUSB_ERROR_TIMEOUT)
- Periodic non-blocking Bulk IN drain (clears Epson @EJL / BDC status buffers)
- Dynamic interface & Bulk OUT/IN endpoint discovery from device descriptors
- Clean udev/plugdev zero-sudo execution on Raspberry Pi
"""

import ctypes
import ctypes.util
import time
import urllib.parse

LIBUSB_SUCCESS = 0
LIBUSB_ERROR_TIMEOUT = -7
LIBUSB_ERROR_PIPE = -9
LIBUSB_ERROR_INTERRUPTED = -10
LIBUSB_ERROR_NO_DEVICE = -4

USB_CLASS_PRINTER = 0x07
ENDPOINT_DIR_MASK = 0x80
ENDPOINT_IN = 0x80
ENDPOINT_OUT = 0x00
TRANSFER_TYPE_MASK = 0x03
TRANSFER_TYPE_BULK = 0x02


class _EndpointDescriptor(ctypes.Structure):
    _fields_ = [
        ("bLength", ctypes.c_uint8),
        ("bDescriptorType", ctypes.c_uint8),
        ("bEndpointAddress", ctypes.c_uint8),
        ("bmAttributes", ctypes.c_uint8),
        ("wMaxPacketSize", ctypes.c_uint16),
        ("bInterval", ctypes.c_uint8),
        ("bRefresh", ctypes.c_uint8),
        ("bSynchAddress", ctypes.c_uint8),
        ("extra", ctypes.POINTER(ctypes.c_uint8)),
        ("extra_length", ctypes.c_int),
    ]


class _InterfaceDescriptor(ctypes.Structure):
    _fields_ = [
        ("bLength", ctypes.c_uint8),
        ("bDescriptorType", ctypes.c_uint8),
        ("bInterfaceNumber", ctypes.c_uint8),
        ("bAlternateSetting", ctypes.c_uint8),
        ("bNumEndpoints", ctypes.c_uint8),
        ("bInterfaceClass", ctypes.c_uint8),
        ("bInterfaceSubClass", ctypes.c_uint8),
        ("bInterfaceProtocol", ctypes.c_uint8),
        ("iInterface", ctypes.c_uint8),
        ("endpoint", ctypes.POINTER(_EndpointDescriptor)),
        ("extra", ctypes.POINTER(ctypes.c_uint8)),
        ("extra_length", ctypes.c_int),
    ]


class _Interface(ctypes.Structure):
    _fields_ = [
        ("altsetting", ctypes.POINTER(_InterfaceDescriptor)),
        ("num_altsetting", ctypes.c_int),
    ]


class _ConfigDescriptor(ctypes.Structure):
    _fields_ = [
        ("bLength", ctypes.c_uint8),
        ("bDescriptorType", ctypes.c_uint8),
        ("wTotalLength", ctypes.c_uint16),
        ("bNumInterfaces", ctypes.c_uint8),
        ("bConfigurationValue", ctypes.c_uint8),
        ("iConfiguration", ctypes.c_uint8),
        ("bmAttributes", ctypes.c_uint8),
        ("MaxPower", ctypes.c_uint8),
        ("interface", ctypes.POINTER(_Interface)),
        ("extra", ctypes.POINTER(ctypes.c_uint8)),
        ("extra_length", ctypes.c_int),
    ]


class _DeviceDescriptor(ctypes.Structure):
    _fields_ = [
        ("bLength", ctypes.c_uint8),
        ("bDescriptorType", ctypes.c_uint8),
        ("bcdUSB", ctypes.c_uint16),
        ("bDeviceClass", ctypes.c_uint8),
        ("bDeviceSubClass", ctypes.c_uint8),
        ("bDeviceProtocol", ctypes.c_uint8),
        ("bMaxPacketSize0", ctypes.c_uint8),
        ("idVendor", ctypes.c_uint16),
        ("idProduct", ctypes.c_uint16),
        ("bcdDevice", ctypes.c_uint16),
        ("iManufacturer", ctypes.c_uint8),
        ("iProduct", ctypes.c_uint8),
        ("iSerialNumber", ctypes.c_uint8),
        ("bNumConfigurations", ctypes.c_uint8),
    ]


_LIB = None


def _load_libusb():
    """Loads and binds libusb-1.0.so.0 via ctypes once."""
    global _LIB
    if _LIB is not None:
        return _LIB
    path = ctypes.util.find_library("usb-1.0")
    if not path:
        raise RuntimeError("libusb-1.0 shared library not found")
    lib = ctypes.CDLL(path)
    lib.libusb_init.argtypes = [ctypes.POINTER(ctypes.c_void_p)]
    lib.libusb_init.restype = ctypes.c_int
    lib.libusb_exit.argtypes = [ctypes.c_void_p]
    lib.libusb_get_device_list.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))]
    lib.libusb_get_device_list.restype = ctypes.c_ssize_t
    lib.libusb_free_device_list.argtypes = [ctypes.POINTER(ctypes.c_void_p), ctypes.c_int]
    lib.libusb_get_device_descriptor.argtypes = [ctypes.c_void_p, ctypes.POINTER(_DeviceDescriptor)]
    lib.libusb_get_device_descriptor.restype = ctypes.c_int
    lib.libusb_get_active_config_descriptor.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.POINTER(_ConfigDescriptor))]
    lib.libusb_get_active_config_descriptor.restype = ctypes.c_int
    lib.libusb_free_config_descriptor.argtypes = [ctypes.POINTER(_ConfigDescriptor)]
    lib.libusb_open.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
    lib.libusb_open.restype = ctypes.c_int
    lib.libusb_close.argtypes = [ctypes.c_void_p]
    lib.libusb_get_string_descriptor_ascii.argtypes = [ctypes.c_void_p, ctypes.c_uint8, ctypes.c_char_p, ctypes.c_int]
    lib.libusb_get_string_descriptor_ascii.restype = ctypes.c_int
    lib.libusb_set_auto_detach_kernel_driver.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.libusb_set_auto_detach_kernel_driver.restype = ctypes.c_int
    lib.libusb_claim_interface.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.libusb_claim_interface.restype = ctypes.c_int
    lib.libusb_release_interface.argtypes = [ctypes.c_void_p, ctypes.c_int]
    lib.libusb_release_interface.restype = ctypes.c_int
    lib.libusb_clear_halt.argtypes = [ctypes.c_void_p, ctypes.c_uint8]
    lib.libusb_clear_halt.restype = ctypes.c_int
    lib.libusb_bulk_transfer.argtypes = [
        ctypes.c_void_p, ctypes.c_uint8, ctypes.c_char_p, ctypes.c_int,
        ctypes.POINTER(ctypes.c_int), ctypes.c_uint
    ]
    lib.libusb_bulk_transfer.restype = ctypes.c_int
    lib.libusb_control_transfer.argtypes = [
        ctypes.c_void_p, ctypes.c_uint8, ctypes.c_uint8, ctypes.c_uint16,
        ctypes.c_uint16, ctypes.c_char_p, ctypes.c_uint16, ctypes.c_uint
    ]
    lib.libusb_control_transfer.restype = ctypes.c_int
    _LIB = lib
    return lib


def _parse_uri_hints(queue_uri: str):
    """Extracts expected serial / make / model hints from a CUPS usb:// URI."""
    if not queue_uri or not queue_uri.lower().startswith("usb://"):
        return None, None
    parsed = urllib.parse.urlparse(queue_uri)
    qs = urllib.parse.parse_qs(parsed.query)
    serial = (qs.get("serial") or [None])[0]
    model_hint = urllib.parse.unquote((parsed.netloc + parsed.path).strip("/")).lower()
    return serial, model_hint


def _find_printer_handle(lib, ctx, queue_uri: str = ""):
    """Finds and opens a USB Class 7 printer matching queue_uri (or first Epson/USB printer)."""
    serial_hint, model_hint = _parse_uri_hints(queue_uri)
    dev_list = ctypes.POINTER(ctypes.c_void_p)()
    count = lib.libusb_get_device_list(ctx, ctypes.byref(dev_list))
    if count < 0:
        raise RuntimeError(f"libusb_get_device_list failed: {count}")

    try:
        candidates = []
        for idx in range(count):
            dev = dev_list[idx]
            desc = _DeviceDescriptor()
            if lib.libusb_get_device_descriptor(dev, ctypes.byref(desc)) != 0:
                continue
            if desc.idVendor == 0x1D6B:
                continue  # skip root hubs
            cfg = ctypes.POINTER(_ConfigDescriptor)()
            if lib.libusb_get_active_config_descriptor(dev, ctypes.byref(cfg)) != 0:
                continue
            try:
                printer_if = None
                for i_idx in range(cfg.contents.bNumInterfaces):
                    iface = cfg.contents.interface[i_idx]
                    for alt_idx in range(iface.num_altsetting):
                        alt = iface.altsetting[alt_idx]
                        if alt.bInterfaceClass != USB_CLASS_PRINTER:
                            continue
                        ep_out = ep_in = None
                        for e_idx in range(alt.bNumEndpoints):
                            ep = alt.endpoint[e_idx]
                            if (ep.bmAttributes & TRANSFER_TYPE_MASK) != TRANSFER_TYPE_BULK:
                                continue
                            if (ep.bEndpointAddress & ENDPOINT_DIR_MASK) == ENDPOINT_OUT and ep_out is None:
                                ep_out = ep.bEndpointAddress
                            elif (ep.bEndpointAddress & ENDPOINT_DIR_MASK) == ENDPOINT_IN and ep_in is None:
                                ep_in = ep.bEndpointAddress
                        if ep_out is not None:
                            printer_if = (alt.bInterfaceNumber, ep_out, ep_in)
                            break
                    if printer_if is not None:
                        break
                if printer_if is not None:
                    candidates.append((dev, desc, printer_if))
            finally:
                lib.libusb_free_config_descriptor(cfg)

        if not candidates:
            raise RuntimeError("No USB Class 7 printer device found on USB bus")

        chosen = None
        last_open_err = 0
        for dev, desc, p_if in candidates:
            handle = ctypes.c_void_p()
            rc = lib.libusb_open(dev, ctypes.byref(handle))
            if rc != 0:
                last_open_err = rc
                continue
            ser_buf = ctypes.create_string_buffer(128)
            prod_buf = ctypes.create_string_buffer(128)
            ser = ""
            prod = ""
            if desc.iSerialNumber:
                n = lib.libusb_get_string_descriptor_ascii(handle, desc.iSerialNumber, ser_buf, 128)
                if n > 0:
                    ser = ser_buf.value.decode("ascii", "ignore").strip()
            if desc.iProduct:
                n = lib.libusb_get_string_descriptor_ascii(handle, desc.iProduct, prod_buf, 128)
                if n > 0:
                    prod = prod_buf.value.decode("ascii", "ignore").strip()

            if serial_hint and ser and ser == serial_hint:
                chosen = (handle, desc.idVendor, desc.idProduct, p_if[0], p_if[1], p_if[2], prod or ser)
                break
            if chosen is None:
                if not model_hint or (prod and any(tok in model_hint for tok in prod.lower().split() if len(tok) > 2)):
                    chosen = (handle, desc.idVendor, desc.idProduct, p_if[0], p_if[1], p_if[2], prod or f"{desc.idVendor:04x}:{desc.idProduct:04x}")
                    if not serial_hint:
                        break
                else:
                    lib.libusb_close(handle)
            else:
                lib.libusb_close(handle)

        if chosen is None:
            raise RuntimeError(f"Could not open matching USB printer (last libusb_open rc={last_open_err})")
        return chosen
    finally:
        lib.libusb_free_device_list(dev_list, 1)


def _parse_bdc_status(raw_bytes: bytes) -> dict:
    """Parses Epson @BDC ST2 status packets returned on Bulk IN (0x83)."""
    idx = raw_bytes.rfind(b"@BDC ST2\r\n")
    if idx < 0 or idx + 12 > len(raw_bytes):
        return {}
    body = raw_bytes[idx + 12:]
    info = {}
    i = 0
    while i + 2 <= len(body):
        tag = body[i]
        ln = body[i + 1]
        if i + 2 + ln > len(body):
            break
        val = body[i + 2:i + 2 + ln]
        if tag == 0x01 and ln >= 1:
            code = val[0]
            state_map = {0x00: "error", 0x01: "self_test", 0x02: "busy", 0x03: "waiting", 0x04: "idle", 0x07: "cleaning"}
            info["status_code"] = code
            info["state"] = state_map.get(code, f"0x{code:02x}")
        elif tag == 0x02 and ln >= 1:
            info["error_code"] = val[0]
        elif tag == 0x04 and ln >= 1:
            info["warning_code"] = val[0]
        i += 2 + ln
        if tag == 0x19:
            break
    return info


def _drain_bulk_in(lib, handle, ep_in, rx_buf, timeout_ms=5, max_reads=4, status_out=None):
    """Non-blocking drain of printer Bulk IN buffer so @EJL/BDC replies never stall the printer."""
    if ep_in is None:
        return 0
    drained = 0
    actual = ctypes.c_int(0)
    last_pkt = b""
    for _ in range(max_reads):
        rc = lib.libusb_bulk_transfer(handle, ep_in, rx_buf, len(rx_buf), ctypes.byref(actual), timeout_ms)
        if rc == 0 and actual.value > 0:
            n = int(actual.value)
            drained += n
            last_pkt = rx_buf.raw[:n]
            if status_out is not None:
                parsed = _parse_bdc_status(last_pkt)
                if parsed:
                    status_out.update(parsed)
            if n < len(rx_buf):
                break
        else:
            break
    return drained


def probe_usb_printer(queue_uri: str = "") -> dict:
    """Safely opens Interface 1, reads IEEE-1284 Device ID, drains Bulk IN, and releases cleanly (prints 0 ink)."""
    lib = _load_libusb()
    ctx = ctypes.c_void_p()
    rc = lib.libusb_init(ctypes.byref(ctx))
    if rc != 0:
        raise RuntimeError(f"libusb_init failed: {rc}")
    handle = None
    iface_num = None
    try:
        handle, vid, pid, iface_num, ep_out, ep_in, label = _find_printer_handle(lib, ctx, queue_uri)
        lib.libusb_set_auto_detach_kernel_driver(handle, 1)
        rc_c = lib.libusb_claim_interface(handle, iface_num)
        if rc_c != 0:
            raise RuntimeError(f"libusb_claim_interface({iface_num}) failed: {rc_c}")
        id_buf = ctypes.create_string_buffer(512)
        n = lib.libusb_control_transfer(handle, 0xA1, 0, 0, iface_num, id_buf, 512, 1500)
        dev_id = id_buf.raw[2:n].decode("ascii", "ignore") if n > 2 else ""
        rx_buf = ctypes.create_string_buffer(256)
        bdc = {}
        drained = _drain_bulk_in(lib, handle, ep_in, rx_buf, timeout_ms=25, max_reads=8, status_out=bdc)
        return {
            "vid": f"{vid:04x}",
            "pid": f"{pid:04x}",
            "label": label,
            "interface": iface_num,
            "ep_out": f"0x{ep_out:02x}",
            "ep_in": f"0x{ep_in:02x}" if ep_in is not None else None,
            "device_id": dev_id,
            "drained_in_bytes": drained,
            "bdc_status": bdc,
        }
    finally:
        if handle is not None:
            if iface_num is not None:
                try:
                    lib.libusb_release_interface(handle, iface_num)
                except Exception:
                    pass
            lib.libusb_close(handle)
        lib.libusb_exit(ctx)


def send_prn_direct_usb(
    prn_path: str,
    queue_uri: str = "",
    copies: int = 1,
    chunk_bytes: int = 8192,
    write_timeout_ms: int = 8000,
    max_stall_sec: float = 120.0,
    wait_idle_sec: float = 45.0,
    log_fn=None,
):
    """
    Streams a complete ESC/P-R or ESC/P2 file directly to the USB printer over libusb-1.0.
    Guarantees 100% byte-counted delivery with Bulk-IN draining, timeout diagnostics,
    and post-transfer @BDC ST2 idle wait so USB is never closed mid-page.
    """
    with open(prn_path, "rb") as f:
        payload = f.read()
    total_len = len(payload)
    if total_len == 0:
        raise ValueError("Empty printer payload")

    lib = _load_libusb()
    ctx = ctypes.c_void_p()
    rc = lib.libusb_init(ctypes.byref(ctx))
    if rc != 0:
        raise RuntimeError(f"libusb_init failed: {rc}")

    handle = None
    iface_num = None
    n_copies = max(1, int(copies or 1))
    rx_buf = ctypes.create_string_buffer(256)
    t_start = time.monotonic()

    try:
        handle, vid, pid, iface_num, ep_out, ep_in, label = _find_printer_handle(lib, ctx, queue_uri)
        lib.libusb_set_auto_detach_kernel_driver(handle, 1)
        rc_c = lib.libusb_claim_interface(handle, iface_num)
        if rc_c != 0:
            raise RuntimeError(f"libusb_claim_interface({iface_num}) failed: {rc_c}")

        # Drain stale @EJL/BDC reply bytes & inspect printer pre-flight status before streaming
        bdc = {}
        pre_drained = _drain_bulk_in(lib, handle, ep_in, rx_buf, timeout_ms=15, max_reads=8, status_out=bdc)
        if log_fn:
            st_desc = bdc.get("state", "unknown")
            log_fn(f"[DirectUSB] Claimed {label} ({vid:04x}:{pid:04x} if={iface_num} ep_out=0x{ep_out:02x}, drained {pre_drained}B, state={st_desc})")

        total_bytes_all = 0
        total_drained = pre_drained
        timeout_retries = 0
        pipe_clears = 0
        mv = memoryview(payload)

        for copy_idx in range(1, n_copies + 1):
            offset = 0
            last_progress_time = time.monotonic()
            next_log_pct = 25
            actual = ctypes.c_int(0)
            drain_counter = 0

            while offset < total_len:
                to_send = min(chunk_bytes, total_len - offset)
                chunk_bytes_obj = bytes(mv[offset:offset + to_send])
                rc_w = lib.libusb_bulk_transfer(
                    handle, ep_out, chunk_bytes_obj, to_send, ctypes.byref(actual), write_timeout_ms
                )
                written = max(0, int(actual.value))
                if written > 0:
                    offset += written
                    last_progress_time = time.monotonic()

                if rc_w == LIBUSB_SUCCESS:
                    drain_counter += 1
                    if ep_in is not None and (drain_counter % 8 == 0):
                        total_drained += _drain_bulk_in(lib, handle, ep_in, rx_buf, timeout_ms=2, max_reads=2, status_out=bdc)
                elif rc_w in (LIBUSB_ERROR_TIMEOUT, LIBUSB_ERROR_INTERRUPTED):
                    timeout_retries += 1
                    if ep_in is not None:
                        total_drained += _drain_bulk_in(lib, handle, ep_in, rx_buf, timeout_ms=10, max_reads=4, status_out=bdc)
                    if (time.monotonic() - last_progress_time) > max_stall_sec:
                        raise RuntimeError(
                            f"DirectUSB stalled at {offset}/{total_len} bytes ({offset * 100.0 / total_len:.1f}%) for >{max_stall_sec:.0f}s [bdc={bdc}]"
                        )
                    time.sleep(0.01)
                elif rc_w == LIBUSB_ERROR_PIPE:
                    pipe_clears += 1
                    lib.libusb_clear_halt(handle, ep_out)
                    if (time.monotonic() - last_progress_time) > max_stall_sec:
                        raise RuntimeError(f"DirectUSB pipe halt stuck at {offset}/{total_len} bytes [bdc={bdc}]")
                    time.sleep(0.05)
                else:
                    raise RuntimeError(f"DirectUSB write error rc={rc_w} at {offset}/{total_len} bytes [bdc={bdc}]")

                pct = int((offset * 100) / total_len)
                if log_fn and pct >= next_log_pct and next_log_pct < 100:
                    elapsed = max(0.01, time.monotonic() - t_start)
                    log_fn(f"[DirectUSB] Copy {copy_idx}/{n_copies}: {pct}% ({offset}/{total_len} B, {(total_bytes_all + offset) / 1024.0 / elapsed:.0f} KB/s)")
                    next_log_pct += 25

            total_bytes_all += offset
            total_drained += _drain_bulk_in(lib, handle, ep_in, rx_buf, timeout_ms=25, max_reads=8, status_out=bdc)

        tx_elapsed = max(0.01, time.monotonic() - t_start)
        # Keep USB open & Bulk IN drained while printer finishes ejecting buffered tail bands
        if ep_in is not None and wait_idle_sec > 0:
            idle_deadline = time.monotonic() + wait_idle_sec
            # Give printer up to 1.2s to emit a fresh @BDC ST2 busy packet after final write
            probe_until = min(idle_deadline, time.monotonic() + 1.2)
            while time.monotonic() < probe_until:
                d_n = _drain_bulk_in(lib, handle, ep_in, rx_buf, timeout_ms=100, max_reads=4, status_out=bdc)
                total_drained += d_n
                if bdc.get("status_code") in (0x00, 0x02, 0x03):
                    break
                time.sleep(0.1)
            while time.monotonic() < idle_deadline and bdc.get("status_code") in (0x02, 0x03):
                total_drained += _drain_bulk_in(lib, handle, ep_in, rx_buf, timeout_ms=100, max_reads=4, status_out=bdc)
                time.sleep(0.15)

        total_elapsed = max(0.01, time.monotonic() - t_start)
        if log_fn:
            fin_state = bdc.get("state", "unknown")
            err_note = f" err={bdc['error_code']}" if "error_code" in bdc else ""
            log_fn(
                f"[DirectUSB] Verified 100% ({total_bytes_all} B across {n_copies} copy/copies in {tx_elapsed:.2f}s TX / {total_elapsed:.2f}s total @ "
                f"{total_bytes_all / 1024.0 / tx_elapsed:.0f} KB/s, rx_drained={total_drained} B, retries={timeout_retries}, state={fin_state}{err_note})"
            )
        return total_bytes_all
    finally:
        if handle is not None:
            if iface_num is not None:
                try:
                    lib.libusb_release_interface(handle, iface_num)
                except Exception:
                    pass
            lib.libusb_close(handle)
        lib.libusb_exit(ctx)
