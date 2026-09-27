#!/usr/bin/env python3
"""Activate up to five editorial photos only when their files exist. Stdlib + system ImageMagick."""
from pathlib import Path
import json, re, subprocess, shutil, sys
from html import escape

ROOT=Path(__file__).resolve().parents[1] if Path(__file__).parent.name=='tools' else Path.cwd()
IMG=ROOT/'assets/img/assessment/2026-09-27'
HTML=ROOT/'assessment/2026-09-27/index.html'
PAGES=ROOT/'data/pages.json'
PHOTOS={
 'COVER':('cover','Общая иллюстрация к оценке Восточного ТВД на утро 27 сентября 2026 года','Восточный ТВД, 21–27 сентября 2026 года. Иллюстрация редакции.'),
 'KUPYANSK':('kupyansk','Иллюстрация Купянского направления за 21–27 сентября 2026 года','Купянское направление. Иллюстрация редакции к недельной оценке.'),
 'BOROVAYA':('borovaya','Иллюстрация Боровского направления за 21–27 сентября 2026 года','Боровское направление. Иллюстрация редакции к недельной оценке.'),
 'KRASNYLIMAN':('krasnyi-liman','Иллюстрация Краснолиманского направления за 21–27 сентября 2026 года','Краснолиманское направление. Иллюстрация редакции к недельной оценке.'),
 'SLAVYANSK':('slavyansk','Иллюстрация Славянского направления за 21–27 сентября 2026 года','Славянское направление. Иллюстрация редакции к недельной оценке.')}

def magick_cmd():
 if shutil.which('convert'):return ['convert']
 if shutil.which('magick'):return ['magick']
 return None

def size(file):
 cmd=['identify'] if shutil.which('identify') else ['magick','identify'] if shutil.which('magick') else None
 if cmd:
  r=subprocess.run([*cmd,'-ping','-format','%w %h',str(file)],capture_output=True,text=True,check=True)
  return tuple(int(x) for x in r.stdout.split())
 # No ImageMagick: retain native file dimensions by omitting width/height;
 # users can install ImageMagick, but existing WebP should still work.
 return None

def main():
 if not HTML.exists() or not PAGES.exists():raise SystemExit('Сначала установите основной патч оценки за 27 сентября.')
 imgdir=IMG;imgdir.mkdir(parents=True,exist_ok=True)
 html=HTML.read_text(encoding='utf-8');pages=json.loads(PAGES.read_text(encoding='utf-8'))
 page=next((x for x in pages if x['url']=='/assessment/2026-09-27/'),None)
 if page is None:raise SystemExit('Нет записи оценки в data/pages.json')
 installed=[]
 for key,(name,alt,caption) in PHOTOS.items():
  target=imgdir/(name+'.webp')
  if not target.is_file():
   candidates=[imgdir/(name+ext) for ext in ('.jpg','.jpeg','.png') if (imgdir/(name+ext)).is_file()]
   if candidates:
    command=magick_cmd()
    if command is None:raise SystemExit('Для преобразования JPG/PNG нужен ImageMagick: sudo apt-get install imagemagick')
    subprocess.run([*command,str(candidates[0]),'-auto-orient','-strip','-quality','85',str(target)],check=True)
  marker=r'(<!-- KRM PHOTO '+key+r' START -->)[\s\S]*?(<!-- KRM PHOTO '+key+r' END -->)'
  if not re.search(marker,html):raise SystemExit('Не найден маркер фото '+key+'. Файл статьи, возможно, изменён вручную.')
  if target.is_file():
   dim=size(target)
   w_h=f' width="{dim[0]}" height="{dim[1]}"' if dim else ''
   loading='eager' if key=='COVER' else 'lazy'
   priority=' fetchpriority="high"' if key=='COVER' else ''
   url='/assets/img/assessment/2026-09-27/'+target.name
   block=f'\n<figure><img src="{url}" alt="{escape(alt,quote=True)}" loading="{loading}" decoding="async"{priority}{w_h}/><figcaption>{escape(caption)}</figcaption></figure>\n'
   installed.append(target.name)
  else:block=''
  html=re.sub(marker,lambda m:m.group(1)+block+m.group(2),html,count=1)
 if (imgdir/'cover.webp').is_file():
  page['image']='/assets/img/assessment/2026-09-27/cover.webp'
  page['imageAlt']=PHOTOS['COVER'][1]
 else:
  page['image']='/assets/img/og-home.jpg'
  page['imageAlt']='Общая иллюстрация сайта KRM РФ'
 # Update JSON only if its values actually changed, so running this repeatedly is harmless.
 if HTML.read_text(encoding='utf-8')!=html:HTML.write_text(html,encoding='utf-8')
 p=json.dumps(pages,ensure_ascii=False,indent=2)+'\n'
 if PAGES.read_text(encoding='utf-8')!=p:PAGES.write_text(p,encoding='utf-8')
 print('Фото подключены:',', '.join(installed) if installed else 'пока нет, разметка остаётся без битых изображений')
 return 0
if __name__=='__main__':sys.exit(main())
