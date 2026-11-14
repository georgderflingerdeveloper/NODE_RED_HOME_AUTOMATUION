"""Deterministic tests for /proc parsing and interval CPU accounting."""
import importlib.util
import sys
import unittest
from pathlib import Path
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('host_monitor', Path(__file__).parents[1]/'tools/host-monitor/collect.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)

class HostMonitorTests(unittest.TestCase):
    def test_process_names_with_spaces_and_parentheses(self):
        fields = ['0']*40
        fields[0]='S';fields[11]='123';fields[12]='77';fields[17]='4';fields[19]='999';fields[21]='25';fields[36]='7'
        item=monitor.parse_process_stat('42 (worker (safe) name) '+' '.join(fields),4096)
        self.assertEqual(item['name'],'worker (safe) name')
        self.assertEqual(item['ticks'],200)
        self.assertEqual(item['lastCpu'],7)
        self.assertEqual(item['resident'],102400)

    def test_normalization_pid_reuse_and_memory_ranking(self):
        def item(pid,ticks,started=1,memory=100):
            return dict(pid=pid,name='worker',ticks=ticks,started=started,resident=memory,lastCpu=3,threads=2,state='S')
        before={1:item(1,100),2:item(2,100),3:item(3,0)}
        after={1:item(1,200),2:item(2,900,started=2),3:item(3,25,memory=900),4:item(4,1000)}
        result=monitor.process_usage(before,after,1,4,1000,100)
        self.assertEqual([p['pid'] for p in result['topCpu']],[1,3])
        self.assertEqual(result['topCpu'][0]['cpuPercent'],100)
        self.assertEqual(result['topCpu'][0]['hostCpuPercent'],25)
        self.assertEqual(result['topMemory'][0]['pid'],3)
        self.assertEqual(result['topMemory'][0]['memoryPercent'],90)
        self.assertEqual(result['measuredCount'],2)

if __name__ == '__main__': unittest.main()
