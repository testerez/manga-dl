import * as cheerio from 'cheerio';
import * as url from 'url';
import * as minimist from 'minimist';
import * as process from 'process';
import * as fs from 'fs';
import * as archiver from 'archiver';
import * as http from 'http';
import { last } from 'lodash';
import fetch from 'node-fetch';
const argv = minimist(process.argv.slice(2));

const rootUrl = argv._[0];
if (!rootUrl) {
  throw new Error('You must provide an url');
}

// create a file to stream archive data to.
const output = fs.createWriteStream(__dirname + '/manga.cbz');
const archive = archiver('zip', {
    store: true // Sets the compression method to STORE.
});
output.on('close', function() {
  console.log(`Done!`);
});
archive.on('error', function(err: any) {
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

/**
 * Useful to log intermediatate result with `map` in a functional chain
 * Example: `.map(logReturn('intermediate:'))`
 */
const logReturn = (prefix: string) => (value: any) => {
  console.log(value);
  return value;
}

(async () => {
  try {
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
  } catch (e) {
    console.error(e);
  }
})();