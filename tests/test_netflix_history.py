import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('netflix',Path(__file__).parents[1]/'scripts/import_netflix_history.py')
netflix=importlib.util.module_from_spec(spec);spec.loader.exec_module(netflix)
HEADERS=['Duration','Start Time','Bookmark','Latest Bookmark','Profile Name','Country','Supplemental Video Type','Attributes','Device Type','Title']
ORG=['Riga CSV','Profilo','Inizio originale','Data originale','Titolo','Film o serie','Tipo stimato','Secondi guardati']
def snapshot(items):
 original=[HEADERS];organized=[ORG]
 for i,item in enumerate(items,2):
  profile,title,seconds,extra=item;duration=f'{seconds//3600:02}:{seconds//60%60:02}:{seconds%60:02}'
  o=[duration,'2026-08-20 12:55:29','00:10:00','Not latest view',profile,'IT',extra,'','Chrome',title];original.append(o)
  organized.append([str(i),profile,o[1],'20/08/2026',title,title,'Film / titolo autonomo',str(seconds)])
 return {'original':original,'organized':organized}
class NetflixTests(unittest.TestCase):
 def test_all_gaia_titles_imported_without_catalog_and_harry_potter_excluded(self):
  result=netflix.normalize(snapshot([('GAIA','Film assente',600,''),('GAIA','Harry Potter e la pietra filosofale',700,''),('Altro','Film altro',800,'')]))
  self.assertEqual(result['report']['unique_events'],1);self.assertEqual(result['report']['harry_potter_excluded'],1)
  self.assertIsNone(result['events'][0]['title_id']);self.assertEqual(result['events'][0]['match_status'],'unmatched')
 def test_duration_and_bookmark_are_different(self):
  e=netflix.normalize(snapshot([('GAIA','Film',20,'')]))['events'][0]
  self.assertEqual(e['duration_seconds'],20);self.assertEqual(e['raw_fields']['derived']['bookmark_seconds'],600)
  self.assertIsNone(e['raw_fields']['derived']['latest_bookmark_seconds']);self.assertIsNone(e['time_zone'])
 def test_extras_archived_separately(self):
  e=netflix.normalize(snapshot([('GAIA','Film trailer',4,'TRAILER')]))['events'][0]
  self.assertEqual(e['content_kind'],'other');self.assertIn('supplemental_video',e['quality_flags'])
 def test_duplicate_identity_keeps_largest_duration(self):
  result=netflix.normalize(snapshot([('GAIA','Film',20,''),('GAIA','Film',40,'')]))
  self.assertEqual(result['report']['unique_events'],1);self.assertEqual(result['events'][0]['duration_seconds'],40)
 def test_invalid_source_alignment_fails(self):
  data=snapshot([('GAIA','Film',20,'')]);data['organized'][1][4]='Wrong'
  with self.assertRaises(ValueError):netflix.normalize(data)
if __name__=='__main__':unittest.main()
