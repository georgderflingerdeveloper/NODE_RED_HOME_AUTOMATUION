#!/usr/bin/env python3
"""Read-only HAP bridge. stdout contains sanitized snapshots, never credentials."""
import asyncio
import getpass
import json
import logging
import os
from pathlib import Path
import re
import sys

logging.disable(logging.CRITICAL)
ROOT = Path(os.environ.get('NODE_RED_USER_DIR', str(Path.home() / '.node-red'))) / 'homematic-ip'
SECRET = re.compile(r'token|password|secret|pin|clientauth', re.I)

def sanitize(value):
    if isinstance(value, dict):
        return {str(k): sanitize(v) for k, v in value.items() if not SECRET.search(str(k))}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    return value

def save_credentials(data):
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(ROOT, 0o700)
    target = ROOT / 'credentials.json'
    temp = ROOT / 'credentials.tmp'
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(data, stream)
    os.replace(temp, target)

async def authorize():
    from homematicip.auth import Auth
    from homematicip.connection.connection_context import ConnectionContextBuilder
    from homematicip.connection.rest_connection import RestConnection
    if (ROOT / 'credentials.json').exists():
        raise RuntimeError('EXISTS')
    access = getpass.getpass('SGTIN vom HAP-Aufkleber (verdeckt): ').replace('-', '').replace(' ', '').upper()
    if not re.fullmatch(r'[0-9A-F]{24}', access):
        raise ValueError('SGTIN')
    pin = getpass.getpass('App-PIN, falls eingerichtet (sonst Enter): ')
    context = await ConnectionContextBuilder.build_context_async(access)
    auth = Auth(RestConnection(context, log_status_exceptions=False), context.client_auth_token, access)
    if pin:
        auth.set_pin(pin)
    result = await auth.connection_request(access, 'GEORGSHOME Node-RED Lesen')
    if result.status != 200:
        raise RuntimeError('AUTH')
    print('Jetzt die Taste am HmIP-HAP kurz drücken. Warte maximal 120 Sekunden.', flush=True)
    async def acknowledge():
        while not await auth.is_request_acknowledged():
            await asyncio.sleep(2)
    await asyncio.wait_for(acknowledge(), timeout=120)
    token = await auth.request_auth_token()
    await auth.confirm_auth_token(token)
    save_credentials({'accessPoint': access, 'authToken': token})
    print('Autorisierung gespeichert. Kein Token ausgegeben.')

async def snapshot():
    from homematicip.async_home import AsyncHome
    credentials = json.loads((ROOT / 'credentials.json').read_text())
    home = AsyncHome()
    await home.init_async(credentials['accessPoint'], credentials['authToken'])
    raw = await home.download_configuration_async()
    if not isinstance(raw, dict) or not isinstance(raw.get('devices'), dict):
        raise ValueError('SCHEMA')
    # Home clients, security journals, location and authentication metadata are not exported.
    result = {'devices': raw['devices'], 'groups': raw.get('groups', {}),
              'connected': raw.get('home', {}).get('connected')}
    print(json.dumps(sanitize(result), allow_nan=False))

if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['authorize']:
            asyncio.run(authorize())
        elif sys.argv[1:] == ['snapshot']:
            asyncio.run(asyncio.wait_for(snapshot(), timeout=40))
        else:
            raise ValueError('COMMAND')
    except (Exception, KeyboardInterrupt):
        # SDK exception messages may include remote response bodies. Never forward them.
        print('Homematic IP: Vorgang fehlgeschlagen. Zugang, PIN, Internet und Cloud prüfen. Vorhandene Zugangsdaten werden nicht überschrieben.', file=sys.stderr)
        sys.exit(1)
