import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
import urllib.parse
from collect_metrika import Client, APIError, atomic_json, resolve_goals, weekly_text


class Response(io.StringIO):
    pass


class ExportTests(unittest.TestCase):
    def test_pagination_retains_all_rows_and_timezone(self):
        offsets = []
        def opener(request, timeout):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(request.full_url).query)
            offsets.append(int(query['offset'][0]))
            self.assertEqual(query['timezone'][0], '+03:00')
            return Response(json.dumps({'data':[{'dimensions':[{'name':'/a/'}], 'metrics':[2]}],
                                        'totals':[4], 'total_rows':2, 'sampled':False}))
        result = Client('test-only', '1', opener=opener).report('2026-10-01','2026-10-01',['ym:s:startURLPath'],['ym:s:visits'])
        self.assertEqual(offsets,[1,2]);self.assertEqual(len(result['data']),2)

    def test_unauthorized_does_not_retry_or_overwrite(self):
        count = []
        def opener(request, timeout):
            count.append(1)
            raise urllib.error.HTTPError(request.full_url,401,'Unauthorized',{},None)
        with tempfile.TemporaryDirectory() as tmp:
            file=Path(tmp)/'day.json';atomic_json(file,{'previous':42})
            with self.assertRaises(APIError):
                atomic_json(file,Client('test-only','1',opener=opener).report('2026-10-01','2026-10-01',[],['ym:s:visits']))
            self.assertEqual(json.loads(file.read_text()),{'previous':42});self.assertEqual(len(count),1)

    def test_retry_and_missing_goals_remain_distinct_from_zero(self):
        calls=[];waits=[]
        def opener(request,timeout):
            calls.append(1)
            if len(calls)==1:raise urllib.error.HTTPError(request.full_url,429,'Too Many Requests',{'Retry-After':'1'},None)
            return Response(json.dumps({'data':[], 'totals':[0], 'total_rows':0, 'sampled':False}))
        obj=Client('test-only','1',opener=opener,sleeper=waits.append).report('2026-10-01','2026-10-01',[],['ym:s:visits'])
        self.assertEqual(waits,[1]);self.assertEqual(obj['totals'],[0])
        mapping=resolve_goals([{'id':17,'name':'Чтение','type':'action','conditions':[{'type':'exact','url':'read_50'}]}])
        self.assertEqual(mapping['read_50'],17);self.assertIsNone(mapping['read_90'])

    def test_sampling_rejected(self):
        c=Client('test-only','1',opener=lambda *a,**k:Response(json.dumps({'data':[],'totals':[1],'sampled':True})))
        with self.assertRaises(APIError):c.report('2026-10-01','2026-10-01',[],['ym:s:visits'])


    def test_url_goal_is_not_a_javascript_event(self):
        with self.assertRaises(APIError):resolve_goals([{'id':3,'name':'read_50','type':'url','conditions':[{'type':'exact','url':'read_50'}]}])

    def test_duplicate_and_extra_or_conditions_are_rejected(self):
        event={'id':3,'name':'Reading','type':'action','conditions':[{'type':'exact','url':'read_50'}]}
        with self.assertRaises(APIError):resolve_goals([event,{**event,'id':4}])
        self.assertIsNone(resolve_goals([{**event,'conditions':event['conditions']+[{'type':'exact','url':'other'}]}])['read_50'])

    def test_invalid_totals_are_rejected(self):
        c=Client('test-only','1',opener=lambda *a,**k:Response('{"data":[],"totals":[NaN],"total_rows":0}'))
        with self.assertRaises(APIError):c.report('2026-10-01','2026-10-01',[],['ym:s:visits'])

if __name__=='__main__':unittest.main()
