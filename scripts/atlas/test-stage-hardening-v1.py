import importlib.util
import io
import pathlib
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch

SCRIPT=pathlib.Path(__file__).with_name('stage-recommendation-evidence-hardening-v1.py')
spec=importlib.util.spec_from_file_location('stage_patch',SCRIPT)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class StagePatchTests(unittest.TestCase):
    def setUp(self):
        self.td=tempfile.TemporaryDirectory()
        self.addCleanup(self.td.cleanup)
        self.root=pathlib.Path(self.td.name)
        self.source=self.root/mod.REL
        self.source.parent.mkdir(parents=True,exist_ok=True)
        self.original='// import z from zod\n' + mod.ORIGINAL_COMPILE + '\n' + 'export function recommendationEvidenceFeatureWeightV1(input: unknown) { return 0; }\n'
        self.source.write_text(self.original)
    def run_cli(self,*args):
        return subprocess.run(['python',str(SCRIPT),'--repo-root',str(self.root),*args],capture_output=True,text=True)
    def test_read_only_dry_run(self):
        r=self.run_cli()
        self.assertEqual(r.returncode,0)
        self.assertIn('verifyRecommendationEvidenceBundleV1',r.stdout)
        self.assertEqual(self.source.read_text(),self.original)
        self.assertFalse((self.root/mod.TEST_REL).exists())
    def test_explicit_apply(self):
        r=self.run_cli('--apply')
        self.assertEqual(r.returncode,0,r.stderr)
        self.assertIn('verifyRecommendationEvidenceBundleV1',self.source.read_text())
        self.assertIn("it('rejects sample ordinal-map drift'",(self.root/mod.TEST_REL).read_text())
    def test_no_repeat_apply(self):
        self.run_cli('--apply')
        r=self.run_cli('--apply')
        self.assertNotEqual(r.returncode,0)
        self.assertIn('ALREADY_HARDENED',r.stderr)
    def test_bad_shape_fails_closed(self):
        self.source.write_text('other file')
        r=self.run_cli()
        self.assertNotEqual(r.returncode,0)
        self.assertEqual(self.source.read_text(),'other file')
    def test_diff_file_exclusive_create(self):
        out=self.root/'preview.patch'
        self.assertEqual(self.run_cli('--out',str(out)).returncode,0)
        self.assertIn('--- a/',out.read_text())
        self.assertNotEqual(self.run_cli('--out',str(out)).returncode,0)
if __name__=='__main__':unittest.main(verbosity=2)
