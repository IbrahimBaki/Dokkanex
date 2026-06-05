#!/usr/bin/env python3
"""Regenerate DokkanX app icons from logo-mark.svg."""

from pathlib import Path

ROOT  = Path(__file__).resolve().parent.parent
SVG   = ROOT / 'public/files/logo-mark.svg'
PNG   = ROOT / 'public/icons/logo-mark.png'
OUT   = ROOT / 'public/icons'
SIZES = [192, 512]
FILL  = 0.82  # logo fills 82% of canvas, ~9% padding each side

def inner(size): return int(size * FILL)
def offset(size): return (size - inner(size)) // 2

def with_cairosvg():
    import cairosvg
    from PIL import Image
    import io
    for size in SIZES:
        buf = io.BytesIO()
        cairosvg.svg2png(url=str(SVG), write_to=buf,
                         output_width=inner(size), output_height=inner(size))
        buf.seek(0)
        logo = Image.open(buf).convert('RGBA')
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        off = offset(size)
        canvas.paste(logo, (off, off), logo)
        canvas.save(OUT / f'icon-{size}.png')
        print(f'  icon-{size}.png  ✓  (cairosvg)')
    return True

def with_inkscape():
    import subprocess, tempfile, os
    from PIL import Image
    for size in SIZES:
        tmp_path = f'/tmp/icon-{size}-tmp.png'
        r = subprocess.run(
            ['inkscape', str(SVG), '--export-type=png',
             f'--export-filename={tmp_path}',
             f'--export-width={inner(size)}',
             f'--export-height={inner(size)}'],
            capture_output=True, timeout=30)
        if r.returncode != 0:
            return False
        logo = Image.open(tmp_path).convert('RGBA')
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        off = offset(size)
        canvas.paste(logo, (off, off), logo)
        canvas.save(OUT / f'icon-{size}.png')
        os.unlink(tmp_path)
        print(f'  icon-{size}.png  ✓  (inkscape)')
    return True

def with_pil():
    from PIL import Image
    src = Image.open(PNG).convert('RGBA')
    content = src.crop(src.getbbox())
    for size in SIZES:
        cw, ch = content.size
        s = inner(size)
        ratio = min(s / cw, s / ch)
        nw, nh = int(cw * ratio), int(ch * ratio)
        scaled = content.resize((nw, nh), Image.LANCZOS)
        canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        canvas.paste(scaled, ((size - nw) // 2, (size - nh) // 2), scaled)
        canvas.save(OUT / f'icon-{size}.png')
        print(f'  icon-{size}.png  ✓  (PIL scale-up)')

if __name__ == '__main__':
    print('Generating icons...')
    try:
        if not with_cairosvg():
            raise RuntimeError('cairosvg failed')
    except Exception as e:
        print(f'  cairosvg unavailable ({e}), trying inkscape...')
        try:
            if not with_inkscape():
                raise RuntimeError('inkscape failed')
        except Exception as e2:
            print(f'  inkscape unavailable ({e2}), falling back to PIL...')
            with_pil()
    print('Done.')
