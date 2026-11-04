#!/usr/bin/env python3
"""python3 tools/stamp.py <YYYYMMDD> <letter>: stamps a release. Sets the visible build label and cache-busts EVERY module
(an import map maps each src/*.js to ?v=<stamp>), so browsers can never mix old cached code with the new page."""
import os, re, sys, glob
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
day = sys.argv[1]; letter = sys.argv[2]; stamp = day + letter      # e.g. stamp.py 20261104 a
p = os.path.join(root, 'index.html'); s = open(p).read()
s = re.sub(r'build 20\d\d-\d\d-\d\d [a-z]+', 'build %s-%s-%s %s' % (day[:4], day[4:6], day[6:], letter), s)
files = sorted(os.path.relpath(f, root).replace(os.sep, '/') for f in glob.glob(os.path.join(root, 'src', '**', '*.js'), recursive=True))
imports = {'three': './vendor/three/three.module.min.js', 'three/addons/': './vendor/three/addons/'}
for f in files: imports['./' + f] = './' + f + '?v=' + stamp
im = '<script type="importmap">' + __import__('json').dumps({'imports': imports}, separators=(',', ':')) + '</script>'
s = re.sub(r'<script type="importmap">.*?</script>', lambda m: im, s, count=1, flags=re.S)
s = re.sub(r'src/loader\.js\?v=[0-9a-z]+', 'src/loader.js?v=' + stamp, s)
s = re.sub(r'src/main\.js\?v=[0-9a-z]+', 'src/main.js?v=' + stamp, s)
open(p, 'w').write(s); print('stamped', stamp, len(files), 'modules')
