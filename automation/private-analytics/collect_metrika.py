#!/usr/bin/env python3
"""Aggregate-only Metrica exporter. Deploy only in a private repository.

No tokens in argv/files, no Logs API, ClientID, IP, search text or URL query.
Each day is replaced atomically only after all reports have been obtained.
API integration still requires an owner's metrika:read token and acceptance run.
"""
import argparse
import collections
import datetime as dt
import json
import math
import os
from pathlib import Path
import statistics
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

API = 'https://api-metrika.yandex.net'
BASE_METRICS = ['ym:s:visits', 'ym:s:users', 'ym:s:pageviews',
                'ym:s:bounceRate', 'ym:s:pageDepth', 'ym:s:avgVisitDurationSeconds']
REPORTS = {
    'summary': [],
    'sources': ['ym:s:lastTrafficSource'],
    'new_returning': ['ym:s:isNewUser', 'ym:s:lastTrafficSource'],
    'search_engines': ['ym:s:lastSearchEngineRoot'],
    'landings': ['ym:s:startURLPath', 'ym:s:lastTrafficSource'],
    'utm': ['ym:s:lastUTMSource', 'ym:s:lastUTMMedium', 'ym:s:lastUTMCampaign', 'ym:s:lastUTMContent'],
    'devices': ['ym:s:deviceCategory'],
    'countries': ['ym:s:regionCountry'],
    'exits': ['ym:s:endURLPath'],
}
EXPECTED_GOALS = ['read_50', 'read_90', 'content_continue', 'home_route',
                  'search_submit', 'search_result_click', 'map_action', 'channel_click', 'source_click']


class APIError(RuntimeError):
    pass


def atomic_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n'
    tmp = None
    try:
        with tempfile.NamedTemporaryFile('w', encoding='utf-8', dir=path.parent,
                                         prefix='.pending-', delete=False) as f:
            tmp = Path(f.name)
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if tmp and tmp.exists():
            tmp.unlink()


class Client:
    def __init__(self, token, counter, opener=urllib.request.urlopen, sleeper=time.sleep):
        if not token or not str(counter).isdigit():
            raise APIError('Set METRIKA_OAUTH_TOKEN and numeric METRIKA_COUNTER_ID')
        self.token, self.counter = token, str(counter)
        self.opener, self.sleeper = opener, sleeper

    def get(self, endpoint, params=None):
        url = API + endpoint + ('?' + urllib.parse.urlencode(params) if params else '')
        request = urllib.request.Request(url, headers={
            'Authorization': 'OAuth ' + self.token,
            'Accept': 'application/json', 'User-Agent': 'KRM-private-analytics/1.0'})
        for attempt in range(5):
            try:
                with self.opener(request, timeout=45) as response:
                    data = json.load(response)
                if data.get('errors'):
                    raise APIError('API returned an error object; retained previous data')
                return data
            except urllib.error.HTTPError as exc:
                if exc.code in (401, 403):
                    raise APIError(f'Access failure HTTP {exc.code}; retained previous data') from None
                if exc.code not in (429, 500, 502, 503, 504) or attempt == 4:
                    raise APIError(f'API HTTP {exc.code}; retained previous data') from None
                delay = min(45, 2 ** attempt * 2)
                if exc.headers and str(exc.headers.get('Retry-After', '')).isdigit():
                    delay = min(45, int(exc.headers['Retry-After']))
                self.sleeper(delay)
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if attempt == 4:
                    raise APIError('Network failure; retained previous data') from None
                self.sleeper(min(45, 2 ** attempt * 2))
            except (ValueError, UnicodeError):
                raise APIError('Invalid JSON response; retained previous data') from None
        raise APIError('Retries exhausted')

    def report(self, start, end, dimensions, metrics):
        if len(metrics) > 20 or len(dimensions) > 10:
            raise APIError('API dimension/metric limit exceeded')
        query = {'ids': self.counter, 'date1': start, 'date2': end,
                 'metrics': ','.join(metrics), 'accuracy': 'full', 'lang': 'ru',
                 'timezone': '+03:00', 'include_undefined': 'true', 'limit': 100000}
        if dimensions:
            query['dimensions'] = ','.join(dimensions)
        rows, offset, first = [], 1, None
        while True:
            obj = self.get('/stat/v1/data', {**query, 'offset': offset})
            if 'data' not in obj or 'totals' not in obj:
                raise APIError('Incomplete API response; retained previous data')
            if obj.get('sampled'):
                raise APIError('Sampling despite accuracy=full; retained previous data')
            if len(obj['totals']) != len(metrics):
                raise APIError('Unexpected metric count')
            if any(v is not None and (isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v)) for v in obj['totals']):
                raise APIError('Invalid totals; retained previous data')
            if first is None:
                first = obj
            elif obj.get('total_rows') != first.get('total_rows') or obj['totals'] != first['totals']:
                raise APIError('Report changed while paginating; repeat export')
            chunk = obj['data']
            for row in chunk:
                if len(row.get('metrics', [])) != len(metrics) or len(row.get('dimensions', [])) != len(dimensions):
                    raise APIError('Unexpected row schema')
                if any(v is not None and (not isinstance(v, (int, float)) or not math.isfinite(v)) for v in row['metrics']):
                    raise APIError('Invalid numeric metric')
            rows.extend(chunk)
            total = obj.get('total_rows', len(rows))
            if len(rows) >= total:
                break
            if not chunk:
                raise APIError('Pagination stopped before total_rows')
            offset += len(chunk)
        return {'query': query, 'dimensions': dimensions, 'metrics': metrics,
                'totals': first['totals'], 'sampled': first.get('sampled', False),
                'sample_share': first.get('sample_share'), 'total_rows': first.get('total_rows'), 'data': rows}


def resolve_goals(goals):
    mapping = {}
    for identifier in EXPECTED_GOALS:
        candidates = [g for g in goals if g.get('type') == 'action' and g.get('conditions') and all(
            c.get('type') == 'exact' and c.get('url') == identifier for c in g['conditions'])]
        if any(g.get('name') == identifier and g not in candidates for g in goals):
            raise APIError('Goal named '+identifier+' is not an exact JavaScript event; fix its settings')
        if len(candidates) > 1:
            raise APIError('Ambiguous goal identifier: ' + identifier)
        gid=candidates[0]['id'] if candidates else None
        if gid is not None and (isinstance(gid,bool) or not isinstance(gid,int) or gid<=0):
            raise APIError('Invalid goal ID: '+identifier)
        mapping[identifier]=gid
    return mapping


def collect(client, start, end, mapping):
    reports = {}
    quality = ['ym:s:goal' + str(mapping[k]) + 'visits'
               for k in ('read_50', 'read_90', 'content_continue', 'map_action') if mapping.get(k)]
    for name, dimensions in REPORTS.items():
        metrics = BASE_METRICS + (quality if name in ('landings', 'utm') else [])
        reports[name] = client.report(start, end, dimensions, metrics)
    goal_metrics = [f'ym:s:goal{gid}{suffix}' for gid in mapping.values() if gid
                    for suffix in ('visits', 'reaches')]
    for index in range(0, len(goal_metrics), 20):
        reports['goals_' + str(index // 20)] = client.report(start, end, [], goal_metrics[index:index + 20])
    return {'schema_version': 1, 'counter_id': client.counter, 'start': start, 'end': end,
            'timezone': '+03:00', 'attribution': 'last', 'goals': mapping,
            'fetched_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
            'provisional': end >= (dt.datetime.now(ZoneInfo('Europe/Moscow')).date() - dt.timedelta(days=3)).isoformat(),
            'reports': reports}


def metric(report, name):
    return report['totals'][report['metrics'].index(name)]


def by_dimension(report):
    out = collections.defaultdict(float)
    i = report['metrics'].index('ym:s:visits')
    for row in report['data']:
        label = row['dimensions'][0].get('name') or '(не определено)'
        out[label] += row['metrics'][i]
    return out


def weekly_text(current, previous, missing):
    cur = metric(current['reports']['summary'], 'ym:s:visits')
    prev = metric(previous['reports']['summary'], 'ym:s:visits')
    pct = f'{(cur / prev - 1) * 100:+.1f}%' if prev else 'недоступно: прошлый период равен нулю'
    users = metric(current['reports']['summary'], 'ym:s:users')
    lines = ['# KRM РФ: недельная аналитика', '',
             f"{current['start']} — {current['end']} против {previous['start']} — {previous['end']}.", '',
             f'Визиты: {cur:g} против {prev:g}, разница {cur-prev:+g} ({pct}).',
             f'Уникальные посетители за текущую неделю: {users:g}. Получены за весь интервал, не суммой по дням.', '',
             '## Изменение источников', '', '| Источник | Было | Стало | Разница |', '|---|---:|---:|---:|']
    a = by_dimension(current['reports']['sources']); b = by_dimension(previous['reports']['sources'])
    for key in sorted(set(a) | set(b), key=lambda k: abs(a[k]-b[k]), reverse=True):
        lines.append(f'| {key.replace(chr(124), " ")} | {b[key]:g} | {a[key]:g} | {a[key]-b[key]:+g} |')
    a = by_dimension(current['reports']['landings']); b = by_dimension(previous['reports']['landings'])
    ordered = sorted(set(a) | set(b), key=lambda k: a[k]-b[k], reverse=True)
    lines += ['', '## Страницы входа', '', 'Рост визитов:']
    gains = [k for k in ordered if a[k] > b[k]][:5]
    lines += [f'- `{k}`: {a[k]:g}, изменение {a[k]-b[k]:+g}.' for k in gains] or ['- Страниц с ростом в этом сравнении нет.']
    lines += ['', 'Снижение визитов:']
    declines = [k for k in sorted(ordered, key=lambda k:a[k]-b[k]) if a[k] < b[k]][:5]
    lines += [f'- `{k}`: {a[k]:g}, изменение {a[k]-b[k]:+g}.' for k in declines] or ['- Страниц со снижением в этом сравнении нет.']
    lines += ['', '## Проверки и действия', '',
              '- Проверить изменившиеся источники и доступность страниц с падением. Разницы описывают наблюдения, не доказывают причину.',
              '- Сверить UTM размещений с реальными опубликованными ссылками. Наличие файла со ссылками не доказывает переходов.',
              '- Перед улучшением текста учесть возраст статьи и показы поисковой консоли. Эти данные сюда пока не подключены.',
              '- Последние три дня предварительные и будут загружены повторно. Недельные пользователи не суммируются по источникам.']
    if missing:
        lines += ['- Нет сопоставленных целей: ' + ', '.join(missing) + '. Значения не подменены нулями.']
    if prev >= 100 and cur < prev * .75:
        lines += ['- Сигнал: недельные визиты упали более чем на 25%. Нужна проверка спроса, счётчика и доступности.']
    return '\n'.join(lines) + '\n'


def anomaly(daily_dir, day):
    current_path = daily_dir / (day.isoformat() + '.json')
    current = json.loads(current_path.read_text())
    value = metric(current['reports']['summary'], 'ym:s:visits')
    history = []
    for weeks in range(1, 9):
        file = daily_dir / ((day - dt.timedelta(days=7 * weeks)).isoformat() + '.json')
        if file.exists():
            history.append(metric(json.loads(file.read_text())['reports']['summary'], 'ym:s:visits'))
    if len(history) < 6:
        return {'state': 'insufficient_history', 'same_weekday_samples': len(history)}
    median = statistics.median(history)
    mad = statistics.median(abs(x - median) for x in history)
    deviation = value - median
    flagged = abs(deviation) > max(50, 3.5 * 1.4826 * mad, .30 * median)
    return {'state': 'review' if flagged else 'within_heuristic_range', 'visits': value,
            'same_weekday_median': median, 'mad': mad, 'same_weekday_samples': len(history),
            'note': 'Heuristic signal, not a probability or a causal conclusion'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='.')
    parser.add_argument('--lookback', type=int, default=7)
    parser.add_argument('--end', help='Last COMPLETE Moscow day, YYYY-MM-DD')
    parser.add_argument('--extended',action='store_true',help='Refresh whole-period 28/28 and 90/90 comparisons')
    args = parser.parse_args()
    root = Path(args.root)
    today = dt.datetime.now(ZoneInfo('Europe/Moscow')).date()
    end = dt.date.fromisoformat(args.end) if args.end else today - dt.timedelta(days=1)
    if end >= today or not 1 <= args.lookback <= 400:
        raise APIError('Use past dates and lookback 1..400')
    client = Client(os.environ.get('METRIKA_OAUTH_TOKEN'), os.environ.get('METRIKA_COUNTER_ID', '110383043'))
    raw_goals = client.get('/management/v1/counter/' + client.counter + '/goals').get('goals', [])
    mapping = resolve_goals(raw_goals)
    missing = [k for k,v in mapping.items() if v is None]
    for delta in range(args.lookback-1, -1, -1):
        day = (end - dt.timedelta(days=delta)).isoformat()
        payload = collect(client, day, day, mapping)
        atomic_json(root/'data/daily'/(day+'.json'), payload)
    period_data = []
    for delta in (0, 7):
        finish = end - dt.timedelta(days=delta)
        begin = finish - dt.timedelta(days=6)
        payload = collect(client, begin.isoformat(), finish.isoformat(), mapping)
        atomic_json(root/'data/periods'/(begin.isoformat()+'_'+finish.isoformat()+'.json'), payload)
        period_data.append(payload)
    report = root/'reports/latest.md';report.parent.mkdir(parents=True,exist_ok=True)
    report.write_text(weekly_text(*period_data, missing), encoding='utf-8')
    if args.extended:
        for length in (28,90):
            pair=[]
            for delta in (0,length):
                finish=end-dt.timedelta(days=delta)
                begin=finish-dt.timedelta(days=length-1)
                payload=collect(client,begin.isoformat(),finish.isoformat(),mapping)
                atomic_json(root/'data/periods'/(begin.isoformat()+'_'+finish.isoformat()+'.json'),payload)
                pair.append(payload)
            text=weekly_text(*pair,missing).replace('недельная аналитика',f'аналитика за {length} дней').replace('за текущую неделю','за весь текущий период')
            (root/'reports'/f'last-{length}-days.md').write_text(text,encoding='utf-8')
    atomic_json(root/'data/health.json', {'last_success_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
        'latest_complete_day': end.isoformat(), 'counter_id': client.counter, 'missing_goals': missing,
        'anomaly': anomaly(root/'data/daily', end-dt.timedelta(days=3)) if (root/'data/daily'/((end-dt.timedelta(days=3)).isoformat()+'.json')).exists() else {'state':'insufficient_history'},
        'source': 'Metrica Reports API; aggregate data only'})
    print('Export completed; last complete day ' + end.isoformat())


if __name__ == '__main__':
    try:
        main()
    except APIError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
