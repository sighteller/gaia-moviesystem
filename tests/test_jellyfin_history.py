import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('history',Path(__file__).parents[1]/'scripts/import_jellyfin_history.py')
history=importlib.util.module_from_spec(spec);spec.loader.exec_module(history)
class HistoryTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.file=Path(self.tmp.name)/'data.tsv'
  self.catalog=[{'item_id':'a'*32,'title_id':'film','catalog_title':'Film','runtime_minutes':90}]
 def row(self,user='b'*32,duration=700,date='2026-10-04 10:00:00.1234567',kind='Movie'):
  return '\t'.join([date,user,'a'*32,kind,"L'amico",'DirectPlay','Web','Chrome',str(duration)])
 def parse(self,rows):
  self.file.write_text('\n'.join(rows));return history.normalize(self.file,self.catalog)
 def test_both_profiles_preserved_and_one_subject(self):
  batch=self.parse([self.row(),self.row(user='c'*32)])
  self.assertEqual(len(batch['events']),2);self.assertEqual({e['subject'] for e in batch['events']},{'gaia'})
 def test_later_duration_updates_same_identity(self):
  batch=self.parse([self.row(duration=700),self.row(duration=800)])
  self.assertEqual(len(batch['events']),1);self.assertEqual(batch['events'][0]['duration_seconds'],800)
 def test_fractional_precision_and_source_time_preserved(self):
  e=self.parse([self.row()])['events'][0]
  self.assertTrue(e['source_timestamp'].endswith('1234567'));self.assertTrue(e['occurred_local_at'].endswith('123456'));self.assertIsNone(e['time_zone'])
 def test_anomaly_and_zero_are_archived_not_counted_in_ranking(self):
  batch=self.parse([self.row(duration=40000),self.row(duration=0,date='2026-10-05 10:00:00')])
  self.assertEqual(len(batch['events']),2);self.assertEqual(history.summary(batch,self.catalog)['ranking'],[])
 def test_daily_fragments_combine_without_inventing_full_viewings(self):
  batch=self.parse([self.row(duration=300),self.row(duration=300,date='2026-10-04 12:00:00')])
  row=history.summary(batch,self.catalog)['ranking'][0]
  self.assertEqual(row['days_at_least_10_minutes'],1);self.assertEqual(row['events'],2)
 def test_music_and_episodes_never_become_movie_preferences(self):
  batch=self.parse([self.row(kind='MusicVideo'),self.row(kind='Episode',date='2026-10-05 10:00:00')])
  self.assertEqual(history.summary(batch,self.catalog)['ranking'],[])
 def test_malformed_rows_fail_instead_of_partial_import(self):
  with self.assertRaises(ValueError):self.parse([self.row(),'bad\trow'])
if __name__=='__main__':unittest.main()
