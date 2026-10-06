import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('public',{recursive:true});
await writeFile('public/index.html','<!doctype html><meta charset="utf-8"><a href="https://struder659.github.io/narod-random/">Случайный Народ</a>');
