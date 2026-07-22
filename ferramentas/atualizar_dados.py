import zipfile, xml.etree.ElementTree as ET, re, posixpath, json, unicodedata
NS_MAIN='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
NS_REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships'

def col_num(c):
    n=0
    for ch in c: n=n*26+ord(ch)-64
    return n

def split_ref(ref):
    m=re.match(r'([A-Z]+)(\d+)$',ref)
    return col_num(m.group(1)), int(m.group(2))

def read_sheet(path, sheet_name, header_row=1):
    with zipfile.ZipFile(path) as z:
        shared=[]
        if 'xl/sharedStrings.xml' in z.namelist():
            root=ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall(f'{{{NS_MAIN}}}si'):
                shared.append(''.join((t.text or '') for t in si.iter(f'{{{NS_MAIN}}}t')))
        wb=ET.fromstring(z.read('xl/workbook.xml'))
        rels=ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        rmap={r.attrib['Id']:r.attrib['Target'] for r in rels}
        target=None
        for s in wb.find(f'{{{NS_MAIN}}}sheets'):
            if s.attrib['name']==sheet_name:
                rid=s.attrib[f'{{{NS_REL}}}id']; t=rmap[rid]
                target=t.lstrip('/') if t.startswith('/') else posixpath.normpath('xl/'+t)
        root=ET.fromstring(z.read(target))
        cells={}; maxr=maxc=0
        for row in root.find(f'{{{NS_MAIN}}}sheetData'):
            for c in row.findall(f'{{{NS_MAIN}}}c'):
                ref=c.attrib['r']; col,r=split_ref(ref); maxc=max(maxc,col); maxr=max(maxr,r)
                typ=c.attrib.get('t')
                if typ=='s':
                    v=c.find(f'{{{NS_MAIN}}}v'); val=shared[int(v.text)] if v is not None else ''
                elif typ=='inlineStr': val=''.join((t.text or '') for t in c.iter(f'{{{NS_MAIN}}}t'))
                else:
                    v=c.find(f'{{{NS_MAIN}}}v'); val=v.text if v is not None else ''
                cells[(r,col)]=val
        merges=root.find(f'{{{NS_MAIN}}}mergeCells')
        if merges is not None:
            for mc in merges:
                refs=mc.attrib['ref'].split(':'); a=refs[0]; b=refs[-1]
                c1,r1=split_ref(a); c2,r2=split_ref(b); val=cells.get((r1,c1),'')
                for rr in range(r1,r2+1):
                    for cc in range(c1,c2+1):
                        if not cells.get((rr,cc)): cells[(rr,cc)]=val
        headers=[(cells.get((header_row,c),'') or '').strip() for c in range(1,maxc+1)]
        rows=[]
        for r in range(header_row+1,maxr+1):
            row={headers[c-1] or f'COL{c}': (cells.get((r,c),'') or '').strip() for c in range(1,maxc+1)}
            row['_row']=r
            rows.append(row)
        return headers, rows

def norm_num(v):
    v=(v or '').strip()
    return v[:-2] if re.fullmatch(r'-?\d+\.0',v) else v

def build_items(af_path=None, em_path=None):
    configs=[
        ('Tecnologia e Inovação','/mnt/data/AF Escopo-sequência 2026.xlsx','Tecnologia e Inovação',1),
        ('Programação','/mnt/data/EM Escopo-sequência 2026.xlsx','Programação ',2),
    ]
    all_items=[]
    for componente,path,sheet,header in configs:
        headers, rows=read_sheet(path,sheet,header)
        # Map case-insensitively
        hm={h.upper():h for h in headers}
        def g(r,key): return r.get(hm.get(key.upper(),''),'')
        for r in rows:
            bim=g(r,'Bimestre') or g(r,'BIMESTRE')
            if bim not in ('3º','4º'):
                continue
            item={
                'id': f"{componente[:3].upper()}-{r['_row']}",
                'componente': componente,
                'ciclo': g(r,'Ciclo') or g(r,'CICLO'),
                'anoSerie': g(r,'ANO/SÉRIE'),
                'bimestre': bim,
                'semana': norm_num(g(r,'Semana') or g(r,'SEMANA')),
                'data': g(r,'Data') or g(r,'DATA'),
                'unidade': g(r,'Unidade') or g(r,'UNIDADE'),
                'aulaUnidade': norm_num(g(r,'Aula Unidade') or g(r,'AULA UNIDADE')),
                'aulaSala': norm_num(g(r,'Aula Sala') or g(r,'AULA SALA')),
                'titulo': g(r,'Título') or g(r,'TÍTULO'),
                'formato': g(r,'Formato de Aula') or g(r,'FORMATO DE AULA'),
                'objetivo': g(r,'Objetivo') or g(r,'OBJETIVO'),
                'conteudos': g(r,'Conteúdos') or g(r,'CONTEÚDOS'),
                'entregaProjeto': g(r,'Entrega de projeto') or g(r,'ENTREGA DE PROJETO'),
                'habCompCodigo': g(r,'Habilidade - BNCC Computação - código') or g(r,'HABILIDADE - BNCC COMPUTAÇÃO - CÓDIGO'),
                'habCompTexto': g(r,'Habilidade - BNCC Computação - texto') or g(r,'HABILIDADE - BNCC COMPUTAÇÃO - TEXTO'),
                'habBnccCodigo': g(r,'Habilidades - BNCC - código') or g(r,'HABILIDADE - BNCC - CÓDIGO'),
                'habBnccTexto': g(r,'Habilidades - BNCC - texto') or g(r,'HABILIDADE - BNCC - TEXTO'),
                'parametrosIF': g(r,'HABILIDADES BNCC PARÂMETROS IF (TEXTO)'),
                'fonte': path.split('/')[-1],
                'linhaFonte': r['_row'],
            }
            # Keep rows that have meaningful calendar or lesson content
            if not any(item[k] for k in ['unidade','titulo','objetivo','conteudos']):
                continue
            item['tipo']='aula' if item['titulo'] and (item['objetivo'] or item['conteudos']) else 'calendario'
            all_items.append(item)
    return all_items

if __name__=='__main__':
    import sys
    from pathlib import Path
    if len(sys.argv) < 3:
        raise SystemExit('Uso: python atualizar_dados.py <planilha_AF.xlsx> <planilha_EM.xlsx> [pasta_saida]')
    saida=Path(sys.argv[3] if len(sys.argv)>3 else '../dados')
    saida.mkdir(parents=True,exist_ok=True)
    items=build_items(sys.argv[1],sys.argv[2])
    (saida/'dados.json').write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf-8')
    (saida/'dados.js').write_text('window.DADOS_PEDAGOGICOS = '+json.dumps(items,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
    print(f'{len(items)} registros gravados em {saida.resolve()}')
