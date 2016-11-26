import * as cheerio from 'cheerio';
import * as url from 'url';
import * as minimist from 'minimist';
import * as process from 'process';
import * as fs from 'fs';
import * as archiver from 'archiver';
import * as http from 'http';
import { last } from 'lodash';
import fetch from 'node-fetch';
import * as path from 'path';
const argv = minimist(process.argv.slice(2));

/**
 * Useful to log intermediatate result with `map` in a functional chain
 * Example: `.map(logReturn('intermediate:'))`
 */
const logReturn = (prefix: string) => (value: any) => {
  console.log(value);
  return value;
}

function getChapterNameFromUrl(url: string) {
  const match = new RegExp('http://mangafox.me/manga/(.+)/[^/+].html').exec(url);
  if (!match) {
    throw new Error('This is not a valid URL');
  }
  return match[1].replace(/\//g, '-');
}

async function getPage(url: string) {
  const resp = await fetch(url);
  const html = await resp.text();
  return cheerio.load(html);
}

async function extractImageUrl(pageUrl: string) {
  const $ = await getPage(pageUrl);
  const relativeUrl = $('img#image').attr('src');
  return relativeUrl
    ? url.resolve(pageUrl, relativeUrl)
    : null;
}

async function fetchText(pageUrl: string) {
  const response = await fetch(pageUrl);
  return await response.text();
}

async function extractChaptersUrls(pageUrl: string) {
  const pageContent = await fetchText(pageUrl);
  const match = new RegExp('/media/js/list\\.\\d+\\.js').exec(pageContent);
  if (!match) {
    throw new Error('Does not seam like a chapter page...');
  }
  const scriptUrl = url.resolve(pageUrl, match[0]);
  const scriptContent = await fetchText(scriptUrl);
  const arrayContent = new RegExp('var chapter_list = new Array\\(([^)]+)')
    .exec(scriptContent)![1];
  return JSON.parse(`[${arrayContent}]`)
    .map((arr: any) => `../${arr[1]}/1.html`)
    .map((s: any) => url.resolve(pageUrl, s)) as string[];
}

async function dlChapter(pageUrl: string) {
  const fileName = `${getChapterNameFromUrl(pageUrl)}.cbz`;

  // create a file to stream archive data to.
  const output = fs.createWriteStream(
    path.join(__dirname, fileName)
  );
  const archive = archiver('zip', {
      store: true // Sets the compression method to STORE.
  });
  output.on('close', () => {
    console.log(`Created ${fileName}`);
  });
  archive.on('error', (err: any) => {
    console.error(err);
  });
  archive.pipe(output);

  async function dlImage(url: string) {
    console.log(`downloading ${url}`);
    const name = last(url.split('/'));
    return new Promise(resolve => {
      http.get(url, response => {
        archive.append(response as any, { name });
        resolve();
      });
    })
  }

  const $ = await getPage(rootUrl);
  const imageUrls = await Promise.all($('select.m')
    .eq(0)
    .find('option')
    .get()
    .map(o => $(o).attr('value'))
    .filter(s => s != '0')
    .map(s => url.resolve(rootUrl, `${s}.html`))
    .map(extractImageUrl)
  );
  await Promise.all(imageUrls
    .filter(url => url)
    .map(dlImage)
  );
  archive.finalize();
}

function wait(ms: number) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function dlAllChapters(pageUrl: string) {
  const chaptersUrls = await extractChaptersUrls(pageUrl);
  // dl chapters one by one
  for (const cUrl of chaptersUrls) {
    await dlChapter(cUrl);
    await wait(10000); // quick fix to avoid kickoff
  }
  console.log(`Done downloading ${chaptersUrls.length} chapters!`);
} 


// ===============================
// Execute command
// ===============================

(async function () {
  try {
    const rootUrl = argv._[0];
    if (!rootUrl) {
      throw new Error('You must provide an url');
    }
    await dlAllChapters(rootUrl);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();


