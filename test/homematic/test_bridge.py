import unittest
import importlib.util
import tempfile
import pathlib
import json
import asyncio
import contextlib
import io
import sys
import types
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('bridge','tools/homematic/bridge.py')
bridge=importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
class Tests(unittest.TestCase):
    def test_sanitize(self):
        self.assertEqual(bridge.sanitize({'authToken':'secret','channels':[{'on':False,'level':0,'PIN':'1'}]}),{'channels':[{'on':False,'level':0}]})
    def test_private_atomic_credentials(self):
        with tempfile.TemporaryDirectory() as d, patch.object(bridge,'ROOT',pathlib.Path(d)/'private'):
            bridge.save_credentials({'authToken':'test'})
            file=bridge.ROOT/'credentials.json'
            self.assertEqual(file.stat().st_mode & 0o777,0o600)
            self.assertEqual(bridge.ROOT.stat().st_mode & 0o777,0o700)
            self.assertFalse((bridge.ROOT/'credentials.tmp').exists())
    def test_sdk_snapshot(self):
        class FakeHome:
            async def init_async(self, access, token):
                assert access=='access' and token=='secret'
            async def download_configuration_async(self):
                return {'home':{'connected':True,'location':'private'},'clients':{'token':'secret'},'devices':{'a':{'label':'Lampe','authToken':'secret'}},'groups':{}}
        fake=types.ModuleType('homematicip.async_home');fake.AsyncHome=FakeHome
        with tempfile.TemporaryDirectory() as d, patch.object(bridge,'ROOT',pathlib.Path(d)), patch.dict(sys.modules,{'homematicip':types.ModuleType('homematicip'),'homematicip.async_home':fake}):
            (bridge.ROOT/'credentials.json').write_text(json.dumps({'accessPoint':'access','authToken':'secret'}))
            output=io.StringIO()
            with contextlib.redirect_stdout(output):asyncio.run(bridge.snapshot())
            data=json.loads(output.getvalue());self.assertTrue(data['connected']);self.assertEqual(data['devices']['a']['label'],'Lampe');self.assertNotIn('secret',output.getvalue());self.assertNotIn('location',output.getvalue())
if __name__=='__main__':unittest.main()
