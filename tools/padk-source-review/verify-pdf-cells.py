#!/usr/bin/env python3
"""Cross-check 540 source cells against a local PADK PDF (machine-only, fail-closed).

Requires: python -m pip install pdfplumber
Never imports a reviewer verdict, approves a mapping, or validates OJK provenance.
"""
import argparse
import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

try:
    import pdfplumber
except ImportError as error:
    raise SystemExit("Dependensi: python -m pip install pdfplumber") from error

TABLES = [('K1', 135, 146, 5, 80),
          ('K2', 147, 156, 5, 60),
          ('T3', 157, 198, 7, 80)]

def normalized(value):
    return re.sub(r'[^\w]+', '', unicodedata.normalize('NFKC', str(value)).lower(),
                  flags=re.UNICODE)

def read_source(path):
    raw = json.loads(Path(path).read_text(encoding='utf-8'))
    if 'records' in raw and 'sourcePdfSha256' in raw:
        return raw
    # Backward-compatible with the portable offline audit bundle.
    if 'metadata' not in raw or 'rows' not in raw:
        raise ValueError('Format JSON transkripsi tidak dikenal')
    rows = [{
        'id': row['rowId'],
        'kind': row['category'],
        'indicator': row['number'],
        'rank': int(row['rank']) if row['rank'] not in ('', None) else None,
        'physicalPdfPages': [int(n) for n in row['pdfPages'].split(',')],
        'parameterText': row['sourceParameter'],
        'criterionText': row['sourceCriteria'],
    } for row in raw['rows']]
    return {'sourcePdfSha256': raw['metadata']['pdfSha256'], 'records': rows}

def collect(pdf):
    data, anomalies = {}, []
    with pdfplumber.open(pdf) as doc:
        if len(doc) != 225:
            anomalies.append('PDF bukan 225 halaman')
        for kind, start, end, columns, expected in TABLES:
            items, current = {}, None
            for page in range(start, end + 1):
                tables = doc.pages[page-1].find_tables()
                if len(tables) != 1:
                    anomalies.append(f'{page}: terdeteksi {len(tables)} tabel')
                    continue
                for index, cells in enumerate(tables[0].extract()):
                    if len(cells) != columns:
                        anomalies.append(f'{page}: kolom {len(cells)}, diharapkan {columns}')
                        continue
                    marker = (cells[0] or '').strip()
                    if re.fullmatch(r'\d{1,2}', marker):
                        number = int(marker)
                        if number < 1 or number > expected or number in items:
                            anomalies.append(f'{page}: nomor {number} tidak valid/berulang')
                            continue
                        current = number
                        items[number] = {'pages': [], 'columns': [[] for _ in cells]}
                    elif index <= (1 if kind == 'T3' else 0):
                        continue
                    elif current is None:
                        anomalies.append(f'{page}: sambungan tanpa nomor')
                        continue
                    item = items[current]
                    if page not in item['pages']:
                        item['pages'].append(page)
                    for column, cell in enumerate(cells):
                        if cell:
                            item['columns'][column].append(cell)
            if len(items) != expected:
                anomalies.append(f'{kind}: ditemukan {len(items)} dari {expected} nomor')
            data[kind] = items
    return data, anomalies

def run(pdf, source_path):
    path = Path(pdf)
    source = read_source(source_path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != source['sourcePdfSha256']:
        raise ValueError('SHA-256 PDF tidak cocok dengan transkripsi')
    tables, anomalies = collect(path)
    seen = set()
    results = Counter()
    mismatches = []
    for row in source['records']:
        key = row['id']
        if key in seen:
            anomalies.append(f'ID sumber berulang: {key}')
            continue
        seen.add(key)
        kind, number, rank = row['kind'], row['indicator'], row['rank']
        item = tables.get(kind, {}).get(number)
        column = 2 + rank - 1 if kind == 'T3' else 3
        actual = '' if item is None else ' '.join(item['columns'][column])
        expected = row['criterionText'] if kind == 'T3' else row['parameterText']
        match = item is not None and normalized(actual) == normalized(expected) \
            and item['pages'] == row['physicalPdfPages']
        status = 'MATCH_CELL_ORDERED_NORMALIZED' if match else 'MISMATCH'
        results[status] += 1
        if not match:
            mismatches.append({'id': key,
                'pdfPages': [] if item is None else item['pages'],
                'draftPages': row['physicalPdfPages']})
    if len(source['records']) != 540:
        anomalies.append('Transkripsi bukan 540 baris')
    counts = Counter(row['kind'] for row in source['records'])
    if counts != Counter({'K1':80,'K2':60,'T3':400}):
        anomalies.append('Distribusi K1/K2/T3 tidak lengkap')
    return {
        'sourcePdfSha256': digest,
        'status': 'MACHINE_CHECK_NOT_INDEPENDENT_HUMAN_REVIEW',
        'method': 'pdfplumber table cells + NFKC ordered alphanumeric',
        'counts': dict(results),
        'anomalies': anomalies,
        'mismatches': mismatches,
        'approvedForRegulatoryUse': False,
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-pdf', required=True)
    parser.add_argument('--source-json', required=True)
    args = parser.parse_args()
    try:
        report = run(args.source_pdf, args.source_json)
    except (ValueError, KeyError, IndexError, OSError) as error:
        print('BLOCKED: ' + str(error), file=sys.stderr)
        return 1
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return int(bool(report['anomalies'] or report['mismatches']))

if __name__ == '__main__':
    sys.exit(main())
