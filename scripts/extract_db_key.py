#!/usr/bin/env python3
"""
Extract WeChat macOS SQLCipher database key from running process memory.

Usage:
    1. Make sure WeChat is running
    2. Run: python3 extract_db_key.py
    3. The key will be saved to ~/.wechat_db_key

This works by scanning WeChat's wechat.dylib DATA segment for 64-character
hex strings that are the SQLCipher raw key.
"""

import subprocess
import sys
import os
import re
import struct
import ctypes
import ctypes.util

def find_wechat_pid():
    result = subprocess.run(['pgrep', '-x', 'WeChat'], capture_output=True, text=True)
    pids = result.stdout.strip().split('\n')
    pids = [p for p in pids if p]
    if not pids:
        return None
    return int(pids[0])

def extract_key_via_vmmap(pid):
    """Extract key by scanning memory regions via vmmap + memory read"""
    # Get memory map
    result = subprocess.run(['vmmap', str(pid)], capture_output=True, text=True, timeout=10)

    # Find wechat.dylib DATA regions
    data_regions = []
    for line in result.stdout.split('\n'):
        if 'wechat.dylib' in line and ('__DATA' in line or 'DATA' in line):
            parts = line.split()
            for part in parts:
                if '-' in part and all(c in '0123456789abcdefABCDEF-' for c in part):
                    addrs = part.split('-')
                    if len(addrs) == 2:
                        try:
                            start = int(addrs[0], 16)
                            end = int(addrs[1], 16)
                            data_regions.append((start, end))
                        except ValueError:
                            pass

    print(f"Found {len(data_regions)} DATA regions in wechat.dylib")
    return data_regions

def extract_key_via_lldb(pid):
    """Extract key using lldb to read process memory"""

    lldb_commands = f"""
target create ""
process attach --pid {pid}
# Scan for 64-char hex strings in wechat.dylib's writable segments
script
import lldb
target = lldb.debugger.GetSelectedTarget()
process = target.GetProcess()
candidates = []
for module in target.modules:
    name = str(module.file)
    if 'wechat.dylib' not in name:
        continue
    print(f"Scanning {{name}}")
    for section in module.sections:
        sname = section.GetName()
        if sname and ('DATA' in sname.upper() or 'data' in sname.lower() or 'bss' in sname.lower()):
            addr = section.GetLoadAddress(target)
            size = section.GetByteSize()
            if addr == lldb.LLDB_INVALID_ADDRESS or size == 0:
                continue
            print(f"  Section {{sname}}: {{hex(addr)}} size={{size}}")
            # Read in 256KB chunks
            chunk = min(size, 256*1024)
            for off in range(0, size, chunk):
                rsz = min(chunk, size - off)
                err = lldb.SBError()
                data = process.ReadMemory(addr + off, rsz, err)
                if not err.Success() or not data:
                    continue
                # Scan for 64-char hex strings
                for i in range(len(data) - 64):
                    try:
                        txt = data[i:i+64].decode('ascii')
                        if all(c in '0123456789abcdef' for c in txt):
                            # Check it's not trivial
                            if len(set(txt)) > 6:
                                # Check boundaries - should NOT be preceded/followed by hex chars
                                before_ok = i == 0 or chr(data[i-1]) not in '0123456789abcdef'
                                after_ok = i+64 >= len(data) or chr(data[i+64]) not in '0123456789abcdef'
                                if before_ok and after_ok:
                                    loc = hex(addr + off + i)
                                    print(f"  CANDIDATE at {{loc}}: {{txt}}")
                                    candidates.append(txt)
                    except:
                        pass

if candidates:
    # Deduplicate
    unique = list(dict.fromkeys(candidates))
    for k in unique:
        print(f"DB_KEY:{{k}}")
else:
    print("NO_KEY_FOUND")

process.Detach()
quit
"""

    result = subprocess.run(
        ['lldb', '-b'],
        input=lldb_commands,
        capture_output=True, text=True, timeout=60
    )

    output = result.stdout + result.stderr

    keys = []
    for line in output.split('\n'):
        if line.strip().startswith('DB_KEY:'):
            key = line.strip().split('DB_KEY:')[1]
            keys.append(key)
        elif 'CANDIDATE' in line:
            print(line.strip())

    return keys

def verify_key(key, db_path):
    """Verify a key works by trying to open a database with it"""
    sqlcipher = '/opt/homebrew/bin/sqlcipher'
    if not os.path.exists(sqlcipher):
        sqlcipher = 'sqlcipher'

    commands = f"""PRAGMA key = "x'{key}'";
PRAGMA cipher_compatibility = 4;
SELECT count(*) FROM sqlite_master;
.quit
"""
    try:
        result = subprocess.run(
            [sqlcipher, db_path],
            input=commands,
            capture_output=True, text=True, timeout=5
        )
        output = result.stdout.strip()
        # If we get a number back, the key worked
        for line in output.split('\n'):
            try:
                count = int(line.strip())
                if count >= 0:
                    return True
            except ValueError:
                continue
    except Exception as e:
        print(f"  Verify error: {e}")

    return False

def main():
    pid = find_wechat_pid()
    if not pid:
        print("WeChat is not running. Please start WeChat first.")
        print("The DB encryption key can only be extracted from a running WeChat process.")
        sys.exit(1)

    print(f"WeChat PID: {pid}")

    # Find the contact.db path for verification
    container = os.path.expanduser("~/Library/Containers/com.tencent.xinWeChat/Data/Documents")
    xwechat = os.path.join(container, "xwechat_files")
    db_path = None

    if os.path.exists(xwechat):
        for entry in os.listdir(xwechat):
            if entry.startswith("wxid_"):
                test_path = os.path.join(xwechat, entry, "db_storage", "contact", "contact.db")
                if os.path.exists(test_path):
                    db_path = test_path
                    break

    print(f"DB path for verification: {db_path}")
    print()
    print("Extracting key via lldb (this may trigger a security prompt)...")
    print()

    keys = extract_key_via_lldb(pid)

    if not keys:
        print("\nNo key candidates found.")
        print("Try running with sudo, or ensure WeChat has been fully loaded.")
        sys.exit(1)

    print(f"\nFound {len(keys)} key candidate(s)")

    # Verify each candidate
    valid_key = None
    if db_path:
        for key in keys:
            print(f"Verifying key: {key[:8]}...{key[-8:]}")
            if verify_key(key, db_path):
                print(f"  VALID!")
                valid_key = key
                break
            else:
                print(f"  invalid")
    else:
        # Can't verify, use first candidate
        valid_key = keys[0]
        print(f"Cannot verify (no DB found), using first candidate")

    if valid_key:
        key_path = os.path.expanduser("~/.wechat_db_key")
        with open(key_path, 'w') as f:
            f.write(valid_key)
        os.chmod(key_path, 0o600)
        print(f"\nKey saved to {key_path}")
        print(f"Key: {valid_key}")
    else:
        print("\nNo valid key found among candidates.")
        print("The key format may have changed in this WeChat version.")
        sys.exit(1)

if __name__ == '__main__':
    main()
