import * as Crawler from 'crawler';
import 'cheerio';
import * as url from 'url';
import * as minimist from 'minimist';
import * as process from 'process';
import * as fs from 'fs';
import * as archiver from 'archiver';
import * as http from 'http';
import { last } from 'lodash';
const argv = minimist(process.argv.slice(2));

const rootUrl = argv._[0];

// create a file to stream archive data to.
const output = fs.createWriteStream(__dirname + '/manga.cbz');
const archive = archiver('zip', {
    store: true // Sets the compression method to STORE.
});
output.on('close', function() {
  console.log(`Done! - ${total} images downloaded`);
});
archive.on('error', function(err: any) {
  console.error(err);
});
archive.pipe(output);

let total = 0;
let pending = [] as Promise<any>[];
async function dlImage(url: string, name: string, isLast: boolean) {
  total++;
  pending.push(new Promise(resolve => {
    http.get(url, response => {
      archive.append(response as any, { name });
      resolve();
    });
  }))
  if (isLast) {
    await Promise.all(pending);
    archive.finalize();
  }
}

const c = new Crawler({
  maxConnections: 5,
  onDrain: function (pool: any) {
    c.pool.destroyAllNow();
  },
    callback : function (error: any, result: any, $: CheerioAPI) {
        if(error){
          console.error(error);
          return;
        }
      
        const nextUrl = $('a.next_page').attr('href');
        const hasNext = nextUrl && /\d+\.html/.test(nextUrl);
        if (hasNext) {
          c.queue(url.resolve(result.uri, nextUrl));
        }

        const imgUrl = $('img#image').attr('src');
        dlImage(
          url.resolve(result.uri, imgUrl),
          last(imgUrl.split('/')),
          !hasNext
        );
    }
});

c.queue(rootUrl);